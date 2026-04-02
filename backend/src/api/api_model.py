from datetime import datetime
from typing import Any, Dict, List, Literal

from pydantic import BaseModel, Field

from data.data_model import Branch, Commit, FileChange
from infrastructure.ai_runtime import AIRuntimeConfig


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


class IngestRequest(BaseModel):
    repo_path: str = ""
    max_commits: int = 50
    context_lines: int = 3
    force: bool = False


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
    context_lines: int = 3


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
    context_lines: int = 3


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
    context_lines: int = 3


class ReviewRunStartRequest(BaseModel):
    engine: str = "codex_cli"
    mode: str = "native_review"
    custom_instructions: str | None = None


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
