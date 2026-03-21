from datetime import datetime

from sqlalchemy import delete
from sqlalchemy.orm import Session, joinedload, selectinload

from api.api_model import IngestRequest
from core.embedder import EmbeddingEngine
from core.repo import Repo
from data.schema import (
    SQLBranch,
    SQLCommit,
    SQLDiffHunk,
    SQLEmbeddingProfile,
    SQLFileChange,
    SQLFileSnapshot,
    SQLRepo,
    SQLUser,
    commits_branches,
)
from utils.logger import logger


class IngestService:
    def __init__(self, session: Session, embedder: EmbeddingEngine | None):
        self.session = session
        self.embedder = embedder

    def resolve_repo_path(self, repo_path: str) -> str:
        return Repo.discover_repo_path(repo_path)

    def should_reindex(self, repo_path: str) -> bool:
        normalized_repo_path = self.resolve_repo_path(repo_path)
        repo = self._get_repo_row(normalized_repo_path)
        if repo is None:
            return False

        _, local_branch_heads = Repo.get_branch_heads(normalized_repo_path)
        stored_branch_heads = self._get_stored_branch_heads(normalized_repo_path)
        embedding_profile_mismatch = self._is_embedding_profile_mismatch(repo)

        if repo.reindex_required != embedding_profile_mismatch:
            repo.reindex_required = embedding_profile_mismatch
            self.session.commit()

        return (
            local_branch_heads != stored_branch_heads
            or embedding_profile_mismatch
            or bool(repo.reindex_required)
        )

    def _repo_exists(self, repo_path: str) -> bool:
        return (
            self.session.query(SQLRepo.path).filter(SQLRepo.path == repo_path).first()
            is not None
        )

    def _get_repo_row(self, repo_path: str) -> SQLRepo | None:
        return (
            self.session.query(SQLRepo)
            .options(joinedload(SQLRepo.embedding_profile))
            .filter(SQLRepo.path == repo_path)
            .first()
        )

    def _get_stored_branch_heads(self, repo_path: str) -> dict[str, str]:
        branch_rows = (
            self.session.query(SQLBranch.name, SQLBranch.head_commit_sha)
            .filter(SQLBranch.repo_path == repo_path)
            .all()
        )
        return {
            branch_name: head_commit_sha
            for branch_name, head_commit_sha in branch_rows
            if head_commit_sha
        }

    def _is_embedding_profile_mismatch(self, repo: SQLRepo) -> bool:
        stored_fingerprint = (
            repo.embedding_profile.fingerprint if repo.embedding_profile else None
        )
        active_fingerprint = (
            self.embedder.profile_fingerprint
            if self.embedder is not None
            else None
        )

        if not stored_fingerprint and not active_fingerprint:
            return False

        return stored_fingerprint != active_fingerprint

    def _ensure_active_embedding_profile(self) -> SQLEmbeddingProfile | None:
        if self.embedder is None or not self.embedder.profile_fingerprint:
            return None

        profile = (
            self.session.query(SQLEmbeddingProfile)
            .filter(
                SQLEmbeddingProfile.fingerprint == self.embedder.profile_fingerprint
            )
            .first()
        )
        if profile is None:
            profile = SQLEmbeddingProfile(
                fingerprint=self.embedder.profile_fingerprint,
                provider_type=self.embedder.provider_type,
                base_url=self.embedder.base_url,
                model_id=self.embedder.model,
                observed_dimension=self.embedder.observed_dimension,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            self.session.add(profile)
            self.session.flush()
            return profile

        if (
            self.embedder.observed_dimension is not None
            and profile.observed_dimension != self.embedder.observed_dimension
        ):
            profile.observed_dimension = self.embedder.observed_dimension
            profile.updated_at = datetime.utcnow()
            self.session.flush()

        return profile

    def _delete_repo_rows(self, repo_path: str) -> None:
        repo = (
            self.session.query(SQLRepo)
            .filter(SQLRepo.path == repo_path)
            .options(
                selectinload(SQLRepo.branches),
                selectinload(SQLRepo.commits).selectinload(SQLCommit.file_changes),
            )
            .first()
        )
        if repo is None:
            return

        branch_ids = [branch.id for branch in repo.branches]
        commit_shas = [commit.sha for commit in repo.commits]
        file_changes = [
            file_change
            for commit in repo.commits
            for file_change in commit.file_changes
        ]
        file_change_ids = [file_change.id for file_change in file_changes if file_change.id]
        snapshot_ids = sorted(
            {file_change.snapshot_id for file_change in file_changes if file_change.snapshot_id},
            reverse=True,
        )

        if branch_ids:
            self.session.execute(
                delete(commits_branches).where(
                    commits_branches.c.branch_id.in_(branch_ids)
                )
            )

        if file_change_ids:
            self.session.execute(
                delete(SQLDiffHunk).where(SQLDiffHunk.file_change_id.in_(file_change_ids))
            )
            self.session.execute(
                delete(SQLFileChange).where(SQLFileChange.id.in_(file_change_ids))
            )

        for snapshot_id in snapshot_ids:
            self.session.execute(
                delete(SQLFileSnapshot).where(SQLFileSnapshot.id == snapshot_id)
            )

        if commit_shas:
            self.session.execute(
                delete(SQLCommit).where(
                    SQLCommit.repo_path == repo_path,
                    SQLCommit.sha.in_(commit_shas),
                )
            )

        if branch_ids:
            self.session.execute(delete(SQLBranch).where(SQLBranch.id.in_(branch_ids)))

        self.session.execute(delete(SQLRepo).where(SQLRepo.path == repo_path))
        self.session.flush()

    # TODO: Make async (this is bottleneck) - store ingestion jobs and use Celery or Arq
    async def ingest_repo(self, request: IngestRequest, user_id: str) -> str:
        user = self.session.query(SQLUser).filter(SQLUser.id == user_id).first()
        if not user:
            raise Exception(f"Cannot ingest: User {user_id} not found")

        normalized_repo_path = self.resolve_repo_path(request.repo_path)
        repo_exists = self._repo_exists(normalized_repo_path)
        should_reindex = request.force or not repo_exists or self.should_reindex(
            normalized_repo_path
        )

        if not should_reindex:
            logger.info("Skipping ingest for unchanged repo at %s", normalized_repo_path)
            return normalized_repo_path

        logger.info("Reading local repo from %s", normalized_repo_path)
        repo = Repo(
            repo_path=normalized_repo_path,
            context_lines=request.context_lines,
            max_commits=request.max_commits,
        )

        if self.embedder is not None:
            logger.info("Embedding repo at %s", normalized_repo_path)
            self.embedder.embed_repo(repo)
        else:
            logger.info(
                "Semantic embeddings are disabled; indexing repo %s without vectors",
                normalized_repo_path,
            )
        sql_repo = repo.to_sql()
        sql_repo.user_id = user_id
        sql_repo.reindex_required = False
        embedding_profile = self._ensure_active_embedding_profile()

        if repo_exists:
            logger.info("Removing stale derived rows for %s", normalized_repo_path)
            self._delete_repo_rows(normalized_repo_path)

        self.session.add(sql_repo)
        sql_repo.embedding_profile = embedding_profile

        try:
            self.session.flush()
            self.session.commit()
            logger.info("Indexed repo at %s", normalized_repo_path)
        except Exception:
            self.session.rollback()
            raise

        return normalized_repo_path
