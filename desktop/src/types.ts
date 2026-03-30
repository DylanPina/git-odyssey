export type ProviderType = "openai" | "openai_compatible";
export type AuthMode = "bearer" | "none";
export type CapabilityName = "text_generation" | "embeddings";
export type ReviewApprovalDecision =
  | "accept"
  | "acceptForSession"
  | "decline"
  | "cancel";

export type ReviewChatCodeContext = {
  id: string;
  filePath: string;
  side: "original" | "modified";
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  selectedText: string;
  language?: string;
  isTruncated?: boolean;
};

export type ReviewChatFinding = {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  body: string;
  file_path: string;
  new_start?: number | null;
  old_start?: number | null;
};

export type ReviewChatContext = {
  runStatus?: string | null;
  summary?: string | null;
  findings: ReviewChatFinding[];
};

export type ReviewChatTranscriptMessage = {
  role: "user" | "assistant";
  content: string;
  codeContexts?: ReviewChatCodeContext[];
};

export type ReviewChatRequestInput = {
  sessionId: string;
  runId?: string | null;
  message: string;
  codeContexts: ReviewChatCodeContext[];
  messages: ReviewChatTranscriptMessage[];
  reviewContext?: ReviewChatContext | null;
};

export type ReviewChatResponse = {
  response: string;
};

export interface GitProjectSummary {
  path: string;
  name: string;
  lastOpenedAt: string;
}

export interface DesktopRepoSettings {
  maxCommits: number;
  contextLines: number;
}

export interface DesktopRepoSettingsInput {
  maxCommits?: number | string | null;
  contextLines?: number | string | null;
}

export interface DesktopRepoSettingsSaveInput extends DesktopRepoSettings {
  repoPath: string;
}

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
    text_generation: TextGenerationBinding | null;
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
  credentials: CredentialStatus;
  settings: DesktopSettingsStatus;
}

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

export interface CredentialStatus {
  secretRefs: Record<string, boolean>;
}

export interface DesktopConfigState {
  backendPort: number;
  databaseUrl: string | null;
  databaseSslMode: string;
  dataDir: string;
  logDir: string;
  aiRuntimeConfig: AIRuntimeConfig;
  firstRunCompleted: boolean;
  recentProjects: GitProjectSummary[];
  repoSettings: Record<string, DesktopRepoSettings>;
  recoveryMessage?: string;
}

export interface DesktopConfigPatch {
  backendPort?: number;
  databaseUrl?: string | null;
  databaseSslMode?: string;
  dataDir?: string;
  logDir?: string;
  aiRuntimeConfig?: AIRuntimeConfig;
  firstRunCompleted?: boolean;
  recentProjects?: GitProjectSummary[];
  repoSettings?: Record<string, DesktopRepoSettingsInput>;
  recoveryMessage?: string;
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

export interface BackendCapabilityPayload {
  configured?: boolean;
  ready?: boolean;
  provider_type?: ProviderType | null;
  model_id?: string | null;
  base_url?: string | null;
  auth_mode?: AuthMode | null;
  secret_present?: boolean;
  message?: string | null;
  reindex_required?: boolean;
}

export interface BackendDesktopHealthPayload {
  authentication?: {
    desktop_backend_reachable?: boolean;
    desktop_user_available?: boolean;
  };
  ai?: {
    text_generation?: BackendCapabilityPayload | null;
    embeddings?: BackendCapabilityPayload | null;
  };
  desktop_user?: {
    id: number;
    username: string;
    email?: string;
  } | null;
}
