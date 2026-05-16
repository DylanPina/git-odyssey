from datetime import datetime
from typing import Any, Dict, List, Literal

from pydantic import BaseModel, Field

from data.data_model import Branch, Commit, FileChange
from infrastructure.ai_runtime import AIRuntimeConfig, CapabilityName, GoogleAITarget


class RepoResponse(BaseModel):
    repo_path: str
    branches: List[Branch]
    commits: List[Commit]
    reindex_required: bool = False


class FilterRequest(BaseModel):
    query: str = ""
    filters: Dict[str, Any] = Field(default_factory=dict)
    repo_path: str = ""
    max_results: int = 20


FilterMatchType = Literal["commit", "file_change", "hunk"]
FilterHighlightStrategy = Literal[
    "exact_query",
    "target_hunk",
    "file_header",
    "none",
]
FilterPreviewKind = Literal["text", "diff"]
ReviewTargetMode = Literal["compare", "commit"]


class FilterDisplayMatch(BaseModel):
    match_type: FilterMatchType
    file_path: str | None = None
    hunk_id: int | None = None
    new_start: int | None = None
    old_start: int | None = None
    preview: str | None = None
    matched_text: str | None = None
    preview_kind: FilterPreviewKind = "text"
    highlight_strategy: FilterHighlightStrategy = "none"


class FilterSearchResult(BaseModel):
    sha: str
    similarity: float | None = None
    display_match: FilterDisplayMatch | None = None


class FilterResponse(BaseModel):
    commit_shas: List[str] = Field(default_factory=list)
    results: List[FilterSearchResult] = Field(default_factory=list)
    total_ranked_results: int = 0
    total_relevant_results: int = 0
    has_more_relevant: bool = False
    max_results: int = 20


class ChatbotRequest(BaseModel):
    query: str = ""
    repo_path: str = ""
    context_shas: List[str] = Field(default_factory=list)
    target_override: GoogleAITarget | None = None


class CitedCommit(BaseModel):
    sha: str
    similarity: float
    message: str


class ChatbotResponse(BaseModel):
    response: str = ""
    cited_commits: List[CitedCommit] = Field(default_factory=list)


class AIRuntimeValidationRequest(BaseModel):
    config: AIRuntimeConfig
    secret_values: Dict[str, str] = Field(default_factory=dict)


class GoogleModelGardenListRequest(BaseModel):
    google_project_id: str
    google_location: str = "us-central1"


class GoogleModelGardenEntryResponse(BaseModel):
    id: str
    resource_name: str
    display_name: str
    publisher: str | None = None
    version: str | None = None
    location: str
    target_kind: str
    source: str
    capabilities: List[str] = Field(default_factory=list)
    adapter_family: str | None = None
    deployable: bool = False
    description: str | None = None


class GoogleModelGardenListResponse(BaseModel):
    items: List[GoogleModelGardenEntryResponse] = Field(default_factory=list)


class GoogleTargetValidationRequest(BaseModel):
    config: AIRuntimeConfig
    capability: CapabilityName
    target: GoogleAITarget


class GoogleTargetValidationResponse(BaseModel):
    configured: bool = True
    ready: bool
    capability: CapabilityName
    target: GoogleAITarget
    message: str | None = None
    embedding_output_dimension: int | None = None


class GoogleDeploymentRequest(BaseModel):
    config: AIRuntimeConfig
    model_resource_name: str
    endpoint_resource_name: str
    deployed_model_display_name: str
    machine_type: str
    accelerator_type: str | None = None
    accelerator_count: int | None = None
    min_replica_count: int = 1
    max_replica_count: int = 1
    accepted_terms: bool = False
    accepted_billing_notice: bool = False


class GoogleDeploymentResponse(BaseModel):
    operation_name: str | None = None
    endpoint_resource_name: str
    request: Dict[str, Any]
    response: Dict[str, Any] = Field(default_factory=dict)


class IngestRequest(BaseModel):
    repo_path: str = ""
    max_commits: int = 50
    context_lines: int = 10
    force: bool = False
    progress_id: str | None = None


IngestProgressPhase = Literal[
    "planning",
    "loading_commits",
    "extracting_ast",
    "embedding",
    "writing_db",
    "completed",
    "failed",
]


class IngestProgressResponse(BaseModel):
    job_id: str
    progress_id: str
    repo_path: str
    phase: IngestProgressPhase
    label: str
    percent: float
    stage_percent: float
    completed_units: int = 0
    total_units: int = 0
    commit_count: int | None = None
    file_change_count: int | None = None
    hunk_count: int | None = None
    embedding_batches: int | None = None
    inserted_commits: int | None = None
    error: str | None = None
    started_at: datetime
    updated_at: datetime


IngestJobStatus = Literal["queued", "running", "completed", "failed", "cancelled"]


class IngestJobResponse(BaseModel):
    job_id: str
    repo_path: str
    status: IngestJobStatus
    result_repo_path: str | None = None
    error: str | None = None
    progress: IngestProgressResponse
    started_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None


class CommitsResponse(BaseModel):
    commits: List[Commit] = Field(default_factory=list)


class CommitResponse(BaseModel):
    commit: Commit = Field(default_factory=Commit)


class ReviewCompareRequest(BaseModel):
    repo_path: str = ""
    target_mode: ReviewTargetMode = "compare"
    base_ref: str = ""
    head_ref: str = ""
    commit_sha: str | None = None
    context_lines: int = 10


class ReviewStats(BaseModel):
    files_changed: int = 0
    additions: int = 0
    deletions: int = 0


class ReviewCompareResponse(BaseModel):
    repo_path: str
    target_mode: ReviewTargetMode = "compare"
    base_ref: str
    head_ref: str
    commit_sha: str | None = None
    merge_base_sha: str
    stats: ReviewStats = Field(default_factory=ReviewStats)
    file_changes: List[FileChange] = Field(default_factory=list)
    truncated: bool = False


class GenerateReviewRequest(BaseModel):
    repo_path: str = ""
    target_mode: ReviewTargetMode = "compare"
    base_ref: str = ""
    head_ref: str = ""
    commit_sha: str | None = None
    context_lines: int = 10
    applied_instructions: str | None = None


class ReviewFinding(BaseModel):
    id: str
    severity: Literal["high", "medium", "low"]
    title: str
    body: str
    file_path: str
    new_start: int | None = None
    old_start: int | None = None


class ReviewReport(BaseModel):
    summary: str
    findings: List[ReviewFinding] = Field(default_factory=list)
    partial: bool = False
    generated_at: datetime


ReviewSessionStatus = Literal[
    "ready",
    "running",
    "completed",
    "failed",
    "cancelled",
]
ReviewRunStatus = Literal[
    "pending",
    "running",
    "awaiting_approval",
    "completed",
    "failed",
    "cancelled",
]
ReviewApprovalStatus = Literal[
    "pending",
    "accepted",
    "accepted_for_session",
    "declined",
    "cancelled",
]


class ReviewSessionCreateRequest(BaseModel):
    repo_path: str = ""
    target_mode: ReviewTargetMode = "compare"
    base_ref: str = ""
    head_ref: str = ""
    commit_sha: str | None = None
    context_lines: int = 10


class ReviewRunStartRequest(BaseModel):
    engine: str = "vertex_review"
    mode: str = "non_agentic_review"
    custom_instructions: str | None = None
    applied_instructions: str | None = None


class ReviewRunStatusUpdateRequest(BaseModel):
    status: ReviewRunStatus
    error_detail: str | None = None
    review_thread_id: str | None = None
    worktree_path: str | None = None
    codex_home_path: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


class ReviewRunEventInput(BaseModel):
    event_type: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None


class ReviewRunEventsRequest(BaseModel):
    events: List[ReviewRunEventInput] = Field(default_factory=list)


class ReviewRunEventResponse(BaseModel):
    id: int
    run_id: str
    sequence: int
    event_type: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class ReviewApprovalUpsertRequest(BaseModel):
    id: str
    method: str
    status: ReviewApprovalStatus
    summary: str | None = None
    thread_id: str | None = None
    turn_id: str | None = None
    item_id: str | None = None
    request_payload: Dict[str, Any] = Field(default_factory=dict)
    response_payload: Dict[str, Any] | None = None


class ReviewApprovalResponse(BaseModel):
    id: str
    run_id: str
    method: str
    status: ReviewApprovalStatus
    summary: str | None = None
    thread_id: str | None = None
    turn_id: str | None = None
    item_id: str | None = None
    request_payload: Dict[str, Any] = Field(default_factory=dict)
    response_payload: Dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class ReviewSubmittedFinding(BaseModel):
    id: str | None = None
    severity: str
    title: str
    body: str
    file_path: str
    new_start: int | None = None
    old_start: int | None = None


class ReviewResultSubmitRequest(BaseModel):
    summary: str
    findings: List[ReviewSubmittedFinding] = Field(default_factory=list)
    partial: bool = False
    generated_at: datetime | None = None


class ReviewResultResponse(BaseModel):
    id: str
    run_id: str
    summary: str
    findings: List[ReviewFinding] = Field(default_factory=list)
    partial: bool = False
    generated_at: datetime
    created_at: datetime
    updated_at: datetime


class ReviewChatCodeContext(BaseModel):
    id: str
    filePath: str
    side: Literal["original", "modified"]
    startLine: int
    startColumn: int
    endLine: int
    endColumn: int
    selectedText: str
    language: str | None = None
    isTruncated: bool | None = None


class ReviewChatFindingContext(BaseModel):
    id: str
    severity: Literal["high", "medium", "low"]
    title: str
    body: str
    file_path: str
    new_start: int | None = None
    old_start: int | None = None


class ReviewChatContext(BaseModel):
    runStatus: str | None = None
    summary: str | None = None
    appliedInstructions: str | None = None
    findings: List[ReviewChatFindingContext] = Field(default_factory=list)


class ReviewChatTranscriptMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    codeContexts: List[ReviewChatCodeContext] = Field(default_factory=list)
    findingContexts: List[ReviewChatFindingContext] = Field(default_factory=list)


class ReviewChatRequest(BaseModel):
    sessionId: str
    runId: str | None = None
    target_override: GoogleAITarget | None = None
    message: str
    codeContexts: List[ReviewChatCodeContext] = Field(default_factory=list)
    findingContexts: List[ReviewChatFindingContext] = Field(default_factory=list)
    messages: List[ReviewChatTranscriptMessage] = Field(default_factory=list)
    reviewContext: ReviewChatContext | None = None


class ReviewChatResponse(BaseModel):
    response: str


class ReviewSeverityCounts(BaseModel):
    high: int = 0
    medium: int = 0
    low: int = 0


class ReviewHistoryEntry(BaseModel):
    session_id: str
    run_id: str
    repo_path: str
    target_mode: ReviewTargetMode = "compare"
    base_ref: str
    head_ref: str
    commit_sha: str | None = None
    merge_base_sha: str
    base_head_sha: str
    head_head_sha: str
    engine: str
    mode: str
    partial: bool = False
    summary: str
    findings_count: int = 0
    severity_counts: ReviewSeverityCounts = Field(default_factory=ReviewSeverityCounts)
    generated_at: datetime
    completed_at: datetime | None = None
    run_created_at: datetime


class ReviewHistoryResponse(BaseModel):
    items: List[ReviewHistoryEntry] = Field(default_factory=list)


class ReviewRunResponse(BaseModel):
    id: str
    session_id: str
    engine: str
    mode: str
    status: ReviewRunStatus
    custom_instructions: str | None = None
    applied_instructions: str | None = None
    error_detail: str | None = None
    review_thread_id: str | None = None
    worktree_path: str | None = None
    codex_home_path: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    events: List[ReviewRunEventResponse] = Field(default_factory=list)
    approvals: List[ReviewApprovalResponse] = Field(default_factory=list)
    result: ReviewResultResponse | None = None


class ReviewSessionResponse(BaseModel):
    id: str
    repo_path: str
    target_mode: ReviewTargetMode = "compare"
    base_ref: str
    head_ref: str
    commit_sha: str | None = None
    merge_base_sha: str
    base_head_sha: str
    head_head_sha: str
    stats: ReviewStats = Field(default_factory=ReviewStats)
    file_changes: List[FileChange] = Field(default_factory=list)
    truncated: bool = False
    status: ReviewSessionStatus
    created_at: datetime
    updated_at: datetime
    runs: List[ReviewRunResponse] = Field(default_factory=list)
