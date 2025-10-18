from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import String, JSON, Integer, ForeignKey
from typing import List
from pgvector.sqlalchemy import Vector


class Base(DeclarativeBase):
  pass

class SQLRepo(Base):
  __tablename__ = "repos"
  url: Mapped[str] = mapped_column(String(255), primary_key=True)
  name: Mapped[str] = mapped_column(String(255))
  commits: Mapped[List[SQLCommit]] = relationship("SQLCommit", back_populates="repo")
  branches: Mapped[List[SQLBranch]] = relationship("SQLBranch", back_populates="repo")

  relationships = [
    relationship("SQLCommit", back_populates="repo"),
    relationship("SQLBranch", back_populates="repo"),
  ]

class SQLCommit(Base):
  __tablename__ = "commits"
  sha: Mapped[str] = mapped_column(String(40), primary_key=True)
  parents: Mapped[List[str]] = mapped_column()
  author: Mapped[str] = mapped_column(String(255))
  email: Mapped[str] = mapped_column(String(255))
  time: Mapped[int] = mapped_column(Integer)
  message: Mapped[str] = mapped_column(String(255))
  summary: Mapped[str] = mapped_column(String(255))
  embedding: Mapped[List[float]] = mapped_column(Vector(1536))
  repo: Mapped[SQLRepo] = relationship("SQLRepo", back_populates="commits")
  branches: Mapped[List[SQLBranch]] = relationship("SQLBranch", back_populates="commits")

  relationships = [
    relationship("SQLRepo", back_populates="commits"),
    relationship("SQLBranch", back_populates="commits"),
  ]

class SQLBranch(Base):
  __tablename__ = "branches"
  id: Mapped[int] = mapped_column(Integer, primary_key=True)
  name: Mapped[str] = mapped_column(String(255))
  repo: Mapped[SQLRepo] = relationship("SQLRepo", back_populates="branches")
  commits: Mapped[List[SQLCommit]] = relationship("SQLCommit", back_populates="branches")
  relationships = [
    relationship("SQLRepo", back_populates="branches"),
    relationship("SQLCommit", back_populates="branches"),
  ]
  
class SQLFileChange(Base):
  __tablename__ = "file_changes"
  id: Mapped[int] = mapped_column(Integer, primary_key=True)
  old_path: Mapped[str] = mapped_column(String(255))
  new_path: Mapped[str] = mapped_column(String(255))
  status: Mapped[str] = mapped_column(String(255))
  summary: Mapped[str] = mapped_column(String(255))
  embedding: Mapped[List[float]] = mapped_column(Vector(1536))
  commit: Mapped[SQLCommit] = relationship("SQLCommit", back_populates="file_changes")
  relationships = [
    relationship("SQLCommit", back_populates="file_changes"),
  ]

class SQLDiffHunk(Base):
  __tablename__ = "diff_hunks"
  id: Mapped[int] = mapped_column(Integer, primary_key=True)
  old_start: Mapped[int] = mapped_column(Integer)
  old_lines: Mapped[int] = mapped_column(Integer)
  new_start: Mapped[int] = mapped_column(Integer)
  new_lines: Mapped[int] = mapped_column(Integer)
  content: Mapped[str] = mapped_column(String(255)) 

  relationships = [
    relationship("SQLFileChange", back_populates="diff_hunks"),
    relationship("SQLCommit", back_populates="diff_hunks"),
  ]

class SQLFileSnapshot(Base):
  __tablename__ = "file_snapshots"
  id: Mapped[int] = mapped_column(Integer, primary_key=True)
  path: Mapped[str] = mapped_column(String(255))
  content: Mapped[str] = mapped_column(String(255))
  previous_snapshot_id: Mapped[int] = mapped_column(Integer, ForeignKey("file_snapshots.id"))
  relationships = [
    relationship("SQLFileSnapshot", back_populates="file_snapshots"),
  ]

  relationships = [
    relationship("SQLFileSnapshot", back_populates="file_snapshots"),
  ]

