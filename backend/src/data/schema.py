from typing import List, Optional
from enum import Enum
from sqlalchemy import (
    String,
    Integer,
    Text,
    ForeignKey,
    Enum as SQLEnum,
    Column,
    JSON,
    DateTime,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
)
from pgvector.sqlalchemy import Vector
from sqlalchemy import Table


class Base(DeclarativeBase):
    """Base class for all database models."""

    pass


class FileChangeStatus(str, Enum):
    """Enum for file change status types."""

    ADDED = "added"
    DELETED = "deleted"
    MODIFIED = "modified"
    RENAMED = "renamed"
    COPIED = "copied"


class SQLUser(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    github_id: Mapped[int]
    username: Mapped[str]
    email: Mapped[Optional[str]]
    installation_id: Mapped[Optional[str]]
    api_credits_remaining: Mapped[int]
    created_at: Mapped[DateTime]
    updated_at: Mapped[DateTime]


class SQLDiffHunk(Base):
    """SQLAlchemy model for diff hunks within file changes."""

    __tablename__ = "diff_hunks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    old_start: Mapped[int]
    old_lines: Mapped[int]
    new_start: Mapped[int]
    new_lines: Mapped[int]
    content: Mapped[str] = mapped_column(Text)
    summary: Mapped[Optional[str]] = mapped_column(Text)

    embedding: Mapped[Optional[List[float]]] = mapped_column(
        Vector(1536)
    )  # OpenAI embedding size
    diff_embedding: Mapped[Optional[List[float]]] = mapped_column(
        Vector(1536)
    )  # Vector embedding of the actual diff content

    # Foreign Keys
    file_change_id: Mapped[int] = mapped_column(ForeignKey("file_changes.id"))
    commit_sha: Mapped[Optional[str]] = mapped_column(ForeignKey("commits.sha"))

    # Relationships
    file_change: Mapped["SQLFileChange"] = relationship(
        "SQLFileChange", back_populates="hunks", foreign_keys=[file_change_id]
    )
    commit: Mapped[Optional["SQLCommit"]] = relationship(
        "SQLCommit", foreign_keys=[commit_sha]
    )


class SQLFileSnapshot(Base):
    """SQLAlchemy model for file snapshots."""

    __tablename__ = "file_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    path: Mapped[str]
    content: Mapped[str] = mapped_column(Text)
    previous_snapshot_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("file_snapshots.id")
    )

    # Relationships
    previous_snapshot: Mapped[Optional["SQLFileSnapshot"]] = relationship(
        "SQLFileSnapshot", foreign_keys=[previous_snapshot_id]
    )


class SQLFileChange(Base):
    """SQLAlchemy model for file changes within commits."""

    __tablename__ = "file_changes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    old_path: Mapped[str]
    new_path: Mapped[str]
    status: Mapped[FileChangeStatus] = mapped_column(SQLEnum(FileChangeStatus))
    summary: Mapped[Optional[str]] = mapped_column(Text)
    embedding: Mapped[Optional[List[float]]] = mapped_column(
        Vector(1536)
    )  # OpenAI embedding size

    # Foreign Keys
    commit_sha: Mapped[Optional[str]] = mapped_column(ForeignKey("commits.sha"))
    snapshot_id: Mapped[Optional[int]] = mapped_column(ForeignKey("file_snapshots.id"))

    # Relationships
    commit: Mapped[Optional["SQLCommit"]] = relationship(
        "SQLCommit", back_populates="file_changes", foreign_keys=[commit_sha]
    )
    hunks: Mapped[List["SQLDiffHunk"]] = relationship(
        "SQLDiffHunk", back_populates="file_change", cascade="all, delete-orphan"
    )
    snapshot: Mapped[Optional["SQLFileSnapshot"]] = relationship(
        "SQLFileSnapshot", foreign_keys=[snapshot_id], uselist=False
    )


class SQLBranch(Base):
    """SQLAlchemy model for branches."""

    __tablename__ = "branches"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))

    # Foreign Keys
    repo_url: Mapped[str] = mapped_column(ForeignKey("repos.url"))

    # Relationships
    repo: Mapped["SQLRepo"] = relationship(
        "SQLRepo", back_populates="branches", foreign_keys=[repo_url]
    )
    commits: Mapped[List["SQLCommit"]] = relationship(
        "SQLCommit", secondary="commits_branches", back_populates="branches"
    )


class SQLCommit(Base):
    """SQLAlchemy model for commits."""

    __tablename__ = "commits"

    sha: Mapped[str] = mapped_column(String(40), primary_key=True)
    parents: Mapped[List[str]] = mapped_column(JSON)
    author: Mapped[Optional[str]]
    email: Mapped[Optional[str]]
    time: Mapped[int]
    message: Mapped[str] = mapped_column(Text)
    summary: Mapped[Optional[str]] = mapped_column(Text)
    embedding: Mapped[Optional[List[float]]] = mapped_column(
        Vector(1536)
    )  # OpenAI embedding size

    # Foreign Keys
    repo_url: Mapped[str] = mapped_column(ForeignKey("repos.url"))

    # Relationships
    repo: Mapped["SQLRepo"] = relationship(
        "SQLRepo", back_populates="commits", foreign_keys=[repo_url]
    )
    branches: Mapped[List["SQLBranch"]] = relationship(
        "SQLBranch", secondary="commits_branches", back_populates="commits"
    )
    file_changes: Mapped[List["SQLFileChange"]] = relationship(
        "SQLFileChange", back_populates="commit"
    )


class SQLRepo(Base):
    """SQLAlchemy model for repositories."""

    __tablename__ = "repos"

    url: Mapped[str] = mapped_column(primary_key=True)

    # Foreign Keys
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    # Relationships
    users: Mapped[List["SQLUser"]] = relationship("SQLUser", back_populates="repos")
    branches: Mapped[List["SQLBranch"]] = relationship(
        "SQLBranch", back_populates="repo", foreign_keys="[SQLBranch.repo_url]"
    )
    commits: Mapped[List["SQLCommit"]] = relationship(
        "SQLCommit", back_populates="repo", foreign_keys="[SQLCommit.repo_url]"
    )


commits_branches = Table(
    "commits_branches",
    Base.metadata,
    Column("commit_sha", String(40), ForeignKey("commits.sha"), primary_key=True),
    Column("branch_id", Integer, ForeignKey("branches.id"), primary_key=True),
)
