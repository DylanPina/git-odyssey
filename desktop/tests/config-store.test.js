const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { DesktopConfigStore } = require("../src/config-store");

function createUserDataPath() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "git-odyssey-config-store-"));
}

function cleanupUserDataPath(userDataPath) {
  fs.rmSync(userDataPath, { recursive: true, force: true });
}

test("getRepoSettings returns defaults for repositories without overrides", () => {
  const userDataPath = createUserDataPath();

  try {
    const store = new DesktopConfigStore({ userDataPath });
    const repoPath = path.join(userDataPath, "example-repo");

    fs.mkdirSync(repoPath, { recursive: true });

    assert.deepEqual(store.getRepoSettings(repoPath), {
      maxCommits: 50,
      contextLines: 3,
    });
  } finally {
    cleanupUserDataPath(userDataPath);
  }
});

test("saveRepoSettings persists repository overrides across store reloads", () => {
  const userDataPath = createUserDataPath();

  try {
    const repoPath = path.join(userDataPath, "example-repo");
    fs.mkdirSync(repoPath, { recursive: true });

    const store = new DesktopConfigStore({ userDataPath });
    const saved = store.saveRepoSettings({
      repoPath,
      maxCommits: 120,
      contextLines: 8,
    });

    assert.deepEqual(saved, {
      maxCommits: 120,
      contextLines: 8,
    });

    const reloadedStore = new DesktopConfigStore({ userDataPath });
    assert.deepEqual(reloadedStore.getRepoSettings(repoPath), {
      maxCommits: 120,
      contextLines: 8,
    });
  } finally {
    cleanupUserDataPath(userDataPath);
  }
});

test("repo settings loaded from disk are normalized back to safe defaults", () => {
  const userDataPath = createUserDataPath();

  try {
    const repoPath = path.join(userDataPath, "example-repo");
    fs.mkdirSync(repoPath, { recursive: true });

    const configPath = path.join(userDataPath, "desktop-config.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          backendPort: 48120,
          databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5432/gitodyssey",
          databaseSslMode: "disable",
          dataDir: path.join(userDataPath, "data"),
          logDir: path.join(userDataPath, "logs"),
          aiRuntimeConfig: undefined,
          firstRunCompleted: false,
          recentProjects: [],
          repoSettings: {
            [repoPath]: {
              maxCommits: "invalid",
              contextLines: -5,
            },
          },
        },
        null,
        2
      )
    );

    const store = new DesktopConfigStore({ userDataPath });
    assert.deepEqual(store.getRepoSettings(repoPath), {
      maxCommits: 50,
      contextLines: 3,
    });
  } finally {
    cleanupUserDataPath(userDataPath);
  }
});
