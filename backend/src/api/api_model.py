from pydantic import BaseModel, Field
from typing import List, Dict, Any
from data.data_model import Commit, Branch
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
