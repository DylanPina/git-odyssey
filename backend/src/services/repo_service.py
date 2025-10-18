from data.schema import SQLBranch, SQLCommit, SQLFileChange, SQLFileSnapshot
from sqlalchemy.orm import Session, selectinload
from data.database import Database
from api.api_model import RepoResponse, CommitResponse, CommitsResponse

class RepoService:
  def __init__(self, db_session: Session):
    self.session = db_session

  def get_repo(self, url: str) -> RepoResponse:
    branches_query = (
      self.session.query(SQLBranch)
      .filter(SQLBranch.repo_url == url)
      .join(SQLBranch.commits)
    )
    branches = branches_query.all()

    commits_query = (
      self.session.query(SQLCommit)
      .filter(SQLCommit.repo_url == url)
      .options(
        selectinload(SQLCommit.file_changes).selectinload(
          SQLFileChange.hunks),
        selectinload(SQLCommit.file_changes)
        .selectinload(SQLFileChange.snapshot)
        .selectinload(SQLFileSnapshot.previous_snapshot),
      )
    )
    commits = commits_query.all()

    db_adapter = Database()
    return RepoResponse(
      repo_url=url,
      branches=[db_adapter.parse_sql_branch(b) for b in branches],
      commits=[db_adapter.parse_sql_commit(c) for c in commits],
    )

  def get_commits(self, url: str) -> CommitsResponse:
    commits_query = (
      self.session.query(SQLCommit)
      .filter(SQLCommit.repo_url == url)
      .options(
        selectinload(SQLCommit.file_changes).selectinload(
          SQLFileChange.hunks),
        selectinload(SQLCommit.file_changes)
        .selectinload(SQLFileChange.snapshot)
        .selectinload(SQLFileSnapshot.previous_snapshot),
      )
      .all()
    )

    db_adapter = Database()
    return CommitsResponse(commits=[db_adapter.parse_sql_commit(c) for c in commits_query])

  def get_commit(self, url: str, sha: str) -> CommitResponse:
    commit = (
      self.session.query(SQLCommit)
      .filter(SQLCommit.repo_url == url, SQLCommit.sha == sha)
      .options(
        selectinload(SQLCommit.file_changes).selectinload(
          SQLFileChange.hunks),
        selectinload(SQLCommit.file_changes)
        .selectinload(SQLFileChange.snapshot)
        .selectinload(SQLFileSnapshot.previous_snapshot),
      )
      .first()
    )

    db_adapter = Database()
    return CommitResponse(commit=db_adapter.parse_sql_commit(commit))