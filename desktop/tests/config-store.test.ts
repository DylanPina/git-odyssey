const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { DesktopConfigStore } = require("../src/config-store");

function createRootPath() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "git-odyssey-config-store-"));
}

function cleanupRootPath(rootPath) {
  fs.rmSync(rootPath, { recursive: true, force: true });
}

test("getRepoSettings returns defaults for repositories without overrides", () => {
  const rootPath = createRootPath();

  try {
    const store = new DesktopConfigStore({ rootPath });
    const repoPath = path.join(rootPath, "example-repo");

    fs.mkdirSync(repoPath, { recursive: true });

    assert.deepEqual(store.getRepoSettings(repoPath), {
      maxCommits: 50,
      contextLines: 3,
      pullRequestGuidelines: "",
    });
  } finally {
    cleanupRootPath(rootPath);
  }
});

test("saveRepoSettings persists repository overrides across store reloads", () => {
  const rootPath = createRootPath();

  try {
    const repoPath = path.join(rootPath, "example-repo");
    fs.mkdirSync(repoPath, { recursive: true });

    const store = new DesktopConfigStore({ rootPath });
    const saved = store.saveRepoSettings({
      repoPath,
      maxCommits: 120,
      contextLines: 8,
      pullRequestGuidelines: "Focus on migrations.  ",
    });

    assert.deepEqual(saved, {
      maxCommits: 120,
      contextLines: 8,
      pullRequestGuidelines: "Focus on migrations.",
    });

    const reloadedStore = new DesktopConfigStore({ rootPath });
    assert.deepEqual(reloadedStore.getRepoSettings(repoPath), {
      maxCommits: 120,
      contextLines: 8,
      pullRequestGuidelines: "Focus on migrations.",
    });
  } finally {
    cleanupRootPath(rootPath);
  }
});

test("repo settings loaded from disk are normalized back to safe defaults", () => {
  const rootPath = createRootPath();

  try {
    const repoPath = path.join(rootPath, "example-repo");
    fs.mkdirSync(repoPath, { recursive: true });

    const configPath = path.join(rootPath, "desktop-config.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          backendPort: 48120,
          databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5432/gitodyssey",
          databaseSslMode: "disable",
          dataDir: path.join(rootPath, "data"),
          logDir: path.join(rootPath, "logs"),
          aiRuntimeConfig: undefined,
          firstRunCompleted: false,
          recentProjects: [],
          repoSettings: {
            [repoPath]: {
              maxCommits: "invalid",
              contextLines: -5,
              pullRequestGuidelines: "  Watch auth edges.  ",
            },
          },
        },
        null,
        2
      )
    );

    const store = new DesktopConfigStore({ rootPath });
    assert.deepEqual(store.getRepoSettings(repoPath), {
      maxCommits: 50,
      contextLines: 3,
      pullRequestGuidelines: "Watch auth edges.",
    });
  } finally {
    cleanupRootPath(rootPath);
  }
});

test("saveReviewSettings persists trimmed app-wide guidelines across reloads", () => {
  const rootPath = createRootPath();

  try {
    const store = new DesktopConfigStore({ rootPath });
    const saved = store.saveReviewSettings({
      pullRequestGuidelines: "  Prioritize auth and data loss regressions.  ",
    });

    assert.deepEqual(saved, {
      pullRequestGuidelines: "Prioritize auth and data loss regressions.",
    });

    const reloadedStore = new DesktopConfigStore({ rootPath });
    assert.deepEqual(reloadedStore.getReviewSettings(), {
      pullRequestGuidelines: "Prioritize auth and data loss regressions.",
    });
  } finally {
    cleanupRootPath(rootPath);
  }
});

test("creates config, data, and logs under the root path", () => {
  const rootPath = createRootPath();

  try {
    new DesktopConfigStore({ rootPath });

    assert.equal(fs.existsSync(path.join(rootPath, "desktop-config.json")), true);
    assert.equal(fs.existsSync(path.join(rootPath, "data")), true);
    assert.equal(fs.existsSync(path.join(rootPath, "logs")), true);
  } finally {
    cleanupRootPath(rootPath);
  }
});

test("migrates legacy Application Support state when the new root is empty", () => {
  const rootPath = createRootPath();
  const legacyHome = createRootPath();
  const legacyRootPath = path.join(
    legacyHome,
    "Library",
    "Application Support",
    "git-odyssey-desktop"
  );

  try {
    fs.mkdirSync(path.join(legacyRootPath, "logs"), { recursive: true });
    fs.mkdirSync(path.join(legacyRootPath, "data"), { recursive: true });
    fs.writeFileSync(
      path.join(legacyRootPath, "desktop-config.json"),
      JSON.stringify(
        {
          backendPort: 48120,
          databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5432/gitodyssey",
          databaseSslMode: "disable",
          dataDir: path.join(legacyRootPath, "data"),
          logDir: path.join(legacyRootPath, "logs"),
          aiRuntimeConfig: undefined,
          firstRunCompleted: true,
          recentProjects: [],
          repoSettings: {},
        },
        null,
        2
      )
    );
    fs.writeFileSync(path.join(legacyRootPath, "logs", "backend.log"), "legacy log");
    fs.writeFileSync(path.join(legacyRootPath, "data", "state.txt"), "legacy data");

    const originalHome = process.env.HOME;
    process.env.HOME = legacyHome;
    try {
      new DesktopConfigStore({ rootPath });
    } finally {
      process.env.HOME = originalHome;
    }

    assert.equal(fs.existsSync(path.join(rootPath, "desktop-config.json")), true);
    assert.equal(fs.existsSync(path.join(rootPath, "logs", "backend.log")), true);
    assert.equal(fs.existsSync(path.join(rootPath, "data", "state.txt")), true);
  } finally {
    cleanupRootPath(rootPath);
    cleanupRootPath(legacyHome);
  }
});
