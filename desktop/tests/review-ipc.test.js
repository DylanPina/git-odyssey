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
  const preloadPath = path.join(__dirname, "..", "src", "preload.js");

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
        },
      },
    },
    async () => {
      require(preloadPath);
    }
  );

  const input = {
    repoPath: "/tmp/example-repo",
    baseRef: "main",
    headRef: "feature",
    contextLines: 5,
  };

  await exposed.gitOdysseyDesktop.api.compareReviewTarget(input);
  await exposed.gitOdysseyDesktop.api.generateReview(input);

  assert.deepEqual(invocations[0], ["git-odyssey:api:compare-review-target", input]);
  assert.deepEqual(invocations[1], ["git-odyssey:api:generate-review", input]);
});

test("main process review handlers forward requests to the backend", async () => {
  const handlers = new Map();
  let backendManagerInstance = null;
  const mainPath = path.join(__dirname, "..", "src", "main.js");

  delete require.cache[require.resolve(mainPath)];

  class MockBrowserWindow {
    constructor() {
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
      };
    }

    getState() {
      return this.state;
    }

    getStatus() {
      return {};
    }

    getRepoSettings() {
      return { maxCommits: 50, contextLines: 3 };
    }

    save() {}

    saveRepoSettings(input) {
      return input;
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
  const input = {
    repoPath: "/tmp/example-repo",
    baseRef: "main",
    headRef: "feature",
    contextLines: 7,
  };

  await compareHandler({}, input);
  await generateHandler({}, input);

  assert.deepEqual(backendManagerInstance.requests[0], {
    apiPath: "/api/review/compare",
    options: {
      method: "POST",
      body: {
        repo_path: "/tmp/example-repo",
        base_ref: "main",
        head_ref: "feature",
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
        base_ref: "main",
        head_ref: "feature",
        context_lines: 7,
      },
    },
  });
});
