import { contextBridge, ipcRenderer } from "electron";

import type {
  DesktopAiConfigInput,
  DesktopRepoSettings,
  DesktopRepoSettingsSaveInput,
  ReviewApprovalDecision,
} from "./types";

type ReviewEventPayload = Record<string, unknown>;

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

function subscribe(
  channel: string,
  listener: (payload: ReviewEventPayload) => void
): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: ReviewEventPayload) => {
    listener(payload);
  };
  ipcRenderer.on(channel, wrapped);
  return () => {
    ipcRenderer.removeListener(channel, wrapped);
  };
}

const bridge = {
  api: {
    getRepo: (repoPath: string, repoSettings?: DesktopRepoSettings) =>
      invoke("git-odyssey:api:get-repo", repoPath, repoSettings),
    ingestRepo: (input: {
      repoPath: string;
      maxCommits: number;
      contextLines: number;
      force?: boolean;
    }) => invoke("git-odyssey:api:ingest-repo", input),
    filterCommits: (input: {
      query: string;
      filters: unknown;
      repoPath: string;
      maxResults?: number;
    }) => invoke("git-odyssey:api:filter-commits", input),
    pickGitProject: () => invoke("git-odyssey:api:pick-git-project"),
    getRecentProjects: () => invoke("git-odyssey:api:get-recent-projects"),
    summarizeCommit: (sha: string) => invoke("git-odyssey:api:summarize-commit", sha),
    summarizeFileChange: (id: number) =>
      invoke("git-odyssey:api:summarize-file-change", id),
    summarizeHunk: (id: number) => invoke("git-odyssey:api:summarize-hunk", id),
    sendChatMessage: (input: {
      query: string;
      repoPath: string;
      contextShas: string[];
    }) => invoke("git-odyssey:api:send-chat-message", input),
    initDatabase: () => invoke("git-odyssey:api:init-database"),
    dropDatabase: () => invoke("git-odyssey:api:drop-database"),
    getCommit: (
      repoPath: string,
      commitSha: string,
      repoSettings?: DesktopRepoSettings
    ) => invoke("git-odyssey:api:get-commit", repoPath, commitSha, repoSettings),
    getCommits: (repoPath: string, repoSettings?: DesktopRepoSettings) =>
      invoke("git-odyssey:api:get-commits", repoPath, repoSettings),
    compareReviewTarget: (input: {
      repoPath: string;
      baseRef: string;
      headRef: string;
      contextLines: number;
    }) => invoke("git-odyssey:api:compare-review-target", input),
    generateReview: (input: {
      repoPath: string;
      baseRef: string;
      headRef: string;
      contextLines: number;
    }) => invoke("git-odyssey:api:generate-review", input),
    createReviewSession: (input: {
      repoPath: string;
      baseRef: string;
      headRef: string;
      contextLines: number;
    }) => invoke("git-odyssey:api:create-review-session", input),
    getReviewSession: (sessionId: string) =>
      invoke("git-odyssey:api:get-review-session", sessionId),
    startReviewRun: (input: {
      sessionId: string;
      customInstructions?: string | null;
    }) => invoke("git-odyssey:api:start-review-run", input),
    getReviewRun: (input: { sessionId: string; runId: string }) =>
      invoke("git-odyssey:api:get-review-run", input),
    cancelReviewRun: (input: { sessionId: string; runId: string }) =>
      invoke("git-odyssey:api:cancel-review-run", input),
    respondReviewApproval: (input: {
      sessionId: string;
      runId: string;
      approvalId: string;
      decision: ReviewApprovalDecision;
    }) => invoke("git-odyssey:api:respond-review-approval", input),
    getCurrentUser: () => invoke("git-odyssey:api:get-current-user"),
    logout: () => invoke("git-odyssey:api:logout"),
  },
  settings: {
    getStatus: () => invoke("git-odyssey:settings:get-status"),
    getRepoSettings: (repoPath: string) =>
      invoke("git-odyssey:settings:get-repo-settings", repoPath),
    validateAiConfig: (input: DesktopAiConfigInput) =>
      invoke("git-odyssey:settings:validate-ai-config", input),
    saveAiConfig: (input: DesktopAiConfigInput) =>
      invoke("git-odyssey:settings:save-ai-config", input),
    saveRepoSettings: (input: DesktopRepoSettingsSaveInput) =>
      invoke("git-odyssey:settings:save-repo-settings", input),
  },
  health: {
    getStatus: () => invoke("git-odyssey:health:get-status"),
  },
  review: {
    onEvent: (listener: (event: ReviewEventPayload) => void) =>
      subscribe("git-odyssey:review:event", listener),
  },
};

contextBridge.exposeInMainWorld("gitOdysseyDesktop", bridge);
