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

export type ProviderType = "openai" | "openai_compatible";
export type AuthMode = "bearer" | "none";

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
    repoPath: string;
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
    validateAiConfig(input: DesktopAiConfigInput): Promise<DesktopAiValidationResult>;
    saveAiConfig(input: DesktopAiConfigInput): Promise<DesktopSettingsStatus>;
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
