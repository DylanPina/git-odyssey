import type { FilterFormData } from "@/lib/filter-utils";
import type {
  ChatResponse,
  CommitResponse,
  CommitsResponse,
  DatabaseResponse,
  FilterResponse,
  RepoResponse,
} from "@/lib/definitions/api";
import type { User } from "@/lib/definitions/auth";

export type DesktopServiceState =
  | "running"
  | "starting"
  | "stopped"
  | "error"
  | "unavailable";

export interface DesktopServiceHealth {
  state: DesktopServiceState;
  message?: string;
  url?: string;
}

export interface DesktopSettingsStatus {
  hasOpenAiApiKey: boolean;
  firstRunCompleted: boolean;
  backendPort: number;
  dataDir: string;
  logDir: string;
  databaseUrlConfigured: boolean;
}

export interface DesktopHealthStatus {
  backend: DesktopServiceHealth;
  postgres: DesktopServiceHealth;
  credentials: {
    hasOpenAiApiKey: boolean;
  };
  settings: DesktopSettingsStatus;
}

export interface DesktopCredentialsInput {
  openAiApiKey: string;
}

export interface GitProjectSummary {
  path: string;
  name: string;
  lastOpenedAt: string;
}

export interface GitOdysseyDesktopApi {
  getRepo(repoPath: string): Promise<RepoResponse>;
  ingestRepo(input: {
    repoPath: string;
    maxCommits: number;
    contextLines: number;
    force?: boolean;
  }): Promise<RepoResponse>;
  filterCommits(input: {
    query: string;
    filters: FilterFormData;
    repoPath: string;
    maxResults?: number;
  }): Promise<FilterResponse>;
  pickGitProject(): Promise<GitProjectSummary | null>;
  getRecentProjects(): Promise<GitProjectSummary[]>;
  summarizeCommit(sha: string): Promise<string>;
  summarizeFileChange(id: number): Promise<string>;
  summarizeHunk(id: number): Promise<string>;
  sendChatMessage(input: {
    query: string;
    contextShas: string[];
  }): Promise<ChatResponse>;
  initDatabase(): Promise<DatabaseResponse>;
  dropDatabase(): Promise<DatabaseResponse>;
  getCommit(repoPath: string, commitSha: string): Promise<CommitResponse>;
  getCommits(repoPath: string): Promise<CommitsResponse>;
  getCurrentUser(): Promise<User>;
  logout(): Promise<{ message: string }>;
}

export interface GitOdysseyDesktopBridge {
  api: GitOdysseyDesktopApi;
  settings: {
    getStatus(): Promise<DesktopSettingsStatus>;
    saveCredentials(
      input: DesktopCredentialsInput
    ): Promise<DesktopSettingsStatus>;
  };
  health: {
    getStatus(): Promise<DesktopHealthStatus>;
  };
}

declare global {
  interface Window {
    gitOdysseyDesktop?: GitOdysseyDesktopBridge;
  }
}

export {};
