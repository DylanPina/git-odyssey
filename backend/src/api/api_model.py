from pydantic import BaseModel, Field
from typing import List, Dict, Any
from data.data_model import Commit, Branch


class RepoResponse(BaseModel):
    repo_path: str
    branches: List[Branch]
    commits: List[Commit]


class FilterRequest(BaseModel):
    query: str = ""
    filters: Dict[str, Any] = Field(default_factory=dict)
    repo_path: str = ""
    max_results: int = 8


class FilterResponse(BaseModel):
    commit_shas: List[str] = Field(default_factory=list)


class ChatbotRequest(BaseModel):
    query: str = ""
    context_shas: List[str] = Field(default_factory=list)


class CitedCommit(BaseModel):
    sha: str
    similarity: float
    message: str


class ChatbotResponse(BaseModel):
    response: str = ""
    cited_commits: List[CitedCommit] = Field(default_factory=list)


class IngestRequest(BaseModel):
    repo_path: str = ""
    max_commits: int = 50
    context_lines: int = 3
    force: bool = False


class CommitsResponse(BaseModel):
    commits: List[Commit] = Field(default_factory=list)


class CommitResponse(BaseModel):
    commit: Commit = Field(default_factory=Commit)
