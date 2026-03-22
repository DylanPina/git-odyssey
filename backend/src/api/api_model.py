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
    max_results: int = 8


class FilterResponse(BaseModel):
    commit_shas: List[str] = Field(default_factory=list)


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
    base_ref: str = ""
    head_ref: str = ""
    context_lines: int = 3


class ReviewStats(BaseModel):
    files_changed: int = 0
    additions: int = 0
    deletions: int = 0


class ReviewCompareResponse(BaseModel):
    repo_path: str
    base_ref: str
    head_ref: str
    merge_base_sha: str
    stats: ReviewStats = Field(default_factory=ReviewStats)
    file_changes: List[FileChange] = Field(default_factory=list)
    truncated: bool = False


class GenerateReviewRequest(BaseModel):
    repo_path: str = ""
    base_ref: str = ""
    head_ref: str = ""
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
