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

test("preload exposes review IPC bridge methods", async () => {
  const exposed = {};
  const invocations = [];
  const listeners = [];
  const preloadPath = path.join(__dirname, "..", "src", "preload.ts");

  delete require.cache[require.resolve(preloadPath)];

  await withMockedModuleLoads(
    {
      electron: {
        contextBridge: {
          exposeInMainWorld: (key, value) => {
            exposed[key] = value;
          },
        },
        ipcRenderer: {
          invoke: (...args) => {
            invocations.push(args);
            return Promise.resolve(null);
          },
          on: (...args) => {
            listeners.push(args);
          },
          removeListener: () => {},
        },
      },
    },
    async () => {
      require(preloadPath);
    }
  );

  const input = {
    repoPath: "/tmp/example-repo",
    targetMode: "compare",
    baseRef: "main",
    headRef: "feature",
    contextLines: 5,
  };

  await exposed.gitOdysseyDesktop.api.compareReviewTarget(input);
  await exposed.gitOdysseyDesktop.api.generateReview(input);
  await exposed.gitOdysseyDesktop.api.createReviewSession(input);
  await exposed.gitOdysseyDesktop.api.getReviewSession("rev_sess_123");
  await exposed.gitOdysseyDesktop.api.getReviewHistory({
    repoPath: "/tmp/example-repo",
    targetMode: "compare",
    baseRef: "main",
    headRef: "feature",
  });
  await exposed.gitOdysseyDesktop.api.startReviewRun({
    sessionId: "rev_sess_123",
    customInstructions: "Focus on bugs",
  });
  await exposed.gitOdysseyDesktop.api.sendReviewChatMessage({
    sessionId: "rev_sess_123",
    runId: null,
    message: "Explain the diff",
    codeContexts: [],
    messages: [],
    reviewContext: null,
  });
  await exposed.gitOdysseyDesktop.api.getReviewRun({
    sessionId: "rev_sess_123",
    runId: "rev_run_456",
  });
  await exposed.gitOdysseyDesktop.api.cancelReviewRun({
    sessionId: "rev_sess_123",
    runId: "rev_run_456",
  });
  await exposed.gitOdysseyDesktop.api.respondReviewApproval({
    sessionId: "rev_sess_123",
    runId: "rev_run_456",
    approvalId: "approval_1",
    decision: "accept",
  });
  await exposed.gitOdysseyDesktop.settings.getAdditionalReviewGuidelines(
    "/tmp/example-repo"
  );
  await exposed.gitOdysseyDesktop.settings.saveAdditionalReviewGuidelines({
    repoPath: "/tmp/example-repo",
    draftGuideline: "Draft guideline",
    guidelines: [
      {
        id: "guideline-1",
        text: "Persist me",
      },
    ],
  });
  await exposed.gitOdysseyDesktop.settings.saveReviewSettings({
    pullRequestGuidelines: "Focus on auth",
  });
  await exposed.gitOdysseyDesktop.settings.saveAiProfile({
    name: "Local runtime",
    config: {
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
    secretValues: {},
  });
  await exposed.gitOdysseyDesktop.settings.deleteAiProfile("profile_123");
  const unsubscribe = exposed.gitOdysseyDesktop.review.onEvent(() => {});
  unsubscribe();

  assert.deepEqual(invocations[0], ["git-odyssey:api:compare-review-target", input]);
  assert.deepEqual(invocations[1], ["git-odyssey:api:generate-review", input]);
  assert.deepEqual(invocations[2], ["git-odyssey:api:create-review-session", input]);
  assert.deepEqual(invocations[3], ["git-odyssey:api:get-review-session", "rev_sess_123"]);
  assert.deepEqual(invocations[4], [
    "git-odyssey:api:get-review-history",
    {
      repoPath: "/tmp/example-repo",
      targetMode: "compare",
      baseRef: "main",
      headRef: "feature",
    },
  ]);
  assert.deepEqual(invocations[5], [
    "git-odyssey:api:start-review-run",
    {
      sessionId: "rev_sess_123",
      customInstructions: "Focus on bugs",
    },
  ]);
  assert.deepEqual(invocations[6], [
    "git-odyssey:api:send-review-chat-message",
    {
      sessionId: "rev_sess_123",
      runId: null,
      message: "Explain the diff",
      codeContexts: [],
      messages: [],
      reviewContext: null,
    },
  ]);
  assert.deepEqual(invocations[7], [
    "git-odyssey:api:get-review-run",
    {
      sessionId: "rev_sess_123",
      runId: "rev_run_456",
    },
  ]);
  assert.deepEqual(invocations[8], [
    "git-odyssey:api:cancel-review-run",
    {
      sessionId: "rev_sess_123",
      runId: "rev_run_456",
    },
  ]);
  assert.deepEqual(invocations[9], [
    "git-odyssey:api:respond-review-approval",
    {
      sessionId: "rev_sess_123",
      runId: "rev_run_456",
      approvalId: "approval_1",
      decision: "accept",
    },
  ]);
  assert.deepEqual(invocations[10], [
    "git-odyssey:settings:get-additional-review-guidelines",
    "/tmp/example-repo",
  ]);
  assert.deepEqual(invocations[11], [
    "git-odyssey:settings:save-additional-review-guidelines",
    {
      repoPath: "/tmp/example-repo",
      draftGuideline: "Draft guideline",
      guidelines: [
        {
          id: "guideline-1",
          text: "Persist me",
        },
      ],
    },
  ]);
  assert.deepEqual(invocations[12], [
    "git-odyssey:settings:save-review-settings",
    {
      pullRequestGuidelines: "Focus on auth",
    },
  ]);
  assert.deepEqual(invocations[13], [
    "git-odyssey:settings:save-ai-profile",
    {
      name: "Local runtime",
      config: {
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
      secretValues: {},
    },
  ]);
  assert.deepEqual(invocations[14], [
    "git-odyssey:settings:delete-ai-profile",
    "profile_123",
  ]);
  assert.equal(listeners[0][0], "git-odyssey:review:event");
});

test("main process review handlers forward requests to the backend", async () => {
  const handlers = new Map();
  let backendManagerInstance = null;
  let repoSyncWatcherInstance = null;
  let reviewRuntimeManagerInstance = null;
  let reviewGuidelinesStoreInstance = null;
  let createdWindowOptions = null;
  const mainPath = path.join(__dirname, "..", "src", "main.ts");

  delete require.cache[require.resolve(mainPath)];

  class MockBrowserWindow {
    constructor(options) {
      createdWindowOptions = options;
      this.webContents = {
        setWindowOpenHandler() {},
        openDevTools() {},
      };
    }

    loadURL() {
      return Promise.resolve();
    }

    loadFile() {
      return Promise.resolve();
    }
  }

  MockBrowserWindow.getAllWindows = () => [];

  class MockConfigStore {
    constructor() {
      this.state = {
        backendPort: 48123,
        aiRuntimeConfig: {},
        reviewSettings: {
          pullRequestGuidelines: "",
        },
      };
      this.repoSettings = new Map();
    }

    getState() {
      return this.state;
    }

    getStatus() {
      return {};
    }

    getRepoSettings() {
      const repoPath = arguments[0];
      return (
        this.repoSettings.get(repoPath) ?? {
          maxCommits: 50,
          contextLines: 3,
          pullRequestGuidelines: "",
        }
      );
    }

    saveReviewSettings(input) {
      this.state.reviewSettings = input;
      return input;
    }

    saveAiProfile(input) {
      this.state.savedAiProfiles = this.state.savedAiProfiles ?? [];
      this.state.savedAiProfiles.push({
        id: input.id ?? "profile_123",
        name: input.name,
        config: input.config,
        secretValues: input.secretValues,
        updatedAt: "2026-04-10T00:00:00.000Z",
      });
    }

    deleteAiProfile(profileId) {
      this.state.savedAiProfiles = (this.state.savedAiProfiles ?? []).filter(
        (profile) => profile.id !== profileId
      );
    }

    save() {}

    saveRepoSettings(input) {
      const nextSettings = {
        maxCommits: input.maxCommits,
        contextLines: input.contextLines,
        pullRequestGuidelines: input.pullRequestGuidelines ?? "",
      };
      this.repoSettings.set(input.repoPath, nextSettings);
      return nextSettings;
    }

    recordRecentProject(repoPath) {
      return { path: repoPath, name: path.basename(repoPath), lastOpenedAt: "now" };
    }

    getRecentProjects() {
      return [];
    }
  }

  class MockKeychainStore {
    async migrateLegacySecrets() {}

    async getSecrets() {
      return {};
    }

    async getCredentialStatus() {
      return {};
    }

    async saveAiConfig() {}
  }

  class MockBackendManager {
    constructor() {
      this.requests = [];
      this.state = { state: "running", message: "ready" };
      backendManagerInstance = this;
    }

    async request(apiPath, options) {
      this.requests.push({ apiPath, options });
      return { ok: true };
    }

    async restart() {}

    async getHealth() {
      return {};
    }

    async sync() {}

    async stop() {}
  }

  class MockReviewRuntimeManager {
    constructor() {
      this.startCalls = [];
      this.reviewChatCalls = [];
      this.cancelCalls = [];
      this.approvalCalls = [];
      reviewRuntimeManagerInstance = this;
    }

    on() {}

    async startRun(input) {
      this.startCalls.push(input);
      return { id: "rev_run_456" };
    }

    async sendReviewChatMessage(input) {
      this.reviewChatCalls.push(input);
      return { response: "Codex review chat reply" };
    }

    async cancelRun(input) {
      this.cancelCalls.push(input);
      return { id: input.runId };
    }

    async respondToApproval(input) {
      this.approvalCalls.push(input);
    }

    async dispose() {}
  }

  class MockReviewGuidelinesStore {
    constructor() {
      this.states = new Map();
      reviewGuidelinesStoreInstance = this;
    }

    get(repoPath) {
      return (
        this.states.get(repoPath) ?? {
          repoPath,
          draftGuideline: "",
          guidelines: [],
          updatedAt: null,
        }
      );
    }

    save(input) {
      const nextState = {
        repoPath: input.repoPath,
        draftGuideline: input.draftGuideline,
        guidelines: input.guidelines,
        updatedAt: "2026-04-10T00:00:00.000Z",
      };
      this.states.set(input.repoPath, nextState);
      return nextState;
    }
  }

  class MockRepoSyncWatcher {
    constructor() {
      this.triggerSyncCalls = [];
      repoSyncWatcherInstance = this;
    }

    triggerSync(repoPath) {
      this.triggerSyncCalls.push(repoPath);
    }

    ensureWatching() {}

    close() {}

    dispose() {}
  }

  await withMockedModuleLoads(
    {
      electron: {
        app: {
          isPackaged: false,
          setName() {},
          whenReady: () => Promise.resolve(),
          on() {},
          quit() {},
          getPath: () => "/tmp",
        },
        BrowserWindow: MockBrowserWindow,
        dialog: {
          showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
        },
        ipcMain: {
          handle: (channel, handler) => {
            handlers.set(channel, handler);
          },
        },
        shell: {
          openExternal: async () => {},
        },
      },
      "./config-store": {
        DesktopConfigStore: MockConfigStore,
      },
      "./keychain": {
        MacKeychainStore: MockKeychainStore,
      },
      "./backend-manager": {
        BackendManager: MockBackendManager,
      },
      "./review-runtime": {
        ReviewRuntimeManager: MockReviewRuntimeManager,
      },
      "./review-guidelines-store": {
        ReviewGuidelinesStore: MockReviewGuidelinesStore,
      },
      "./repo-sync-watcher": {
        RepoSyncWatcher: MockRepoSyncWatcher,
      },
      "./git-projects": {
        findGitProjectRoot: (repoPath) => repoPath,
      },
    },
    async () => {
      require(mainPath);
      await new Promise((resolve) => setImmediate(resolve));
    }
  );

  const compareHandler = handlers.get("git-odyssey:api:compare-review-target");
  const generateHandler = handlers.get("git-odyssey:api:generate-review");
  const createSessionHandler = handlers.get("git-odyssey:api:create-review-session");
  const getSessionHandler = handlers.get("git-odyssey:api:get-review-session");
  const getHistoryHandler = handlers.get("git-odyssey:api:get-review-history");
  const startRunHandler = handlers.get("git-odyssey:api:start-review-run");
  const reviewChatHandler = handlers.get("git-odyssey:api:send-review-chat-message");
  const getRunHandler = handlers.get("git-odyssey:api:get-review-run");
  const cancelRunHandler = handlers.get("git-odyssey:api:cancel-review-run");
  const respondApprovalHandler = handlers.get("git-odyssey:api:respond-review-approval");
  const getAdditionalReviewGuidelinesHandler = handlers.get(
    "git-odyssey:settings:get-additional-review-guidelines"
  );
  const saveAdditionalReviewGuidelinesHandler = handlers.get(
    "git-odyssey:settings:save-additional-review-guidelines"
  );
  const saveReviewSettingsHandler = handlers.get("git-odyssey:settings:save-review-settings");
  const saveAiProfileHandler = handlers.get("git-odyssey:settings:save-ai-profile");
  const deleteAiProfileHandler = handlers.get("git-odyssey:settings:delete-ai-profile");
  const saveRepoSettingsHandler = handlers.get("git-odyssey:settings:save-repo-settings");
  const input = {
    repoPath: "/tmp/example-repo",
    targetMode: "compare",
    baseRef: "main",
    headRef: "feature",
    contextLines: 7,
  };

  await compareHandler({}, input);
  await generateHandler({}, input);
  await createSessionHandler({}, input);
  await getSessionHandler({}, "rev_sess_123");
  await getHistoryHandler({}, {
    repoPath: "/tmp/example-repo",
    targetMode: "compare",
    baseRef: "main",
    headRef: "feature",
  });
  await startRunHandler({}, {
    sessionId: "rev_sess_123",
    customInstructions: "Focus on auth flows",
  });
  await reviewChatHandler({}, {
    sessionId: "rev_sess_123",
    runId: null,
    message: "Explain the review findings",
    codeContexts: [],
    findingContexts: [],
    messages: [],
    reviewContext: {
      runStatus: "completed",
      summary: "Found one risky branch path.",
      findings: [],
    },
  });
  await getRunHandler({}, {
    sessionId: "rev_sess_123",
    runId: "rev_run_456",
  });
  await cancelRunHandler({}, {
    sessionId: "rev_sess_123",
    runId: "rev_run_456",
  });
  await respondApprovalHandler({}, {
    sessionId: "rev_sess_123",
    runId: "rev_run_456",
    approvalId: "approval_1",
    decision: "accept",
  });
  const additionalGuidelineState = await getAdditionalReviewGuidelinesHandler(
    {},
    "/tmp/example-repo"
  );
  const savedAdditionalGuidelineState =
    await saveAdditionalReviewGuidelinesHandler({}, {
      repoPath: "/tmp/example-repo",
      draftGuideline: "Draft guideline",
      guidelines: [
        {
          id: "guideline-1",
          text: "Persist me",
        },
      ],
    });
  const savedReviewSettings = await saveReviewSettingsHandler({}, {
    pullRequestGuidelines: "Focus on auth",
  });
  await saveAiProfileHandler({}, {
    name: "Local runtime",
    config: {
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
    secretValues: {},
  });
  await deleteAiProfileHandler({}, "profile_123");
  await saveRepoSettingsHandler({}, {
    repoPath: "/tmp/example-repo",
    maxCommits: 50,
    contextLines: 3,
    pullRequestGuidelines: "Only review migrations",
  });
  await saveRepoSettingsHandler({}, {
    repoPath: "/tmp/example-repo",
    maxCommits: 50,
    contextLines: 5,
    pullRequestGuidelines: "Only review migrations",
  });

  assert.deepEqual(backendManagerInstance.requests[0], {
    apiPath: "/api/review/compare",
    options: {
      method: "POST",
      body: {
        repo_path: "/tmp/example-repo",
        target_mode: "compare",
        base_ref: "main",
        head_ref: "feature",
        commit_sha: null,
        context_lines: 7,
      },
    },
  });
  assert.deepEqual(backendManagerInstance.requests[1], {
    apiPath: "/api/review/generate",
    options: {
      method: "POST",
      body: {
        repo_path: "/tmp/example-repo",
        target_mode: "compare",
        base_ref: "main",
        head_ref: "feature",
        commit_sha: null,
        context_lines: 7,
      },
    },
  });
  assert.deepEqual(backendManagerInstance.requests[2], {
    apiPath: "/api/review/sessions",
    options: {
      method: "POST",
      body: {
        repo_path: "/tmp/example-repo",
        target_mode: "compare",
        base_ref: "main",
        head_ref: "feature",
        commit_sha: null,
        context_lines: 7,
      },
    },
  });
  assert.deepEqual(backendManagerInstance.requests[3], {
    apiPath: "/api/review/sessions/rev_sess_123",
    options: undefined,
  });
  assert.deepEqual(backendManagerInstance.requests[4], {
    apiPath: "/api/review/history?repo_path=%2Ftmp%2Fexample-repo&target_mode=compare&base_ref=main&head_ref=feature",
    options: undefined,
  });
  assert.deepEqual(backendManagerInstance.requests[5], {
    apiPath: "/api/review/sessions/rev_sess_123/runs/rev_run_456",
    options: undefined,
  });
  assert.deepEqual(backendManagerInstance.requests[6], {
    apiPath: "/api/review/sessions/rev_sess_123/runs/rev_run_456",
    options: undefined,
  });
  assert.deepEqual(reviewRuntimeManagerInstance.startCalls[0], {
    sessionId: "rev_sess_123",
    customInstructions: "Focus on auth flows",
  });
  assert.deepEqual(reviewRuntimeManagerInstance.reviewChatCalls[0], {
    sessionId: "rev_sess_123",
    runId: null,
    message: "Explain the review findings",
    codeContexts: [],
    findingContexts: [],
    messages: [],
    reviewContext: {
      runStatus: "completed",
      summary: "Found one risky branch path.",
      findings: [],
    },
  });
  assert.deepEqual(reviewRuntimeManagerInstance.cancelCalls[0], {
    sessionId: "rev_sess_123",
    runId: "rev_run_456",
  });
  assert.deepEqual(reviewRuntimeManagerInstance.approvalCalls[0], {
    sessionId: "rev_sess_123",
    runId: "rev_run_456",
    approvalId: "approval_1",
    decision: "accept",
  });
  assert.deepEqual(additionalGuidelineState, {
    repoPath: "/tmp/example-repo",
    draftGuideline: "",
    guidelines: [],
    updatedAt: null,
  });
  assert.deepEqual(savedAdditionalGuidelineState, {
    repoPath: "/tmp/example-repo",
    draftGuideline: "Draft guideline",
    guidelines: [
      {
        id: "guideline-1",
        text: "Persist me",
      },
    ],
    updatedAt: "2026-04-10T00:00:00.000Z",
  });
  assert.deepEqual(
    reviewGuidelinesStoreInstance.states.get("/tmp/example-repo"),
    savedAdditionalGuidelineState
  );
  assert.deepEqual(savedReviewSettings, {
    pullRequestGuidelines: "Focus on auth",
  });
  assert.deepEqual(repoSyncWatcherInstance.triggerSyncCalls, [
    "/tmp/example-repo",
  ]);
  assert.equal(createdWindowOptions.titleBarStyle, "hidden");
  assert.equal(createdWindowOptions.backgroundColor, "#0d0f10");
  if (process.platform === "darwin") {
    assert.deepEqual(createdWindowOptions.trafficLightPosition, {
      x: 18,
      y: 18,
    });
  } else {
    assert.deepEqual(createdWindowOptions.titleBarOverlay, {
      color: "#111418",
      symbolColor: "#d9e2f2",
      height: 56,
    });
  }
});
