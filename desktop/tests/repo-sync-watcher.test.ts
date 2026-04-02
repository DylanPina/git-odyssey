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
  const jobId = "job-1";

  const watcher = new RepoSyncWatcher({
    backendManager: {
      async request(apiPath, options) {
        requests.push({ apiPath, options });
        if (apiPath === "/api/ingest/jobs") {
          return {
            job_id: jobId,
            repo_path: repoDir,
            status: "queued",
            progress: {
              progress_id: jobId,
              repo_path: repoDir,
              phase: "planning",
              label: "Queued repository sync",
              percent: 0,
              stage_percent: 0,
              completed_units: 0,
              total_units: 0,
              started_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          };
        }
        return {
          job_id: jobId,
          repo_path: repoDir,
          status: "completed",
          progress: {
            progress_id: jobId,
            repo_path: repoDir,
            phase: "completed",
            label: "Repository sync complete",
            percent: 100,
            stage_percent: 1,
            completed_units: 1,
            total_units: 1,
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        };
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

  assert.equal(requests.length, 2);
  assert.equal(requests[0].apiPath, "/api/ingest/jobs");
  assert.deepEqual(requests[0].options.body, {
    repo_path: repoDir,
    max_commits: 75,
    context_lines: 5,
    force: false,
  });
  assert.equal(requests[1].apiPath, `/api/ingest/jobs/${jobId}`);

  fs.rmSync(repoDir, { recursive: true, force: true });
});

test("repo sync watcher reruns once when refs change during an in-flight sync", async () => {
  const { repoDir, gitDir } = createGitDir();
  const listeners = new Map();
  const requestResolvers = [];
  let requestCount = 0;
  let jobCounter = 0;

  const watcher = new RepoSyncWatcher({
    backendManager: {
      request(apiPath) {
        requestCount += 1;
        if (apiPath === "/api/ingest/jobs") {
          jobCounter += 1;
          return Promise.resolve({
            job_id: `job-${jobCounter}`,
            repo_path: repoDir,
            status: "queued",
            progress: {
              progress_id: `job-${jobCounter}`,
              repo_path: repoDir,
              phase: "planning",
              label: "Queued repository sync",
              percent: 0,
              stage_percent: 0,
              completed_units: 0,
              total_units: 0,
              started_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          });
        }
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
  assert.equal(requestCount, 2);

  listeners.get(path.join(gitDir, "refs", "heads"))("change", "main");
  await wait(20);
  assert.equal(requestCount, 2);

  requestResolvers.shift()({
    job_id: "job-1",
    repo_path: repoDir,
    status: "completed",
    progress: {
      progress_id: "job-1",
      repo_path: repoDir,
      phase: "completed",
      label: "Repository sync complete",
      percent: 100,
      stage_percent: 1,
      completed_units: 1,
      total_units: 1,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });
  await wait(30);
  assert.equal(requestCount, 4);

  requestResolvers.shift()({
    job_id: "job-2",
    repo_path: repoDir,
    status: "completed",
    progress: {
      progress_id: "job-2",
      repo_path: repoDir,
      phase: "completed",
      label: "Repository sync complete",
      percent: 100,
      stage_percent: 1,
      completed_units: 1,
      total_units: 1,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });
  await wait(10);

  fs.rmSync(repoDir, { recursive: true, force: true });
});
