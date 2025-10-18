from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from data.data_model import Branch, Commit

class IngestRequest(BaseModel):
  url: str
  max_commits: Optional[int] = None
  context_lines: Optional[int] = None

class RepoResponse(BaseModel):
  repo_url: str
  branches: List[Branch] = Field(default_factory=list)
  commits: List[Commit] = Field(default_factory=list)

class FilterRequest(BaseModel):
  query: str
  filters: Optional[Dict[str, Any]] = None
  repo_url: str
  max_results: Optional[int] = None 

class FilterResponse(BaseModel):
  commit_shas: List[str] = Field(default_factory=list)

class ChatbotRequest(BaseModel):
  query: str
  context_shas: List[str] = Field(default_factory=list)

class ChatbotResponse(BaseModel):
  response: str
  cited_commits: List[str] = Field(default_factory=list)

class CommitResponse(BaseModel):
  commit: Commit  

class CommitsResponse(BaseModel):
  commits: List[CommitResponse] = Field(default_factory=list)