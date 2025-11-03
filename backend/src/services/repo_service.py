from data.schema import SQLBranch, SQLCommit, SQLFileChange, SQLFileSnapshot
from sqlalchemy.orm import Session, selectinload
from data.adapter import DatabaseAdapter
from api.api_model import RepoResponse, CommitResponse, CommitsResponse


class RepoService:
    def __init__(self, session: Session, db_adapter: DatabaseAdapter):
        self.session = session
        self.db_adapter = db_adapter

    def get_repo(self, url: str) -> RepoResponse:
        branches_query = (
            self.session.query(SQLBranch)
            .filter(SQLBranch.repo_url == url)
            .join(SQLBranch.commits)
        )
        branches = branches_query.all()

        commits_query = self.session.query(SQLCommit).filter(SQLCommit.repo_url == url)
        commits = commits_query.all()

        return RepoResponse(
            repo_url=url,
            branches=[self.db_adapter.parse_sql_branch(b) for b in branches],
            commits=[
                self.db_adapter.parse_sql_commit(c, compressed=True) for c in commits
            ],
        )

    def get_commits(self, url: str) -> CommitsResponse:
        commits_query = (
            self.session.query(SQLCommit).filter(SQLCommit.repo_url == url).all()
        )

        return CommitsResponse(
            commits=[self.db_adapter.parse_sql_commit(c) for c in commits_query]
        )

    def get_commit(self, url: str, sha: str) -> CommitResponse:
        commit = (
            self.session.query(SQLCommit)
            .filter(SQLCommit.repo_url == url, SQLCommit.sha == sha)
            .options(
                selectinload(SQLCommit.file_changes).selectinload(SQLFileChange.hunks),
                selectinload(SQLCommit.file_changes)
                .selectinload(SQLFileChange.snapshot)
                .selectinload(SQLFileSnapshot.previous_snapshot),
            )
            .first()
        )

        return CommitResponse(commit=self.db_adapter.parse_sql_commit(commit))
