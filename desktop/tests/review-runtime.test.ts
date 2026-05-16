const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
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

  const childProcessMock = {
    execFile: (file, args, optionsOrCallback, maybeCallback) => {
      const callback =
        typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
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
    },
    async () => {
      exports = require(reviewRuntimePath);
    },
  );

  const { ReviewRuntimeManager } = exports;
  const backendManager = {
    requests: [],
    async request(targetPath, requestOptions) {
      this.requests.push({ targetPath, options: requestOptions });
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
      if (targetPath === "/api/review/chat") {
        if (options.failReviewChat) {
          throw new Error(String(options.failReviewChat));
        }
        return {
          response: "Vertex review chat reply",
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
          schema_version: 2,
          google_project_id: "git-odyssey-test",
          google_location: "us-central1",
          capabilities: {
            text_generation: {
              target_kind: "managed_model",
              resource_name: "publishers/google/models/gemini-2.5-flash",
              display_name: "Gemini 2.5 Flash",
              publisher: "google",
              version: "2.5",
              location: "us-central1",
              capabilities: ["text_generation"],
              adapter_family: "gemini",
              embedding_output_dimension: null,
              source: "managed_api_model",
            },
            embeddings: null,
            review: {
              target_kind: "managed_model",
              resource_name: "publishers/google/models/gemini-2.5-pro",
              display_name: "Gemini 2.5 Pro",
              publisher: "google",
              version: "2.5",
              location: "us-central1",
              capabilities: ["review"],
              adapter_family: "gemini",
              embedding_output_dimension: null,
              source: "managed_api_model",
            },
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
	};
}

function buildGoogleTarget() {
  return {
    target_kind: "managed_model",
    resource_name: "publishers/google/models/gemini-2.5-pro",
    display_name: "Gemini 2.5 Pro",
    publisher: "google",
    version: "2.5",
    location: "us-central1",
    capabilities: ["review"],
    adapter_family: "gemini",
    embedding_output_dimension: null,
    source: "managed_api_model",
  };
}

test("review chat forwards target overrides to the backend", async () => {
  const harness = await loadReviewRuntimeHarness();
  const targetOverride = buildGoogleTarget();

  const response = await harness.manager.sendReviewChatMessage({
    sessionId: "session-1",
    targetOverride,
    runId: null,
    message: "Explain the diff",
    codeContexts: [],
    findingContexts: [],
    messages: [],
    reviewContext: null,
  });

  assert.equal(response.response, "Vertex review chat reply");
  assert.deepEqual(harness.backendManager.requests[0], {
    targetPath: "/api/review/chat",
    options: {
      method: "POST",
      body: {
        sessionId: "session-1",
        targetOverride,
        runId: null,
        message: "Explain the diff",
        codeContexts: [],
        findingContexts: [],
        messages: [],
        reviewContext: null,
        target_override: targetOverride,
      },
	    },
	  });
});

test("review chat surfaces backend failures", async () => {
  const harness = await loadReviewRuntimeHarness({
    failReviewChat: "Vertex chat validation failed",
  });

  await assert.rejects(
    () =>
      harness.manager.sendReviewChatMessage({
        sessionId: "session-1",
        targetOverride: buildGoogleTarget(),
        runId: null,
        message: "Now fail",
        codeContexts: [],
        findingContexts: [],
        messages: [],
        reviewContext: null,
      }),
    /Vertex chat validation failed/,
  );
});
