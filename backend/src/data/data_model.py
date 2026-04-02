from pydantic import BaseModel, Field
from typing import Optional, List
from data.schema import FileChangeStatus
from datetime import datetime


class User(BaseModel):
    id: int
    username: str
    email: Optional[str]
    api_credits_remaining: int = Field(
        default=100,
        description="Number of API credits remaining for the user",
    )
    created_at: datetime = Field(
        default_factory=datetime.now,
    )
    updated_at: datetime = Field(
        default_factory=datetime.now,
    )


class DiffHunk(BaseModel):
    """Represents a hunk (block of changes) in a diff"""

    # PK
    id: Optional[int] = Field(None, description="DB ID (populated after insertion)")

    old_start: int = Field(..., description="Starting line number in the old file")
    old_lines: int = Field(..., description="Number of lines in the old file")
    new_start: int = Field(..., description="Starting line number in the new file")
    new_lines: int = Field(..., description="Number of lines in the new file")

    content: Optional[str] = Field(None, description="Raw diff information of the hunk")
    summary: Optional[str] = Field(
        None, description="Summary of the changes in the hunk (AI Generated)"
    )
    ast_summary: Optional[str] = Field(
        None, description="AST-aware structural summary of the hunk"
    )
    semantic_embedding: Optional[List[float]] = Field(
        None, description="Semantic embedding of the hunk summary or content"
    )
    ast_embedding: Optional[List[float]] = Field(
        None, description="Embedding of the AST-aware hunk summary"
    )

    # FKs
    file_change_id: int = Field(
        None, description="DB ID of the file change that contains this hunk"
    )
    commit_sha: str = Field(
        None, description="SHA of the commit that contains this hunk"
    )


class FileSnapshot(BaseModel):
    """Represents a file snapshot."""

    id: Optional[int] = Field(
        None, description="Database ID (populated after insertion)"
    )

    commit_sha: str = Field(
        None, description="SHA of the commit this file snapshot belongs to"
    )

    path: str = Field(..., description="File path")
    content: str = Field(..., description="Full file content snapshot")

    previous_snapshot_id: Optional[int] = Field(
        None, description="Database ID of the previous snapshot"
    )
    previous_snapshot: Optional["FileSnapshot"] = Field(
        default=None, description="The previous snapshot object (one level deep)"
    )


class FileChange(BaseModel):
    """Represents a file change within a commit."""

    id: Optional[int] = Field(None, description="DB ID (populated after insertion)")

    old_path: str = Field(..., description="Path in the old version of the file")
    new_path: str = Field(..., description="Path in the new version of the file")
    status: FileChangeStatus = Field(
        ..., description="Type of change (added, deleted, modified, renamed, copied)"
    )

    hunks: List[DiffHunk] = Field(
        default_factory=list, description="List of hunks containing the actual changes"
    )
    snapshot: Optional[FileSnapshot] = Field(
        None,
        description="File snapshot of the new version of the file. New version for existing files; old version for deletions.",
    )

    summary: Optional[str] = Field(
        None, description="Summary of the changes made to the file (AI Generated)"
    )
    ast_summary: Optional[str] = Field(
        None, description="AST-aware structural summary of the file change"
    )
    semantic_embedding: Optional[List[float]] = Field(
        None, description="Semantic embedding of the file change summary"
    )
    ast_embedding: Optional[List[float]] = Field(
        None, description="Embedding of the AST-aware file change summary"
    )
    commit_sha: str = Field(
        None, description="SHA of the commit this file change belongs to"
    )

class Commit(BaseModel):
    """Represents a commit."""

    sha: str = Field(..., description="Full SHA hash of the commit")

    repo_path: str = Field(..., description="Absolute path of the repository")
    parents: List[str] = Field(
        default_factory=list, description="SHAs of parent commits"
    )
    author: Optional[str] = Field(None, description="Author name")
    email: Optional[str] = Field(None, description="Author email")
    time: int = Field(..., description="Commit timestamp in epoch seconds")
    message: str = Field(..., description="Commit message")
    file_changes: List[FileChange] = Field(
        default_factory=list, description="List of file changes in the commit"
    )
    summary: Optional[str] = Field(
        None, description="Summary of the commit's purpose and changes (AI Generated)"
    )
    semantic_embedding: Optional[List[float]] = Field(
        None, description="Semantic embedding of the commit summary"
    )


class Branch(BaseModel):
    """Represents a branch."""

    name: str = Field(..., description="Name of the branch")

    repo_path: str = Field(..., description="Absolute path of the repository")
    commits: List[str] = Field(
        default_factory=list, description="List of commit SHAs in the branch"
    )
