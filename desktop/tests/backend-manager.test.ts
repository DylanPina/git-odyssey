const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
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

function createUserDataPath() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "git-odyssey-backend-manager-"));
}

function cleanupUserDataPath(userDataPath) {
  fs.rmSync(userDataPath, { recursive: true, force: true });
}

class FakeChildProcess extends EventEmitter {
  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.exitCode = null;
  }

  kill() {
    if (this.exitCode !== null) {
      return;
    }

    this.exitCode = 0;
    this.emit("exit", 0, null);
  }
}

test("backend manager reports postgres startup failures with actionable health details", async () => {
  const userDataPath = createUserDataPath();
  const backendManagerPath = path.join(__dirname, "..", "src", "backend-manager.ts");
  const logDir = path.join(userDataPath, "logs");
  const dataDir = path.join(userDataPath, "data");
  const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:5432/gitodyssey";
  const originalFetch = global.fetch;
  const originalDateNow = Date.now;
  const originalSetTimeout = global.setTimeout;
  let fakeNow = 0;
  let childProcess = null;

  delete require.cache[require.resolve(backendManagerPath)];

  global.fetch = async () => {
    if (childProcess && childProcess.exitCode === null) {
      childProcess.stderr.emit(
        "data",
        Buffer.from(
          'psycopg2.OperationalError: connection to server at "127.0.0.1", port 5432 failed: Connection refused\n'
        )
      );
      childProcess.stderr.emit(
        "data",
        Buffer.from(
          "Is the server running on that host and accepting TCP/IP connections?\n"
        )
      );
      childProcess.exitCode = 1;
      childProcess.emit("exit", 1, null);
    }

    throw new Error("Backend not ready");
  };
  Date.now = () => {
    fakeNow += 600;
    return fakeNow;
  };
  global.setTimeout = (callback) => {
    callback();
    return 0;
  };

  try {
    await withMockedModuleLoads(
      {
        child_process: {
          spawn: () => {
            childProcess = new FakeChildProcess();
            return childProcess;
          },
        },
        "node:child_process": {
          spawn: () => {
            childProcess = new FakeChildProcess();
            return childProcess;
          },
        },
      },
      async () => {
        const { BackendManager } = require(backendManagerPath);
        const manager = new BackendManager({
          app: { isPackaged: false },
          configStore: {
            getState() {
              return {
                backendPort: 48120,
                databaseUrl,
                databaseSslMode: "disable",
                logDir,
                dataDir,
                aiRuntimeConfig: {
                  schema_version: 1,
                  profiles: [],
                  capabilities: {
                    text_generation: null,
                    embeddings: null,
                  },
                },
              };
            },
            getStatus() {
              return {
                firstRunCompleted: true,
                backendPort: 48120,
                dataDir,
                logDir,
                databaseUrlConfigured: true,
                aiRuntimeConfig: {
                  schema_version: 1,
                  profiles: [],
                  capabilities: {
                    text_generation: null,
                    embeddings: null,
                  },
                },
                ai: {
                  textGeneration: {
                    configured: false,
                    ready: false,
                    providerType: null,
                    modelId: null,
                    baseUrl: null,
                    authMode: null,
                    secretPresent: false,
                    message: "Disabled",
                  },
                  embeddings: {
                    configured: false,
                    ready: false,
                    providerType: null,
                    modelId: null,
                    baseUrl: null,
                    authMode: null,
                    secretPresent: false,
                    message: "Disabled",
                  },
                },
              };
            },
          },
          keychain: {
            async getSecrets() {
              return {};
            },
            async getCredentialStatus() {
              return { secretRefs: {} };
            },
          },
        });

        await manager.start(manager.configStore.getState());

        assert.equal(manager.state.state, "error");
        assert.match(
          manager.state.message,
          /could not connect to PostgreSQL at 127\.0\.0\.1:5432/i
        );

        const health = await manager.getHealth();

        assert.equal(health.backend.state, "error");
        assert.match(
          health.backend.message,
          /docker compose up -d db/i
        );
        assert.equal(health.postgres.state, "error");
        assert.match(
          health.postgres.message,
          /PostgreSQL is not reachable at 127\.0\.0\.1:5432/i
        );
      }
    );
  } finally {
    global.fetch = originalFetch;
    Date.now = originalDateNow;
    global.setTimeout = originalSetTimeout;
    cleanupUserDataPath(userDataPath);
    delete require.cache[require.resolve(backendManagerPath)];
  }
});

test("backend manager summarizes raw pgvector bootstrap SQL failures", async () => {
  const userDataPath = createUserDataPath();
  const backendManagerPath = path.join(__dirname, "..", "src", "backend-manager.ts");
  const logDir = path.join(userDataPath, "logs");
  const dataDir = path.join(userDataPath, "data");
  const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:5432/gitodyssey";
  const originalFetch = global.fetch;
  const originalDateNow = Date.now;
  const originalSetTimeout = global.setTimeout;
  let fakeNow = 0;
  let childProcess = null;

  delete require.cache[require.resolve(backendManagerPath)];

  global.fetch = async () => {
    if (childProcess && childProcess.exitCode === null) {
      childProcess.stderr.emit(
        "data",
        Buffer.from(
          'sqlalchemy.exc.NotSupportedError: (psycopg2.errors.FeatureNotSupported) extension "vector" is not available\n'
        )
      );
      childProcess.stderr.emit(
        "data",
        Buffer.from(
          '[SQL: CREATE EXTENSION IF NOT EXISTS vector]\n'
        )
      );
      childProcess.exitCode = 1;
      childProcess.emit("exit", 1, null);
    }

    throw new Error("Backend not ready");
  };
  Date.now = () => {
    fakeNow += 600;
    return fakeNow;
  };
  global.setTimeout = (callback) => {
    callback();
    return 0;
  };

  try {
    await withMockedModuleLoads(
      {
        child_process: {
          spawn: () => {
            childProcess = new FakeChildProcess();
            return childProcess;
          },
        },
        "node:child_process": {
          spawn: () => {
            childProcess = new FakeChildProcess();
            return childProcess;
          },
        },
      },
      async () => {
        const { BackendManager } = require(backendManagerPath);
        const manager = new BackendManager({
          app: { isPackaged: false },
          configStore: {
            getState() {
              return {
                backendPort: 48120,
                databaseUrl,
                databaseSslMode: "disable",
                logDir,
                dataDir,
                aiRuntimeConfig: {
                  schema_version: 1,
                  profiles: [],
                  capabilities: {
                    text_generation: null,
                    embeddings: null,
                  },
                },
              };
            },
            getStatus() {
              return {
                firstRunCompleted: true,
                backendPort: 48120,
                dataDir,
                logDir,
                databaseUrlConfigured: true,
                aiRuntimeConfig: {
                  schema_version: 1,
                  profiles: [],
                  capabilities: {
                    text_generation: null,
                    embeddings: null,
                  },
                },
                ai: {
                  textGeneration: {
                    configured: false,
                    ready: false,
                    providerType: null,
                    modelId: null,
                    baseUrl: null,
                    authMode: null,
                    secretPresent: false,
                    message: "Disabled",
                  },
                  embeddings: {
                    configured: false,
                    ready: false,
                    providerType: null,
                    modelId: null,
                    baseUrl: null,
                    authMode: null,
                    secretPresent: false,
                    message: "Disabled",
                  },
                },
              };
            },
          },
          keychain: {
            async getSecrets() {
              return {};
            },
            async getCredentialStatus() {
              return { secretRefs: {} };
            },
          },
        });

        await manager.start(manager.configStore.getState());

        assert.equal(manager.state.state, "error");
        assert.match(manager.state.message, /pgvector extension is unavailable/i);

        const health = await manager.getHealth();

        assert.equal(health.backend.state, "error");
        assert.match(health.backend.message, /pgvector extension is unavailable/i);
        assert.equal(health.postgres.state, "error");
        assert.match(health.postgres.message, /pgvector is not installed/i);
      }
    );
  } finally {
    global.fetch = originalFetch;
    Date.now = originalDateNow;
    global.setTimeout = originalSetTimeout;
    cleanupUserDataPath(userDataPath);
    delete require.cache[require.resolve(backendManagerPath)];
  }
});
