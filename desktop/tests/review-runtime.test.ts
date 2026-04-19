const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { EventEmitter } = require("node:events");
const Module = require("node:module");

function withMockedModuleLoads(mocks, fn) {
  const originalLoad = Module._load;
  Module._load = function mockLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      Module._load = originalLoad;
    });
}

async function loadReviewRuntimeHarness(options = {}) {
  const reviewRuntimePath = path.join(__dirname, "..", "src", "review-runtime.ts");
  delete require.cache[require.resolve(reviewRuntimePath)];

  const execFileCalls = [];
  let threadCounter = 0;
  let turnCounter = 0;
  const clientRequests = [];
  const failuresByModel = new Map(
    Object.entries(options.failuresByModel ?? {}).map(([modelId, error]) => [
      modelId,
      error instanceof Error ? error : new Error(String(error)),
    ]),
  );

  class MockCodexAppServerClient extends EventEmitter {
    constructor() {
      super();
    }

    async start() {
      return undefined;
    }

    async request(method, params) {
      clientRequests.push({ method, params });

      if (method === "thread/start") {
        const failure = failuresByModel.get(params.model ?? "");
        if (failure) {
          throw failure;
        }

        threadCounter += 1;
        return {
          thread: {
            id: `thread-${threadCounter}`,
          },
          model: params.model ?? null,
          modelProvider: params.modelProvider ?? null,
        };
      }

      if (method === "turn/start") {
        turnCounter += 1;
        const turnId = `turn-${turnCounter}`;
        const threadId = params.threadId;
        const prompt = String(params.input?.[0]?.text ?? "");
        const isBootstrap = prompt.includes("Reply exactly with READY.");
        const responseText = isBootstrap
          ? "READY"
          : `assistant reply for ${prompt.includes("## User Message") ? "chat" : "turn"}`;

        queueMicrotask(() => {
          this.emit("notification", {
            method: "item/completed",
            params: {
              threadId,
              turnId,
              item: {
                type: "agentMessage",
                id: `item-${turnId}`,
                text: responseText,
              },
            },
          });
          this.emit("notification", {
            method: "turn/completed",
            params: {
              threadId,
              turn: {
                id: turnId,
                status: "completed",
              },
            },
          });
        });

        return {
          turn: {
            id: turnId,
            status: "running",
          },
        };
      }

      throw new Error(`Unexpected Codex client request: ${method}`);
    }

    async stop() {
      return undefined;
    }
  }

  const childProcessMock = {
    execFile: (file, args, optionsOrCallback, maybeCallback) => {
      const callback =
        typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
      execFileCalls.push({ file, args: args ?? [] });
      callback?.(null, "", "");
    },
    spawn: () => {
      throw new Error("spawn should not be used in these review runtime tests.");
    },
  };

  const fsMock = {
    mkdirSync() {},
    rmSync() {},
  };

  let exports;
  await withMockedModuleLoads(
    {
      "node:child_process": childProcessMock,
      "node:fs": fsMock,
      "./codex-app-server-client": {
        CodexAppServerClient: MockCodexAppServerClient,
      },
    },
    async () => {
      exports = require(reviewRuntimePath);
    },
  );

  const { ReviewRuntimeManager } = exports;
  const backendManager = {
    requests: [],
    async request(targetPath) {
      this.requests.push(targetPath);
      if (targetPath === "/api/review/sessions/session-1") {
        return {
          id: "session-1",
          repo_path: "/tmp/example-repo",
          target_mode: "compare",
          base_ref: "main",
          head_ref: "feature",
          merge_base_sha: "merge-base",
          head_head_sha: "head-sha",
          stats: {
            files_changed: 3,
            additions: 10,
            deletions: 4,
          },
        };
      }

      throw new Error(`Unexpected backend request: ${targetPath}`);
    },
  };
  const configStore = {
    getState() {
      return {
        dataDir: "/tmp/git-odyssey-data",
        aiRuntimeConfig: {
          schema_version: 1,
          profiles: [],
          capabilities: {
            text_generation: {
              provider_profile_id: "openai-default",
              model_id: "gpt-5.4-mini",
              temperature: 0.2,
            },
            embeddings: null,
          },
        },
      };
    },
  };
  const keychain = {
    async getSecret() {
      return null;
    },
  };
  const manager = new ReviewRuntimeManager({
    app: {
      getVersion: () => "0.1.0-test",
    },
    backendManager,
    configStore,
    keychain,
  });

  return {
    manager,
    backendManager,
    clientRequests,
    execFileCalls,
  };
}

test("review chat creates threads with the requested model id", async () => {
  const harness = await loadReviewRuntimeHarness();

  const response = await harness.manager.sendReviewChatMessage({
    sessionId: "session-1",
    modelId: "gpt-5.4",
    runId: null,
    message: "Explain the diff",
    codeContexts: [],
    findingContexts: [],
    messages: [],
    reviewContext: null,
  });

  assert.equal(response.response, "assistant reply for chat");
  assert.equal(
    harness.clientRequests.filter((request) => request.method === "thread/start").length,
    1,
  );
  assert.equal(harness.clientRequests[0].params.model, "gpt-5.4");
});

test("review chat reuses the existing thread when the model id is unchanged", async () => {
  const harness = await loadReviewRuntimeHarness();

  await harness.manager.sendReviewChatMessage({
    sessionId: "session-1",
    modelId: "gpt-5.4-mini",
    runId: null,
    message: "First question",
    codeContexts: [],
    findingContexts: [],
    messages: [],
    reviewContext: null,
  });
  await harness.manager.sendReviewChatMessage({
    sessionId: "session-1",
    modelId: "gpt-5.4-mini",
    runId: null,
    message: "Second question",
    codeContexts: [],
    findingContexts: [],
    messages: [],
    reviewContext: null,
  });

  assert.equal(
    harness.clientRequests.filter((request) => request.method === "thread/start").length,
    1,
  );
  assert.equal(
    harness.clientRequests.filter((request) => request.method === "turn/start").length,
    3,
  );
});

test("review chat resets and re-primes the thread when the model id changes", async () => {
  const harness = await loadReviewRuntimeHarness();

  await harness.manager.sendReviewChatMessage({
    sessionId: "session-1",
    modelId: "gpt-5.4-mini",
    runId: null,
    message: "First question",
    codeContexts: [],
    findingContexts: [],
    messages: [
      {
        role: "user",
        content: "Earlier transcript",
      },
    ],
    reviewContext: null,
  });
  await harness.manager.sendReviewChatMessage({
    sessionId: "session-1",
    modelId: "gpt-5.4",
    runId: null,
    message: "Switch models",
    codeContexts: [],
    findingContexts: [],
    messages: [
      {
        role: "assistant",
        content: "Persist this context",
      },
    ],
    reviewContext: null,
  });

  const threadStarts = harness.clientRequests.filter(
    (request) => request.method === "thread/start",
  );
  const turnStarts = harness.clientRequests.filter(
    (request) => request.method === "turn/start",
  );

  assert.equal(threadStarts.length, 2);
  assert.deepEqual(
    threadStarts.map((request) => request.params.model),
    ["gpt-5.4-mini", "gpt-5.4"],
  );
  assert.equal(turnStarts.length, 4);
  assert.ok(
    harness.execFileCalls.some(
      (call) =>
        call.file === "git" &&
        Array.isArray(call.args) &&
        call.args[0] === "worktree" &&
        call.args[1] === "remove",
    ),
  );
});

test("review chat surfaces model-switch reinitialization failures", async () => {
  const harness = await loadReviewRuntimeHarness({
    failuresByModel: {
      "gpt-5.4": "thread start failed for gpt-5.4",
    },
  });

  await harness.manager.sendReviewChatMessage({
    sessionId: "session-1",
    modelId: "gpt-5.4-mini",
    runId: null,
    message: "Warm the thread",
    codeContexts: [],
    findingContexts: [],
    messages: [],
    reviewContext: null,
  });

  await assert.rejects(
    () =>
      harness.manager.sendReviewChatMessage({
        sessionId: "session-1",
        modelId: "gpt-5.4",
        runId: null,
        message: "Now fail",
        codeContexts: [],
        findingContexts: [],
        messages: [],
        reviewContext: null,
      }),
    /thread start failed for gpt-5.4/,
  );
});
