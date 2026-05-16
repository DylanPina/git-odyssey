export type TargetKind = "managed_model" | "vertex_endpoint";
export type CapabilityName = "text_generation" | "embeddings" | "review";
export type ModelSource =
  | "managed_api_model"
  | "deployable_google_model"
  | "deployable_partner_model"
  | "vertex_endpoint"
  | "manual_resource_name";
export type ReviewApprovalDecision =
  | "accept"
  | "acceptForSession"
  | "decline"
  | "cancel";
export type RepoSyncPhase =
  | "planning"
  | "loading_commits"
  | "extracting_ast"
  | "embedding"
  | "writing_db"
  | "completed"
  | "failed";

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

export type ReviewChatFindingContext = ReviewChatFinding;

export type ReviewChatContext = {
  runStatus?: string | null;
  summary?: string | null;
  appliedInstructions?: string | null;
  findings: ReviewChatFinding[];
};

export type ReviewChatTranscriptMessage = {
  role: "user" | "assistant";
  content: string;
  codeContexts?: ReviewChatCodeContext[];
  findingContexts?: ReviewChatFindingContext[];
};

export type ReviewChatRequestInput = {
  sessionId: string;
  runId?: string | null;
  targetOverride?: GoogleAITarget | null;
  message: string;
  codeContexts: ReviewChatCodeContext[];
  findingContexts: ReviewChatFindingContext[];
  messages: ReviewChatTranscriptMessage[];
  reviewContext?: ReviewChatContext | null;
};

export type ReviewChatResponse = {
  response: string;
};

export type RepoSyncProgressEvent = {
  progressId: string;
  repoPath: string;
  phase: RepoSyncPhase;
  label: string;
  percent: number;
  stagePercent: number;
  completedUnits: number;
  totalUnits: number;
  commitCount?: number | null;
  fileChangeCount?: number | null;
  hunkCount?: number | null;
  embeddingBatches?: number | null;
  insertedCommits?: number | null;
  error?: string | null;
  startedAt: string;
  updatedAt: string;
};

export interface GitProjectSummary {
  path: string;
  name: string;
  lastOpenedAt: string;
}

export interface DesktopReviewSettings {
  pullRequestGuidelines: string;
}

export interface DesktopReviewSettingsInput {
  pullRequestGuidelines?: string | null;
}

export interface DesktopAdditionalReviewGuideline {
  id: string;
  text: string;
}

export interface DesktopAdditionalReviewGuidelineState {
  repoPath: string;
  draftGuideline: string;
  guidelines: DesktopAdditionalReviewGuideline[];
  updatedAt: string | null;
}

export interface DesktopAdditionalReviewGuidelineSaveInput {
  repoPath: string;
  draftGuideline: string;
  guidelines: DesktopAdditionalReviewGuideline[];
}

export interface DesktopRepoSettings {
  maxCommits: number;
  contextLines: number;
  pullRequestGuidelines: string;
}

export interface DesktopRepoSettingsInput {
  maxCommits?: number | string | null;
  contextLines?: number | string | null;
  pullRequestGuidelines?: string | null;
}

export interface DesktopRepoSettingsSaveInput extends DesktopRepoSettings {
  repoPath: string;
}

export interface GoogleAITarget {
  target_kind: TargetKind;
  resource_name: string;
  display_name: string;
  publisher?: string | null;
  version?: string | null;
  location?: string | null;
  capabilities: CapabilityName[];
  adapter_family?: string | null;
  embedding_output_dimension?: number | null;
  source?: ModelSource | null;
}

export interface AIRuntimeConfig {
  schema_version: number;
  google_project_id: string | null;
  google_location: string;
  capabilities: {
    text_generation: GoogleAITarget | null;
    embeddings: GoogleAITarget | null;
    review: GoogleAITarget | null;
  };
}

export interface DesktopAiSavedProfile {
  id: string;
  name: string;
  config: AIRuntimeConfig;
  secretValues: Record<string, string>;
  updatedAt: string;
}

export interface DesktopAiProfileSaveInput {
  id?: string | null;
  name: string;
  config: AIRuntimeConfig;
  secretValues: Record<string, string>;
}

export interface AICapabilityStatus {
  configured: boolean;
  ready: boolean;
  targetKind: TargetKind | null;
  resourceName: string | null;
  displayName: string | null;
  publisher: string | null;
  version: string | null;
  location: string | null;
  adapterFamily: string | null;
  embeddingOutputDimension?: number | null;
  message?: string;
  reindexRequired?: boolean;
}

export interface GoogleRuntimeStatus {
  projectId: string | null;
  location: string | null;
  adcReady: boolean;
  adcProjectId?: string | null;
  message?: string | null;
}

export interface DesktopSettingsStatus {
  firstRunCompleted: boolean;
  backendPort: number;
  dataDir: string;
  logDir: string;
  databaseUrlConfigured: boolean;
  aiRuntimeConfig: AIRuntimeConfig;
  savedAiProfiles: DesktopAiSavedProfile[];
  reviewSettings: DesktopReviewSettings;
  ai: {
    google: GoogleRuntimeStatus;
    textGeneration: AICapabilityStatus;
    embeddings: AICapabilityStatus;
    review: AICapabilityStatus;
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
  savedAiProfiles: DesktopAiSavedProfile[];
  reviewSettings: DesktopReviewSettings;
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
  savedAiProfiles?: DesktopAiSavedProfile[];
  reviewSettings?: DesktopReviewSettingsInput;
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
    target_kind: TargetKind | null;
    resource_name: string | null;
    display_name: string | null;
    publisher: string | null;
    version: string | null;
    location: string | null;
    adapter_family: string | null;
    embedding_output_dimension?: number | null;
    message?: string | null;
  };
  embeddings: {
    configured: boolean;
    ready: boolean;
    target_kind: TargetKind | null;
    resource_name: string | null;
    display_name: string | null;
    publisher: string | null;
    version: string | null;
    location: string | null;
    adapter_family: string | null;
    embedding_output_dimension?: number | null;
    message?: string | null;
    reindex_required?: boolean;
  };
  review: {
    configured: boolean;
    ready: boolean;
    target_kind: TargetKind | null;
    resource_name: string | null;
    display_name: string | null;
    publisher: string | null;
    version: string | null;
    location: string | null;
    adapter_family: string | null;
    embedding_output_dimension?: number | null;
    message?: string | null;
  };
}

export interface GoogleModelGardenEntry {
  id: string;
  resource_name: string;
  display_name: string;
  publisher?: string | null;
  version?: string | null;
  location: string;
  target_kind: TargetKind;
  source: ModelSource;
  capabilities: CapabilityName[];
  adapter_family?: string | null;
  deployable: boolean;
  description?: string | null;
}

export interface GoogleModelGardenListResponse {
  items: GoogleModelGardenEntry[];
}

export interface GoogleTargetValidationInput {
  config: AIRuntimeConfig;
  capability: CapabilityName;
  target: GoogleAITarget;
}

export interface GoogleTargetValidationResult {
  configured: boolean;
  ready: boolean;
  capability: CapabilityName;
  target: GoogleAITarget;
  message?: string | null;
  embedding_output_dimension?: number | null;
}

export interface GoogleDeploymentInput {
  config: AIRuntimeConfig;
  model_resource_name: string;
  endpoint_resource_name: string;
  deployed_model_display_name: string;
  machine_type: string;
  accelerator_type?: string | null;
  accelerator_count?: number | null;
  min_replica_count?: number;
  max_replica_count?: number;
  accepted_terms: boolean;
  accepted_billing_notice: boolean;
}

export interface GoogleDeploymentResult {
  operation_name?: string | null;
  endpoint_resource_name: string;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
}

export interface BackendCapabilityPayload {
  configured?: boolean;
  ready?: boolean;
  target_kind?: TargetKind | null;
  resource_name?: string | null;
  display_name?: string | null;
  publisher?: string | null;
  version?: string | null;
  location?: string | null;
  adapter_family?: string | null;
  embedding_output_dimension?: number | null;
  message?: string | null;
  reindex_required?: boolean;
}

export interface BackendDesktopHealthPayload {
  authentication?: {
    desktop_backend_reachable?: boolean;
    desktop_user_available?: boolean;
  };
  ai?: {
    google?: {
      project_id?: string | null;
      location?: string | null;
      adc_ready?: boolean;
      adc_project_id?: string | null;
      message?: string | null;
    };
    text_generation?: BackendCapabilityPayload | null;
    embeddings?: BackendCapabilityPayload | null;
    review?: BackendCapabilityPayload | null;
  };
  desktop_user?: {
    id: number;
    username: string;
    email?: string;
  } | null;
}
