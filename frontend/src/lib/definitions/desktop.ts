import type { FilterFormData } from "@/lib/filter-utils";
import type {
  ChatResponse,
  CommitResponse,
  CommitsResponse,
  DatabaseResponse,
  FilterResponse,
  RepoDeleteResponse,
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

export type TargetKind = "managed_model" | "vertex_endpoint";
export type CapabilityName = "text_generation" | "embeddings" | "review";
export type ModelSource =
  | "managed_api_model"
  | "deployable_google_model"
  | "deployable_partner_model"
  | "vertex_endpoint"
  | "manual_resource_name";

export interface DesktopReviewSettings {
  pullRequestGuidelines: string;
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

export interface DesktopRepoSettingsSaveInput extends DesktopRepoSettings {
  repoPath: string;
}

export const DEFAULT_DESKTOP_REVIEW_SETTINGS: DesktopReviewSettings = {
  pullRequestGuidelines: "",
};

export const DEFAULT_DESKTOP_REPO_SETTINGS: DesktopRepoSettings = {
  maxCommits: 50,
  contextLines: 10,
  pullRequestGuidelines: "",
};

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
    google: GoogleRuntimeStatus;
    textGeneration: AICapabilityStatus;
    embeddings: AICapabilityStatus;
    review: AICapabilityStatus;
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

export interface GitProjectSummary {
  path: string;
  name: string;
  lastOpenedAt: string;
}

export type RepoSyncPhase =
  | "planning"
  | "loading_commits"
  | "extracting_ast"
  | "embedding"
  | "writing_db"
  | "completed"
  | "failed";

export interface RepoSyncProgressEvent {
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
}

export interface GitOdysseyDesktopApi {
  getRepo(
    repoPath: string,
    repoSettings?: DesktopRepoSettings,
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
  getRepoSyncProgress(repoPath: string): Promise<RepoSyncProgressEvent | null>;
  deleteRepo(repoPath: string): Promise<RepoDeleteResponse>;
  summarizeCommit(sha: string): Promise<string>;
  summarizeFileChange(id: number): Promise<string>;
  summarizeHunk(id: number): Promise<string>;
  sendChatMessage(input: {
    query: string;
    repoPath: string;
    contextShas: string[];
    targetOverride?: GoogleAITarget | null;
  }): Promise<ChatResponse>;
  sendReviewChatMessage(input: ReviewChatRequest): Promise<ReviewChatResponse>;
  initDatabase(): Promise<DatabaseResponse>;
  dropDatabase(): Promise<DatabaseResponse>;
  getCommit(
    repoPath: string,
    commitSha: string,
    repoSettings?: DesktopRepoSettings,
  ): Promise<CommitResponse>;
  getCommits(
    repoPath: string,
    repoSettings?: DesktopRepoSettings,
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
  getReviewRun(input: { sessionId: string; runId: string }): Promise<ReviewRun>;
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
    getAdditionalReviewGuidelines(
      repoPath: string,
    ): Promise<DesktopAdditionalReviewGuidelineState>;
    saveAdditionalReviewGuidelines(
      input: DesktopAdditionalReviewGuidelineSaveInput,
    ): Promise<DesktopAdditionalReviewGuidelineState>;
    saveReviewSettings(
      input: DesktopReviewSettings,
    ): Promise<DesktopReviewSettings>;
    validateAiConfig(
      input: DesktopAiConfigInput,
    ): Promise<DesktopAiValidationResult>;
    listGoogleModelGarden(input: {
      googleProjectId: string;
      googleLocation: string;
    }): Promise<GoogleModelGardenListResponse>;
    validateGoogleTarget(
      input: GoogleTargetValidationInput,
    ): Promise<GoogleTargetValidationResult>;
    deployGoogleModel(
      input: GoogleDeploymentInput,
    ): Promise<GoogleDeploymentResult>;
    saveAiProfile(
      input: DesktopAiProfileSaveInput,
    ): Promise<DesktopSettingsStatus>;
    deleteAiProfile(profileId: string): Promise<DesktopSettingsStatus>;
    saveAiConfig(input: DesktopAiConfigInput): Promise<DesktopSettingsStatus>;
    saveRepoSettings(
      input: DesktopRepoSettingsSaveInput,
    ): Promise<DesktopRepoSettings>;
  };
  health: {
    getStatus(): Promise<DesktopHealthStatus>;
  };
  review: {
    onEvent(listener: (event: ReviewRuntimeEvent) => void): () => void;
  };
  repoSync: {
    onEvent(listener: (event: RepoSyncProgressEvent) => void): () => void;
  };
}

declare global {
  interface Window {
    gitOdysseyDesktop?: GitOdysseyDesktopBridge;
  }
}

export {};
