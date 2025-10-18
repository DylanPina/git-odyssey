from pydantic import BaseModel, Field
from typing import Optional, List
from data.schema import FileChangeStatus


class DiffHunk(BaseModel):
    """ Represents a hunk (block of changes) in a diff """

    #PK
    id: Optional[int] = Field(None, description="DB ID (populated after insertion)")

    old_start: int = Field(..., description="Starting line number in the old file")
    old_lines: int = Field(..., description="Number of lines in the old file")
    new_start: int = Field(..., description="Starting line number in the new file")
    new_lines: int = Field(..., description="Number of lines in the new file")

    content: Optional[str] = Field(None, description="Raw diff information of the hunk")
    summary: Optional[str] = Field(None, description="Summary of the changes in the hunk (AI Generated)")
    embedding: Optional[List[float]] = Field(None, description="Embedding of the hunk summary")
    diff_embedding: Optional[List[float]] = Field(None, description="Embedding of the diff of the hunk")

    # FKs
    file_change_id: int = Field(None, description="DB ID of the file change that contains this hunk")
    commit_sha: str = Field(None, description="SHA of the commit that contains this hunk")


class FileSnapshot(BaseModel):
    """Represents a file snapshot."""

    id: Optional[int] = Field(None, description="Database ID (populated after insertion)")

    commit_sha: str = Field(None, description="SHA of the commit this file snapshot belongs to")

    path: str = Field(..., description="File path")
    content: str = Field(..., description="Full file content snapshot")

    previous_snapshot_id: Optional[int] = Field(None, description="Database ID of the previous snapshot")
    previous_snapshot: Optional["FileSnapshot"] = Field(default=None, description="The previous snapshot object (one level deep)")


class FileChange(BaseModel):
    """Represents a file change within a commit."""

    id: Optional[int] = Field(None, description="DB ID (populated after insertion)")

    old_path: str = Field(..., description="Path in the old version of the file")
    new_path: str = Field(..., description="Path in the new version of the file")
    status: FileChangeStatus = Field(..., description="Type of change (added, deleted, modified, renamed, copied)")

    hunks: List[DiffHunk] = Field(default_factory=list, description="List of hunks containing the actual changes")
    snapshot: Optional[FileSnapshot] = Field(None, description="File snapshot of the new version of the file. New version for existing files; old version for deletions.")

    summary: Optional[str] = Field(None, description="Summary of the changes made to the file (AI Generated)")
    commit_sha: str = Field(None, description="SHA of the commit this file change belongs to")
    embedding: Optional[List[float]] = Field(None, description="Embedding of the file change summary")


class Commit(BaseModel):
    """Represents a commit."""

    sha: str = Field(..., description="Full SHA hash of the commit")

    repo_url: str = Field(..., description="URL of the repository")
    parents: List[str] = Field(default_factory=list, description="SHAs of parent commits")
    author: Optional[str] = Field(None, description="Author name")
    email: Optional[str] = Field(None, description="Author email")
    time: int = Field(..., description="Commit timestamp in epoch seconds")
    message: str = Field(..., description="Commit message")
    file_changes: List[FileChange] = Field(default_factory=list, description="List of file changes in the commit")
    summary: Optional[str] = Field(None, description="Summary of the commit's purpose and changes (AI Generated)")
    embedding: Optional[List[float]] = Field(None, description="Embedding of the commit summary")


class Branch(BaseModel):
    """Represents a branch."""

    name: str = Field(..., description="Name of the branch")

    repo_url: str = Field(..., description="URL of the repository")
    commits: List[str] = Field(default_factory=list, description="List of commit SHAs in the branch")