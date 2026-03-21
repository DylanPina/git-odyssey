import type {
  RepoResponse,
  FilterResponse,
  ChatResponse,
  DatabaseResponse,
  CommitResponse,
  CommitsResponse,
} from "../lib/definitions/api";
import type { User } from "@/lib/definitions/auth";
import type {
  DesktopAiConfigInput,
  DesktopAiValidationResult,
  GitProjectSummary,
  DesktopHealthStatus,
  DesktopSettingsStatus,
  GitOdysseyDesktopBridge,
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
  repoPath: string
): Promise<RepoResponse> => {
  return getDesktopBridge().api.getRepo(repoPath);
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

export const initDatabase = async (): Promise<DatabaseResponse> => {
  return getDesktopBridge().api.initDatabase();
};

export const dropDatabase = async (): Promise<DatabaseResponse> => {
  return getDesktopBridge().api.dropDatabase();
};

export const getCommit = async (
  repoPath: string,
  commitSha: string
): Promise<CommitResponse> => {
  return getDesktopBridge().api.getCommit(repoPath, commitSha);
};

export const getCommits = async (repoPath: string): Promise<CommitsResponse> => {
  return getDesktopBridge().api.getCommits(repoPath);
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

export const getDesktopHealth = async (): Promise<DesktopHealthStatus> => {
  return getDesktopBridge().health.getStatus();
};
