from data.schema import SQLBranch, SQLCommit, SQLFileChange, SQLFileSnapshot, SQLRepo
from sqlalchemy.orm import Session, selectinload
from data.adapter import DatabaseAdapter
from api.api_model import RepoResponse, CommitResponse, CommitsResponse
from fastapi import HTTPException


class RepoService:
    def __init__(self, session: Session, db_adapter: DatabaseAdapter):
        self.session = session
        self.db_adapter = db_adapter

    def has_repo(self, repo_path: str) -> bool:
        return (
            self.session.query(SQLRepo.path).filter(SQLRepo.path == repo_path).first()
            is not None
        )

    def get_repo(self, repo_path: str) -> RepoResponse | None:
        repo = (
            self.session.query(SQLRepo)
            .filter(SQLRepo.path == repo_path)
            .options(
                selectinload(SQLRepo.branches).selectinload(SQLBranch.commits),
                selectinload(SQLRepo.commits),
            )
            .first()
        )
        if repo is None:
            return None

        return RepoResponse(
            repo_path=repo.path,
            branches=[self.db_adapter.parse_sql_branch(branch) for branch in repo.branches],
            commits=[
                self.db_adapter.parse_sql_commit(commit, compressed=True)
                for commit in repo.commits
            ],
            reindex_required=bool(repo.reindex_required),
        )

    def get_commits(self, repo_path: str) -> CommitsResponse:
        commits_query = (
            self.session.query(SQLCommit).filter(SQLCommit.repo_path == repo_path).all()
        )

        return CommitsResponse(
            commits=[self.db_adapter.parse_sql_commit(c) for c in commits_query]
        )

    def get_commit(self, repo_path: str, sha: str) -> CommitResponse:
        commit = (
            self.session.query(SQLCommit)
            .filter(SQLCommit.repo_path == repo_path, SQLCommit.sha == sha)
            .options(
                selectinload(SQLCommit.file_changes).selectinload(SQLFileChange.hunks),
                selectinload(SQLCommit.file_changes)
                .selectinload(SQLFileChange.snapshot)
                .selectinload(SQLFileSnapshot.previous_snapshot),
            )
            .first()
        )
        if commit is None:
            raise HTTPException(status_code=404, detail="Commit not found")

        return CommitResponse(commit=self.db_adapter.parse_sql_commit(commit))
