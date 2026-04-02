const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { RepoSyncWatcher } = require("../src/repo-sync-watcher.ts");

function createGitDir() {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "git-odyssey-sync-watch-"));
  const gitDir = path.join(repoDir, ".git");
  fs.mkdirSync(path.join(gitDir, "refs", "heads"), { recursive: true });
  fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n");
  fs.writeFileSync(path.join(gitDir, "packed-refs"), "");
  return { repoDir, gitDir };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("repo sync watcher debounces repeated git ref changes into one ingest call", async () => {
  const { repoDir, gitDir } = createGitDir();
  const listeners = new Map();
  const requests = [];

  const watcher = new RepoSyncWatcher({
    backendManager: {
      async request(apiPath, options) {
        requests.push({ apiPath, options });
        return {};
      },
    },
    configStore: {
      getRepoSettings() {
        return { maxCommits: 75, contextLines: 5 };
      },
      getState() {
        return {};
      },
    },
    resolveGitDir() {
      return gitDir;
    },
    watchFactory(targetPath, listener) {
      listeners.set(targetPath, listener);
      return { close() {} };
    },
    logger: {
      warn() {},
      error() {},
    },
    debounceMs: 10,
  });

  watcher.ensureWatching(repoDir);
  listeners.get(gitDir)("rename", "HEAD");
  listeners.get(gitDir)("change", "packed-refs");
  listeners.get(path.join(gitDir, "refs", "heads"))("rename", "main");

  await wait(40);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].apiPath, "/api/ingest");
  assert.deepEqual(requests[0].options.body, {
    repo_path: repoDir,
    max_commits: 75,
    context_lines: 5,
    force: false,
  });

  fs.rmSync(repoDir, { recursive: true, force: true });
});

test("repo sync watcher reruns once when refs change during an in-flight sync", async () => {
  const { repoDir, gitDir } = createGitDir();
  const listeners = new Map();
  const requestResolvers = [];
  let requestCount = 0;

  const watcher = new RepoSyncWatcher({
    backendManager: {
      request() {
        requestCount += 1;
        return new Promise((resolve) => {
          requestResolvers.push(resolve);
        });
      },
    },
    configStore: {
      getRepoSettings() {
        return { maxCommits: 50, contextLines: 3 };
      },
      getState() {
        return {};
      },
    },
    resolveGitDir() {
      return gitDir;
    },
    watchFactory(targetPath, listener) {
      listeners.set(targetPath, listener);
      return { close() {} };
    },
    logger: {
      warn() {},
      error() {},
    },
    debounceMs: 5,
  });

  watcher.ensureWatching(repoDir);
  listeners.get(gitDir)("rename", "HEAD");
  await wait(20);
  assert.equal(requestCount, 1);

  listeners.get(path.join(gitDir, "refs", "heads"))("change", "main");
  await wait(20);
  assert.equal(requestCount, 1);

  requestResolvers.shift()({});
  await wait(30);
  assert.equal(requestCount, 2);

  requestResolvers.shift()({});
  await wait(10);

  fs.rmSync(repoDir, { recursive: true, force: true });
});
