const { contextBridge, ipcRenderer } = require("electron");

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld("gitOdysseyDesktop", {
  api: {
    getRepo: (repoPath, repoSettings) =>
      invoke("git-odyssey:api:get-repo", repoPath, repoSettings),
    ingestRepo: (input) => invoke("git-odyssey:api:ingest-repo", input),
    filterCommits: (input) => invoke("git-odyssey:api:filter-commits", input),
    pickGitProject: () => invoke("git-odyssey:api:pick-git-project"),
    getRecentProjects: () => invoke("git-odyssey:api:get-recent-projects"),
    summarizeCommit: (sha) =>
      invoke("git-odyssey:api:summarize-commit", sha),
    summarizeFileChange: (id) =>
      invoke("git-odyssey:api:summarize-file-change", id),
    summarizeHunk: (id) => invoke("git-odyssey:api:summarize-hunk", id),
    sendChatMessage: (input) =>
      invoke("git-odyssey:api:send-chat-message", input),
    initDatabase: () => invoke("git-odyssey:api:init-database"),
    dropDatabase: () => invoke("git-odyssey:api:drop-database"),
    getCommit: (repoPath, commitSha, repoSettings) =>
      invoke("git-odyssey:api:get-commit", repoPath, commitSha, repoSettings),
    getCommits: (repoPath, repoSettings) =>
      invoke("git-odyssey:api:get-commits", repoPath, repoSettings),
    compareReviewTarget: (input) =>
      invoke("git-odyssey:api:compare-review-target", input),
    generateReview: (input) =>
      invoke("git-odyssey:api:generate-review", input),
    getCurrentUser: () => invoke("git-odyssey:api:get-current-user"),
    logout: () => invoke("git-odyssey:api:logout"),
  },
  settings: {
    getStatus: () => invoke("git-odyssey:settings:get-status"),
    getRepoSettings: (repoPath) =>
      invoke("git-odyssey:settings:get-repo-settings", repoPath),
    validateAiConfig: (input) =>
      invoke("git-odyssey:settings:validate-ai-config", input),
    saveAiConfig: (input) => invoke("git-odyssey:settings:save-ai-config", input),
    saveRepoSettings: (input) =>
      invoke("git-odyssey:settings:save-repo-settings", input),
  },
  health: {
    getStatus: () => invoke("git-odyssey:health:get-status"),
  },
});
