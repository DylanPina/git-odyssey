from typing import List, Optional
from enum import Enum
from sqlalchemy import (
    String,
    Integer,
    Text,
    Boolean,
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
from datetime import datetime


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
    username: Mapped[str]
    email: Mapped[Optional[str]]
    api_credits_remaining: Mapped[int] = mapped_column(Integer, default=100)
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]

    # Relationships
    repos: Mapped[List["SQLRepo"]] = relationship("SQLRepo", back_populates="users")


class SQLEmbeddingProfile(Base):
    __tablename__ = "embedding_profiles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    provider_type: Mapped[str] = mapped_column(String(64))
    base_url: Mapped[str] = mapped_column(Text)
    model_id: Mapped[str] = mapped_column(Text)
    observed_dimension: Mapped[Optional[int]]
    ast_schema_version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    repos: Mapped[List["SQLRepo"]] = relationship(
        "SQLRepo", back_populates="embedding_profile"
    )


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
    ast_summary: Mapped[Optional[str]] = mapped_column(Text)
    semantic_embedding: Mapped[Optional[List[float]]] = mapped_column(Vector())
    ast_embedding: Mapped[Optional[List[float]]] = mapped_column(Vector())

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
    ast_summary: Mapped[Optional[str]] = mapped_column(Text)
    semantic_embedding: Mapped[Optional[List[float]]] = mapped_column(Vector())
    ast_embedding: Mapped[Optional[List[float]]] = mapped_column(Vector())

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
    head_commit_sha: Mapped[Optional[str]] = mapped_column(String(40))

    # Foreign Keys
    repo_path: Mapped[str] = mapped_column(ForeignKey("repos.path"))

    # Relationships
    repo: Mapped["SQLRepo"] = relationship(
        "SQLRepo", back_populates="branches", foreign_keys=[repo_path]
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
    semantic_embedding: Mapped[Optional[List[float]]] = mapped_column(Vector())

    # Foreign Keys
    repo_path: Mapped[str] = mapped_column(ForeignKey("repos.path"))

    # Relationships
    repo: Mapped["SQLRepo"] = relationship(
        "SQLRepo", back_populates="commits", foreign_keys=[repo_path]
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

    path: Mapped[str] = mapped_column(primary_key=True)
    embedding_profile_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("embedding_profiles.id")
    )
    reindex_required: Mapped[bool] = mapped_column(Boolean, default=False)
    indexed_max_commits: Mapped[Optional[int]] = mapped_column(Integer)
    indexed_context_lines: Mapped[Optional[int]] = mapped_column(Integer)
    last_synced_at: Mapped[Optional[datetime]]
    last_sync_status: Mapped[Optional[str]] = mapped_column(String(32))
    last_sync_summary: Mapped[Optional[dict]] = mapped_column(JSON)

    # Foreign Keys
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    # Relationships
    users: Mapped[List["SQLUser"]] = relationship("SQLUser", back_populates="repos")
    branches: Mapped[List["SQLBranch"]] = relationship(
        "SQLBranch", back_populates="repo", foreign_keys="[SQLBranch.repo_path]"
    )
    commits: Mapped[List["SQLCommit"]] = relationship(
        "SQLCommit", back_populates="repo", foreign_keys="[SQLCommit.repo_path]"
    )
    embedding_profile: Mapped[Optional["SQLEmbeddingProfile"]] = relationship(
        "SQLEmbeddingProfile", back_populates="repos"
    )


class SQLReviewSession(Base):
    __tablename__ = "review_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    repo_path: Mapped[str] = mapped_column(Text)
    target_mode: Mapped[str] = mapped_column(String(16), default="compare")
    base_ref: Mapped[str] = mapped_column(Text)
    head_ref: Mapped[str] = mapped_column(Text)
    commit_sha: Mapped[Optional[str]] = mapped_column(String(40))
    merge_base_sha: Mapped[str] = mapped_column(String(40))
    base_head_sha: Mapped[str] = mapped_column(String(40))
    head_head_sha: Mapped[str] = mapped_column(String(40))
    context_lines: Mapped[int] = mapped_column(Integer, default=10)
    review_mode: Mapped[str] = mapped_column(String(32), default="diff")
    instructions_preset: Mapped[str] = mapped_column(String(64), default="default")
    diff_stats: Mapped[dict] = mapped_column(JSON)
    changed_files: Mapped[list] = mapped_column(JSON)
    stats: Mapped[dict] = mapped_column(JSON)
    file_changes: Mapped[list] = mapped_column(JSON)
    truncated: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(32), default="ready")
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    runs: Mapped[List["SQLReviewRun"]] = relationship(
        "SQLReviewRun",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="SQLReviewRun.created_at.desc()",
    )


class SQLReviewRun(Base):
    __tablename__ = "review_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("review_sessions.id"))
    engine: Mapped[str] = mapped_column(String(64))
    depth: Mapped[str] = mapped_column(String(32), default="standard")
    execution_policy: Mapped[str] = mapped_column(String(64), default="on-request")
    allowlisted_commands_profile: Mapped[str] = mapped_column(
        String(64), default="default"
    )
    include_optional_retrieval: Mapped[bool] = mapped_column(Boolean, default=False)
    mode: Mapped[str] = mapped_column(String(64), default="native_review")
    status: Mapped[str] = mapped_column(String(32), default="pending")
    phase: Mapped[str] = mapped_column(String(32), default="queued")
    partial: Mapped[bool] = mapped_column(Boolean, default=False)
    custom_instructions: Mapped[Optional[str]] = mapped_column(Text)
    applied_instructions: Mapped[Optional[str]] = mapped_column(Text)
    summary: Mapped[Optional[str]] = mapped_column(Text)
    findings_payload: Mapped[list] = mapped_column("findings", JSON, default=list)
    event_log_payload: Mapped[list] = mapped_column("events", JSON, default=list)
    command_logs: Mapped[list] = mapped_column(JSON, default=list)
    pending_command: Mapped[Optional[dict]] = mapped_column(JSON)
    error_detail: Mapped[Optional[str]] = mapped_column(Text)
    review_thread_id: Mapped[Optional[str]] = mapped_column(String(128))
    worktree_path: Mapped[Optional[str]] = mapped_column(Text)
    codex_home_path: Mapped[Optional[str]] = mapped_column(Text)
    started_at: Mapped[Optional[datetime]]
    completed_at: Mapped[Optional[datetime]]
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    session: Mapped["SQLReviewSession"] = relationship(
        "SQLReviewSession", back_populates="runs"
    )
    event_rows: Mapped[List["SQLReviewRunEvent"]] = relationship(
        "SQLReviewRunEvent",
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="SQLReviewRunEvent.sequence.asc()",
    )
    approvals: Mapped[List["SQLReviewApproval"]] = relationship(
        "SQLReviewApproval",
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="SQLReviewApproval.created_at.asc()",
    )
    result: Mapped[Optional["SQLReviewResult"]] = relationship(
        "SQLReviewResult",
        back_populates="run",
        cascade="all, delete-orphan",
        uselist=False,
    )


class SQLReviewRunEvent(Base):
    __tablename__ = "review_run_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("review_runs.id"))
    sequence: Mapped[int] = mapped_column(Integer)
    event_type: Mapped[str] = mapped_column(String(128))
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    run: Mapped["SQLReviewRun"] = relationship(
        "SQLReviewRun", back_populates="event_rows"
    )


class SQLReviewApproval(Base):
    __tablename__ = "review_approvals"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("review_runs.id"))
    method: Mapped[str] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    summary: Mapped[Optional[str]] = mapped_column(Text)
    thread_id: Mapped[Optional[str]] = mapped_column(String(128))
    turn_id: Mapped[Optional[str]] = mapped_column(String(128))
    item_id: Mapped[Optional[str]] = mapped_column(String(128))
    request_payload: Mapped[dict] = mapped_column(JSON)
    response_payload: Mapped[Optional[dict]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    run: Mapped["SQLReviewRun"] = relationship(
        "SQLReviewRun", back_populates="approvals"
    )


class SQLReviewResult(Base):
    __tablename__ = "review_results"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("review_runs.id"), unique=True)
    summary: Mapped[str] = mapped_column(Text)
    findings: Mapped[list] = mapped_column(JSON)
    partial: Mapped[bool] = mapped_column(Boolean, default=False)
    generated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    run: Mapped["SQLReviewRun"] = relationship(
        "SQLReviewRun", back_populates="result"
    )


commits_branches = Table(
    "commits_branches",
    Base.metadata,
    Column("commit_sha", String(40), ForeignKey("commits.sha"), primary_key=True),
    Column("branch_id", Integer, ForeignKey("branches.id"), primary_key=True),
)
