from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import String, JSON, Integer, ForeignKey, Text, Enum as SQLEnum
from typing import List
from pgvector.sqlalchemy import Vector
from typing import Optional

class Base(DeclarativeBase):
  pass

class FileChangeStatus(SQLEnum):
    ADDED = "added"
    DELETED = "deleted"
    MODIFIED = "modified"
    RENAMED = "renamed"
    COPIED = "copied"

class SQLDiffHunk(Base):
  __tablename__ = "diff_hunks"
  id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
  old_start: Mapped[int] 
  old_lines: Mapped[int] 
  new_start: Mapped[int]
  new_lines: Mapped[int]
  content: Mapped[str] = mapped_column(Text) 

  embedding: Mapped[Optional[List[float]]] = mapped_column(Vector(1536))
  diff_embedding: Mapped[Optional[List[float]]] = mapped_column(Vector(1536))

  file_change_id: Mapped[int] = mapped_column(Integer, ForeignKey("file_changes.id"))
  commit_sha: Mapped[str] = mapped_column(String(40), ForeignKey("commits.sha"))

  file_change: Mapped["SQLFileChange"] = relationship("SQLFileChange", back_populates="diff_hunks")
  commit: Mapped["SQLCommit"] = relationship("SQLCommit", back_populates="diff_hunks")



class SQLCommit(Base):
  __tablename__ = "commits"
  sha: Mapped[str] = mapped_column(String(40), primary_key=True)
  parents: Mapped[List[str]] = mapped_column(JSON)
  author: Mapped[Optional[str]]
  email: Mapped[Optional[str]]
  time: Mapped[int] 
  message: Mapped[str] = mapped_column(Text)
  summary: Mapped[Optional[str]] = mapped_column(Text)
  embedding: Mapped[Optional[List[float]]] = mapped_column(Vector(1536))

  repo_url: Mapped[str] = mapped_column(String(255), ForeignKey("repos.repo_url"))

  repo: Mapped["SQLRepo"] = relationship("SQLRepo", back_populates="commits")
  branches: Mapped[List["SQLBranch"]] = relationship("SQLBranch", secondary="commits_branches", back_populates="commits")
  file_changes: Mapped[List["SQLFileChange"]] = relationship("SQLFileChange", back_populates="commit")

class SQLBranch(Base):
  __tablename__ = "branches"
  id: Mapped[int] = mapped_column(Integer, primary_key=True)
  name: Mapped[str] = mapped_column(String(255))

  repo_url: Mapped[str] = mapped_column(String(255), ForeignKey("repos.repo_url"))

  repo: Mapped["SQLRepo"] = relationship("SQLRepo", back_populates="branches")
  commits: Mapped[List["SQLCommit"]] = relationship("SQLCommit", secondary="commits_branches", back_populates="branches")

  
class SQLFileChange(Base):
  __tablename__ = "file_changes"
  id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
  old_path: Mapped[str]
  new_path: Mapped[str]
  status: Mapped[FileChangeStatus] = mapped_column(SQLEnum(FileChangeStatus))
  summary: Mapped[Optional[str]] = mapped_column(Text)
  embedding: Mapped[Optional[List[float]]] = mapped_column(Vector(1536))

  commit_sha: Mapped[Optional[str]] = mapped_column(ForeignKey("commits.sha"))
  snapshot_id: Mapped[Optional[int]] = mapped_column(ForeignKey("file_snapshots.id"))

  commit: Mapped["SQLCommit"] = relationship("SQLCommit", back_populates="file_changes")
  hunks: Mapped[List["SQLDiffHunk"]] = relationship("SQLDiffHunk", back_populates="file_change", cascade="all, delete-orphan")
  snapshot: Mapped["SQLFileSnapshot"] = relationship("SQLFileSnapshot", foreign_keys=[snapshot_id], uselist=False)


class SQLFileSnapshot(Base):
  __tablename__ = "file_snapshots"
  id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
  path: Mapped[str]
  content: Mapped[str] = mapped_column(Text)
  previous_snapshot_id: Mapped[Optional[int]] = mapped_column(ForeignKey("file_snapshots.id"))

  previous_snapshot: Mapped["SQLFileSnapshot"] = relationship("SQLFileSnapshot", foreign_keys=[previous_snapshot_id])


class SQLRepo(Base):
  __tablename__ = "repos"
  repo_url: Mapped[str] = mapped_column(String(255), primary_key=True)
  name: Mapped[str] = mapped_column(String(255))
  commits: Mapped[List[SQLCommit]] = relationship("SQLCommit", back_populates="repo")
  branches: Mapped[List[SQLBranch]] = relationship("SQLBranch", back_populates="repo")

class commits_branches(Base):
  __tablename__ = "commits_branches"
  commit_sha: Mapped[str] = mapped_column(String(40), ForeignKey("commits.sha"), primary_key=True)
  branch_id: Mapped[int] = mapped_column(Integer, ForeignKey("branches.id"), primary_key=True)