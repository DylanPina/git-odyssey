import type { FilterFormData } from "@/lib/filter-utils";
import type {
  ChatResponse,
  CommitResponse,
  CommitsResponse,
  DatabaseResponse,
  FilterResponse,
  RepoResponse,
} from "@/lib/definitions/api";
import type {
  ReviewCompareResponse,
  ReviewApprovalDecision,
  ReviewChatRequest,
  ReviewChatResponse,
  ReviewHistoryResponse,
  ReviewReport,
  ReviewRun,
  ReviewRuntimeEvent,
  ReviewSession,
} from "@/lib/definitions/review";
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

export type ProviderType = "openai" | "openai_compatible";
export type AuthMode = "bearer" | "none";

export interface DesktopRepoSettings {
  maxCommits: number;
  contextLines: number;
}

export interface DesktopRepoSettingsSaveInput extends DesktopRepoSettings {
  repoPath: string;
}

export const DEFAULT_DESKTOP_REPO_SETTINGS: DesktopRepoSettings = {
  maxCommits: 50,
  contextLines: 3,
};

export interface ProviderProfileConfig {
  id: string;
  provider_type: ProviderType;
  label: string;
  base_url: string | null;
  auth_mode: AuthMode;
  api_key_secret_ref: string | null;
  supports_text_generation: boolean;
  supports_embeddings: boolean;
}

export interface TextGenerationBinding {
  provider_profile_id: string;
  model_id: string;
  temperature: number;
}

export interface EmbeddingsBinding {
  provider_profile_id: string;
  model_id: string;
}

export interface AIRuntimeConfig {
  schema_version: number;
  profiles: ProviderProfileConfig[];
  capabilities: {
    text_generation: TextGenerationBinding;
    embeddings: EmbeddingsBinding | null;
  };
}

export interface AICapabilityStatus {
  configured: boolean;
  ready: boolean;
  providerType: ProviderType | null;
  modelId: string | null;
  baseUrl: string | null;
  authMode: AuthMode | null;
  secretPresent: boolean;
  message?: string;
  reindexRequired?: boolean;
}

export interface DesktopSettingsStatus {
  firstRunCompleted: boolean;
  backendPort: number;
  dataDir: string;
  logDir: string;
  databaseUrlConfigured: boolean;
  aiRuntimeConfig: AIRuntimeConfig;
  ai: {
    textGeneration: AICapabilityStatus;
    embeddings: AICapabilityStatus;
  };
}

export interface DesktopHealthStatus {
  backend: DesktopServiceHealth;
  postgres: DesktopServiceHealth;
  authentication: {
    ready: boolean;
    desktopBackendReachable: boolean;
    desktopUserAvailable: boolean;
  };
  ai: {
    textGeneration: AICapabilityStatus;
    embeddings: AICapabilityStatus;
  };
  desktopUser: {
    id: number;
    username: string;
    email?: string;
  } | null;
  credentials: {
    secretRefs: Record<string, boolean>;
  };
  settings: DesktopSettingsStatus;
}

export interface DesktopAiConfigInput {
  config: AIRuntimeConfig;
  secretValues: Record<string, string>;
}

export interface DesktopAiValidationResult {
  text_generation: {
    configured: boolean;
    ready: boolean;
    provider_type: ProviderType | null;
    model_id: string | null;
    base_url: string | null;
    auth_mode: AuthMode | null;
    secret_present: boolean;
    message?: string | null;
  };
  embeddings: {
    configured: boolean;
    ready: boolean;
    provider_type: ProviderType | null;
    model_id: string | null;
    base_url: string | null;
    auth_mode: AuthMode | null;
    secret_present: boolean;
    message?: string | null;
    reindex_required?: boolean;
  };
}

export interface GitProjectSummary {
  path: string;
  name: string;
  lastOpenedAt: string;
}

export interface GitOdysseyDesktopApi {
  getRepo(
    repoPath: string,
    repoSettings?: DesktopRepoSettings
  ): Promise<RepoResponse>;
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
    repoPath: string;
    contextShas: string[];
  }): Promise<ChatResponse>;
  sendReviewChatMessage(input: ReviewChatRequest): Promise<ReviewChatResponse>;
  initDatabase(): Promise<DatabaseResponse>;
  dropDatabase(): Promise<DatabaseResponse>;
  getCommit(
    repoPath: string,
    commitSha: string,
    repoSettings?: DesktopRepoSettings
  ): Promise<CommitResponse>;
  getCommits(
    repoPath: string,
    repoSettings?: DesktopRepoSettings
  ): Promise<CommitsResponse>;
  compareReviewTarget(input: {
    repoPath: string;
    targetMode: "compare" | "commit";
    baseRef?: string;
    headRef?: string;
    commitSha?: string | null;
    contextLines: number;
  }): Promise<ReviewCompareResponse>;
  generateReview(input: {
    repoPath: string;
    targetMode: "compare" | "commit";
    baseRef?: string;
    headRef?: string;
    commitSha?: string | null;
    contextLines: number;
  }): Promise<ReviewReport>;
  createReviewSession(input: {
    repoPath: string;
    targetMode: "compare" | "commit";
    baseRef?: string;
    headRef?: string;
    commitSha?: string | null;
    contextLines: number;
  }): Promise<ReviewSession>;
  getReviewSession(sessionId: string): Promise<ReviewSession>;
  getReviewHistory(input: {
    repoPath: string;
    targetMode: "compare" | "commit";
    baseRef?: string;
    headRef?: string;
    commitSha?: string | null;
  }): Promise<ReviewHistoryResponse>;
  startReviewRun(input: {
    sessionId: string;
    customInstructions?: string | null;
  }): Promise<ReviewRun>;
  getReviewRun(input: {
    sessionId: string;
    runId: string;
  }): Promise<ReviewRun>;
  cancelReviewRun(input: {
    sessionId: string;
    runId: string;
  }): Promise<ReviewRun>;
  respondReviewApproval(input: {
    sessionId: string;
    runId: string;
    approvalId: string;
    decision: ReviewApprovalDecision;
  }): Promise<ReviewRun>;
  getCurrentUser(): Promise<User>;
  logout(): Promise<{ message: string }>;
}

export interface GitOdysseyDesktopBridge {
  api: GitOdysseyDesktopApi;
  settings: {
    getStatus(): Promise<DesktopSettingsStatus>;
    getRepoSettings(repoPath: string): Promise<DesktopRepoSettings>;
    validateAiConfig(input: DesktopAiConfigInput): Promise<DesktopAiValidationResult>;
    saveAiConfig(input: DesktopAiConfigInput): Promise<DesktopSettingsStatus>;
    saveRepoSettings(
      input: DesktopRepoSettingsSaveInput
    ): Promise<DesktopRepoSettings>;
  };
  health: {
    getStatus(): Promise<DesktopHealthStatus>;
  };
  review: {
    onEvent(listener: (event: ReviewRuntimeEvent) => void): () => void;
  };
}

declare global {
  interface Window {
    gitOdysseyDesktop?: GitOdysseyDesktopBridge;
  }
}

export {};
