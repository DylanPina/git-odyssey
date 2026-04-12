import type {
  RepoResponse,
  FilterResponse,
  ChatResponse,
  DatabaseResponse,
  CommitResponse,
  CommitsResponse,
  RepoDeleteResponse,
} from "../lib/definitions/api";
import type {
  ReviewHistoryResponse,
  ReviewCompareResponse,
  ReviewChatRequest,
  ReviewChatResponse,
  ReviewRun,
  ReviewReport,
  ReviewSession,
} from "@/lib/definitions/review";
import type { User } from "@/lib/definitions/auth";
import type {
  DesktopAdditionalReviewGuidelineSaveInput,
  DesktopAdditionalReviewGuidelineState,
  DesktopAiConfigInput,
  DesktopAiValidationResult,
  DesktopReviewSettings,
  DesktopRepoSettings,
  DesktopRepoSettingsSaveInput,
  GitProjectSummary,
  DesktopHealthStatus,
  DesktopSettingsStatus,
  GitOdysseyDesktopBridge,
  RepoSyncProgressEvent,
} from "@/lib/definitions/desktop";
import type { FilterFormData } from "@/lib/filter-utils";

function getDesktopBridge(): GitOdysseyDesktopBridge {
  if (typeof window === "undefined" || !window.gitOdysseyDesktop) {
    throw new Error(
      "GitOdyssey must run inside the Electron desktop shell."
    );
  }

  return window.gitOdysseyDesktop;
}

export const getRepo = async (
  repoPath: string,
  repoSettings?: DesktopRepoSettings
): Promise<RepoResponse> => {
  return getDesktopBridge().api.getRepo(repoPath, repoSettings);
};

export const ingestRepo = async (
  repoPath: string,
  maxCommits: number = 50,
  contextLines: number = 3,
  force: boolean = false
): Promise<RepoResponse> => {
  return getDesktopBridge().api.ingestRepo({
    repoPath,
    maxCommits,
    contextLines,
    force,
  });
};

export const filterCommits = async (
  query: string,
  filters: FilterFormData,
  repoPath: string,
  maxResults?: number
): Promise<FilterResponse> => {
  return getDesktopBridge().api.filterCommits({
    query,
    filters,
    repoPath,
    maxResults,
  });
};

export const pickGitProject = async (): Promise<GitProjectSummary | null> => {
  return getDesktopBridge().api.pickGitProject();
};

export const getRecentProjects = async (): Promise<GitProjectSummary[]> => {
  return getDesktopBridge().api.getRecentProjects();
};

export const getRepoSyncProgress = async (
  repoPath: string
): Promise<RepoSyncProgressEvent | null> => {
  return getDesktopBridge().api.getRepoSyncProgress(repoPath);
};

export const deleteRepo = async (repoPath: string): Promise<RepoDeleteResponse> => {
  return getDesktopBridge().api.deleteRepo(repoPath);
};

export const summarizeCommit = async (sha: string): Promise<string> => {
  return getDesktopBridge().api.summarizeCommit(sha);
};

export const summarizeFileChange = async (id: number): Promise<string> => {
  return getDesktopBridge().api.summarizeFileChange(id);
};

export const summarizeHunk = async (id: number): Promise<string> => {
  return getDesktopBridge().api.summarizeHunk(id);
};

export const sendChatMessage = async (
  query: string,
  repoPath: string,
  contextShas: string[]
): Promise<ChatResponse> => {
  return getDesktopBridge().api.sendChatMessage({ query, repoPath, contextShas });
};

export const sendReviewChatMessage = async (
  input: ReviewChatRequest
): Promise<ReviewChatResponse> => {
  return getDesktopBridge().api.sendReviewChatMessage(input);
};

export const initDatabase = async (): Promise<DatabaseResponse> => {
  return getDesktopBridge().api.initDatabase();
};

export const dropDatabase = async (): Promise<DatabaseResponse> => {
  return getDesktopBridge().api.dropDatabase();
};

export const getCommit = async (
  repoPath: string,
  commitSha: string,
  repoSettings?: DesktopRepoSettings
): Promise<CommitResponse> => {
  return getDesktopBridge().api.getCommit(repoPath, commitSha, repoSettings);
};

export const getCommits = async (
  repoPath: string,
  repoSettings?: DesktopRepoSettings
): Promise<CommitsResponse> => {
  return getDesktopBridge().api.getCommits(repoPath, repoSettings);
};

export const compareReviewTarget = async (input: {
  repoPath: string;
  targetMode: "compare" | "commit";
  baseRef?: string;
  headRef?: string;
  commitSha?: string | null;
  contextLines: number;
}): Promise<ReviewCompareResponse> => {
  return getDesktopBridge().api.compareReviewTarget(input);
};

export const generateReview = async (input: {
  repoPath: string;
  targetMode: "compare" | "commit";
  baseRef?: string;
  headRef?: string;
  commitSha?: string | null;
  contextLines: number;
}): Promise<ReviewReport> => {
  return getDesktopBridge().api.generateReview(input);
};

export const createReviewSession = async (input: {
  repoPath: string;
  targetMode: "compare" | "commit";
  baseRef?: string;
  headRef?: string;
  commitSha?: string | null;
  contextLines: number;
}): Promise<ReviewSession> => {
  return getDesktopBridge().api.createReviewSession(input);
};

export const getReviewSession = async (
  sessionId: string
): Promise<ReviewSession> => {
  return getDesktopBridge().api.getReviewSession(sessionId);
};

export const getReviewHistory = async (input: {
  repoPath: string;
  targetMode: "compare" | "commit";
  baseRef?: string;
  headRef?: string;
  commitSha?: string | null;
}): Promise<ReviewHistoryResponse> => {
  return getDesktopBridge().api.getReviewHistory(input);
};

export const startReviewRun = async (input: {
  sessionId: string;
  customInstructions?: string | null;
}): Promise<ReviewRun> => {
  return getDesktopBridge().api.startReviewRun(input);
};

export const getReviewRun = async (input: {
  sessionId: string;
  runId: string;
}): Promise<ReviewRun> => {
  return getDesktopBridge().api.getReviewRun(input);
};

export const cancelReviewRun = async (input: {
  sessionId: string;
  runId: string;
}): Promise<ReviewRun> => {
  return getDesktopBridge().api.cancelReviewRun(input);
};

export const respondReviewApproval = async (input: {
  sessionId: string;
  runId: string;
  approvalId: string;
  decision: "accept" | "acceptForSession" | "decline" | "cancel";
}): Promise<ReviewRun> => {
  return getDesktopBridge().api.respondReviewApproval(input);
};

export const onReviewRuntimeEvent = (
  listener: (
    event: import("@/lib/definitions/review").ReviewRuntimeEvent
  ) => void
): (() => void) => {
  return getDesktopBridge().review.onEvent(listener);
};

export const getCurrentUser = async (): Promise<User> => {
  return getDesktopBridge().api.getCurrentUser();
};

export const logout = async (): Promise<{ message: string }> => {
  return getDesktopBridge().api.logout();
};

export const getDesktopSettingsStatus = async (): Promise<DesktopSettingsStatus> => {
  return getDesktopBridge().settings.getStatus();
};

export const getDesktopRepoSettings = async (
  repoPath: string
): Promise<DesktopRepoSettings> => {
  return getDesktopBridge().settings.getRepoSettings(repoPath);
};

export const getDesktopAdditionalReviewGuidelines = async (
  repoPath: string
): Promise<DesktopAdditionalReviewGuidelineState> => {
  return getDesktopBridge().settings.getAdditionalReviewGuidelines(repoPath);
};

export const saveDesktopAdditionalReviewGuidelines = async (
  input: DesktopAdditionalReviewGuidelineSaveInput
): Promise<DesktopAdditionalReviewGuidelineState> => {
  return getDesktopBridge().settings.saveAdditionalReviewGuidelines(input);
};

export const saveDesktopReviewSettings = async (
  input: DesktopReviewSettings
): Promise<DesktopReviewSettings> => {
  return getDesktopBridge().settings.saveReviewSettings(input);
};

export const validateDesktopAiConfig = async (
  input: DesktopAiConfigInput
): Promise<DesktopAiValidationResult> => {
  return getDesktopBridge().settings.validateAiConfig(input);
};

export const saveDesktopAiConfig = async (
  input: DesktopAiConfigInput
): Promise<DesktopSettingsStatus> => {
  return getDesktopBridge().settings.saveAiConfig(input);
};

export const saveDesktopRepoSettings = async (
  input: DesktopRepoSettingsSaveInput
): Promise<DesktopRepoSettings> => {
  return getDesktopBridge().settings.saveRepoSettings(input);
};

export const getDesktopHealth = async (): Promise<DesktopHealthStatus> => {
  return getDesktopBridge().health.getStatus();
};

export const onRepoSyncEvent = (
  listener: (event: RepoSyncProgressEvent) => void
): (() => void) => {
  return getDesktopBridge().repoSync.onEvent(listener);
};
