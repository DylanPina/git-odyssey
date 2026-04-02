from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime
from threading import Lock, Thread
from time import perf_counter
from typing import Literal
from uuid import uuid4

from sqlalchemy import delete
from sqlalchemy.orm import Session, joinedload, selectinload

from api.api_model import IngestRequest
from core.ast_extractor import ASTSummaryExtractor
from core.embedder import EmbeddingEngine, EmbeddingExecutionStats
from core.repo import BranchState, Repo, normalize_repo_path
from data.data_model import Commit
from data.schema import (
    FileChangeStatus,
    SQLBranch,
    SQLCommit,
    SQLDiffHunk,
    SQLEmbeddingProfile,
    SQLFileChange,
    SQLFileSnapshot,
    SQLRepo,
    SQLReviewSession,
    SQLUser,
    commits_branches,
)
import infrastructure.db as db
from utils.logger import logger

SyncMode = Literal["noop", "incremental", "full_rebuild"]
IngestJobStatus = Literal["queued", "running", "completed", "failed", "cancelled"]
IngestPhase = Literal[
    "planning",
    "loading_commits",
    "extracting_ast",
    "embedding",
    "writing_db",
    "completed",
    "failed",
]

PLANNING_WEIGHT = 5.0
COMMIT_LOAD_WEIGHT = 10.0
AST_WEIGHT = 15.0
EMBEDDING_WEIGHT = 55.0
DB_WRITE_WEIGHT = 15.0
TERMINAL_JOB_STATUSES = {"completed", "failed", "cancelled"}


@dataclass(frozen=True)
class StoredBranchState:
    name: str
    head_commit_sha: str | None
    commit_shas: set[str]


@dataclass(frozen=True)
class RepoSyncPlan:
    mode: SyncMode
    normalized_repo_path: str
    repo: SQLRepo | None
    reason: str | None
    current_branch_states: dict[str, BranchState]
    stored_branch_states: dict[str, StoredBranchState]
    changed_branch_names: set[str]
    removed_branch_names: set[str]
    target_commit_shas: set[str]
    missing_commit_shas: set[str]
    removed_commit_shas: set[str]


@dataclass(frozen=True)
class RepoSyncResult:
    mode: SyncMode
    changed_branches: int
    inserted_commits: int
    reused_commits: int
    removed_commits: int
    reason: str | None = None

    def as_payload(self) -> dict[str, object]:
        return {
            "mode": self.mode,
            "changed_branches": self.changed_branches,
            "inserted_commits": self.inserted_commits,
            "reused_commits": self.reused_commits,
            "removed_commits": self.removed_commits,
            "reason": self.reason,
        }


@dataclass
class IngestMetrics:
    repo_scan_seconds: float = 0.0
    commit_load_seconds: float = 0.0
    ast_extraction_seconds: float = 0.0
    semantic_payload_build_seconds: float = 0.0
    ast_payload_build_seconds: float = 0.0
    embedding_http_seconds: float = 0.0
    db_insert_seconds: float = 0.0
    total_seconds: float = 0.0
    commit_count: int = 0
    file_change_count: int = 0
    hunk_count: int = 0
    semantic_work_items: int = 0
    ast_work_items: int = 0
    semantic_tokens: int = 0
    ast_tokens: int = 0
    embedding_http_requests: int = 0
    rate_limit_retries: int = 0
    rate_limit_failures: int = 0
    rate_limit_sleep_seconds: float = 0.0
    semantic_batches: int = 0
    ast_batches: int = 0

    def as_payload(self) -> dict[str, object]:
        return {
            "repo_scan_seconds": round(self.repo_scan_seconds, 6),
            "commit_load_seconds": round(self.commit_load_seconds, 6),
            "ast_extraction_seconds": round(self.ast_extraction_seconds, 6),
            "semantic_payload_build_seconds": round(
                self.semantic_payload_build_seconds, 6
            ),
            "ast_payload_build_seconds": round(self.ast_payload_build_seconds, 6),
            "embedding_http_seconds": round(self.embedding_http_seconds, 6),
            "db_insert_seconds": round(self.db_insert_seconds, 6),
            "total_seconds": round(self.total_seconds, 6),
            "commit_count": self.commit_count,
            "file_change_count": self.file_change_count,
            "hunk_count": self.hunk_count,
            "semantic_work_items": self.semantic_work_items,
            "ast_work_items": self.ast_work_items,
            "semantic_tokens": self.semantic_tokens,
            "ast_tokens": self.ast_tokens,
            "embedding_http_requests": self.embedding_http_requests,
            "rate_limit_retries": self.rate_limit_retries,
            "rate_limit_failures": self.rate_limit_failures,
            "rate_limit_sleep_seconds": round(self.rate_limit_sleep_seconds, 6),
            "semantic_batches": self.semantic_batches,
            "ast_batches": self.ast_batches,
        }


@dataclass
class IngestProgressSnapshot:
    job_id: str
    progress_id: str
    repo_path: str
    phase: IngestPhase
    label: str
    percent: float
    stage_percent: float
    completed_units: int
    total_units: int
    commit_count: int | None
    file_change_count: int | None
    hunk_count: int | None
    embedding_batches: int | None
    inserted_commits: int | None
    error: str | None
    started_at: datetime
    updated_at: datetime

    def as_payload(self) -> dict[str, object]:
        return {
            "job_id": self.job_id,
            "progress_id": self.progress_id,
            "repo_path": self.repo_path,
            "phase": self.phase,
            "label": self.label,
            "percent": round(self.percent, 2),
            "stage_percent": round(self.stage_percent, 4),
            "completed_units": self.completed_units,
            "total_units": self.total_units,
            "commit_count": self.commit_count,
            "file_change_count": self.file_change_count,
            "hunk_count": self.hunk_count,
            "embedding_batches": self.embedding_batches,
            "inserted_commits": self.inserted_commits,
            "error": self.error,
            "started_at": self.started_at,
            "updated_at": self.updated_at,
        }


@dataclass
class IngestJobSnapshot:
    job_id: str
    repo_path: str
    status: IngestJobStatus
    result_repo_path: str | None
    error: str | None
    progress: IngestProgressSnapshot
    started_at: datetime
    updated_at: datetime
    completed_at: datetime | None

    def as_payload(self) -> dict[str, object]:
        return {
            "job_id": self.job_id,
            "repo_path": self.repo_path,
            "status": self.status,
            "result_repo_path": self.result_repo_path,
            "error": self.error,
            "progress": self.progress.as_payload(),
            "started_at": self.started_at,
            "updated_at": self.updated_at,
            "completed_at": self.completed_at,
        }


class IngestService:
    _progress_lock = Lock()
    _progress_by_id: dict[str, IngestProgressSnapshot] = {}
    _jobs_lock = Lock()
    _jobs_by_id: dict[str, IngestJobSnapshot] = {}
    _active_job_ids_by_repo: dict[str, str] = {}

    def __init__(
        self,
        session: Session,
        embedder: EmbeddingEngine | None,
        flush_size: int = 100,
    ):
        self.session = session
        self.embedder = embedder
        self.ast_extractor = ASTSummaryExtractor()
        self.flush_size = max(1, flush_size)

    @classmethod
    def get_progress(cls, progress_id: str) -> IngestProgressSnapshot | None:
        with cls._progress_lock:
            return cls._progress_by_id.get(progress_id)

    @classmethod
    def get_job(cls, job_id: str) -> IngestJobSnapshot | None:
        with cls._jobs_lock:
            return cls._jobs_by_id.get(job_id)

    @classmethod
    def reset_runtime_state(cls) -> None:
        with cls._jobs_lock:
            cls._jobs_by_id.clear()
            cls._active_job_ids_by_repo.clear()
        with cls._progress_lock:
            cls._progress_by_id.clear()

    @classmethod
    def _update_job(
        cls,
        job_id: str,
        *,
        status: IngestJobStatus | None = None,
        result_repo_path: str | None = None,
        error: str | None = None,
        progress: IngestProgressSnapshot | None = None,
        completed_at: datetime | None = None,
    ) -> IngestJobSnapshot | None:
        with cls._jobs_lock:
            job = cls._jobs_by_id.get(job_id)
            if job is None:
                return None

            now = datetime.utcnow()
            next_status = status or job.status
            if status == "completed":
                cls._active_job_ids_by_repo.pop(job.repo_path, None)
            elif status in {"failed", "cancelled"}:
                cls._active_job_ids_by_repo.pop(job.repo_path, None)

            updated_job = IngestJobSnapshot(
                job_id=job.job_id,
                repo_path=job.repo_path,
                status=next_status,
                result_repo_path=(
                    result_repo_path if result_repo_path is not None else job.result_repo_path
                ),
                error=error if error is not None else job.error,
                progress=progress or job.progress,
                started_at=job.started_at,
                updated_at=now,
                completed_at=completed_at if completed_at is not None else job.completed_at,
            )
            cls._jobs_by_id[job_id] = updated_job
            return updated_job

    def _create_queued_progress(
        self,
        *,
        job_id: str,
        repo_path: str,
        started_at: datetime,
    ) -> IngestProgressSnapshot:
        return IngestProgressSnapshot(
            job_id=job_id,
            progress_id=job_id,
            repo_path=repo_path,
            phase="planning",
            label="Queued repository sync",
            percent=0.0,
            stage_percent=0.0,
            completed_units=0,
            total_units=0,
            commit_count=None,
            file_change_count=None,
            hunk_count=None,
            embedding_batches=None,
            inserted_commits=None,
            error=None,
            started_at=started_at,
            updated_at=started_at,
        )

    def start_ingest_job(self, request: IngestRequest, user_id: str | int) -> IngestJobSnapshot:
        normalized_repo_path = self.resolve_repo_path(request.repo_path)

        with self._jobs_lock:
            existing_job_id = self._active_job_ids_by_repo.get(normalized_repo_path)
            if existing_job_id is not None:
                existing_job = self._jobs_by_id.get(existing_job_id)
                if existing_job is not None and existing_job.status not in TERMINAL_JOB_STATUSES:
                    return existing_job

            job_id = str(uuid4())
            now = datetime.utcnow()
            queued_progress = self._create_queued_progress(
                job_id=job_id,
                repo_path=normalized_repo_path,
                started_at=now,
            )
            self._jobs_by_id[job_id] = IngestJobSnapshot(
                job_id=job_id,
                repo_path=normalized_repo_path,
                status="queued",
                result_repo_path=None,
                error=None,
                progress=queued_progress,
                started_at=now,
                updated_at=now,
                completed_at=None,
            )
            self._active_job_ids_by_repo[normalized_repo_path] = job_id

        with self._progress_lock:
            self._progress_by_id[job_id] = queued_progress

        worker_request = request.model_copy(
            update={
                "repo_path": normalized_repo_path,
                "progress_id": job_id,
            }
        )
        try:
            self._spawn_job_worker(job_id, worker_request, user_id)
        except Exception as error:
            self._update_job(
                job_id,
                status="failed",
                error=str(error),
                completed_at=datetime.utcnow(),
            )
            raise
        job = self.get_job(job_id)
        if job is None:
            raise RuntimeError("Failed to create ingest job")
        return job

    def _spawn_job_worker(
        self,
        job_id: str,
        request: IngestRequest,
        user_id: str | int,
    ) -> None:
        thread = Thread(
            target=self._run_job_worker,
            args=(job_id, request, user_id),
            name=f"git-odyssey-ingest-{job_id}",
            daemon=True,
        )
        thread.start()

    def _run_job_worker(
        self,
        job_id: str,
        request: IngestRequest,
        user_id: str | int,
    ) -> None:
        session_factory = db.SessionLocal
        if session_factory is None:
            error_message = "Database session factory is not initialized"
            self._update_job(job_id, status="failed", error=error_message, completed_at=datetime.utcnow())
            raise RuntimeError(error_message)

        self._update_job(job_id, status="running")

        try:
            with session_factory() as session:
                worker_service = IngestService(
                    session=session,
                    embedder=self.embedder,
                    flush_size=self.flush_size,
                )
                result_repo_path = worker_service._ingest_repo_sync(request, user_id)
            self._update_job(
                job_id,
                status="completed",
                result_repo_path=result_repo_path,
                error=None,
                completed_at=datetime.utcnow(),
            )
        except Exception as error:
            logger.exception("Background ingest job %s failed", job_id)
            self._update_job(
                job_id,
                status="failed",
                error=str(error),
                completed_at=datetime.utcnow(),
            )

    async def wait_for_job(
        self,
        job_id: str,
        *,
        poll_interval_seconds: float = 0.05,
    ) -> IngestJobSnapshot:
        while True:
            job = self.get_job(job_id)
            if job is None:
                raise ValueError(f"Ingest job {job_id} not found")
            if job.status in TERMINAL_JOB_STATUSES:
                return job
            await asyncio.sleep(poll_interval_seconds)

    def _set_progress(
        self,
        *,
        progress_id: str | None,
        repo_path: str,
        phase: IngestPhase,
        label: str,
        stage_percent: float,
        stage_start_percent: float,
        stage_weight: float,
        completed_units: int = 0,
        total_units: int = 0,
        commit_count: int | None = None,
        file_change_count: int | None = None,
        hunk_count: int | None = None,
        embedding_batches: int | None = None,
        inserted_commits: int | None = None,
        error: str | None = None,
        started_at: datetime | None = None,
        percent_override: float | None = None,
    ) -> None:
        if not progress_id:
            return

        now = datetime.utcnow()
        bounded_stage_percent = min(max(stage_percent, 0.0), 1.0)
        percent = (
            min(max(percent_override, 0.0), 100.0)
            if percent_override is not None
            else min(
                max(stage_start_percent + (stage_weight * bounded_stage_percent), 0.0),
                100.0,
            )
        )

        with self._progress_lock:
            existing = self._progress_by_id.get(progress_id)
            snapshot = IngestProgressSnapshot(
                job_id=progress_id,
                progress_id=progress_id,
                repo_path=repo_path,
                phase=phase,
                label=label,
                percent=percent,
                stage_percent=bounded_stage_percent,
                completed_units=completed_units,
                total_units=total_units,
                commit_count=commit_count,
                file_change_count=file_change_count,
                hunk_count=hunk_count,
                embedding_batches=embedding_batches,
                inserted_commits=inserted_commits,
                error=error,
                started_at=existing.started_at if existing is not None else (started_at or now),
                updated_at=now,
            )
            self._progress_by_id[progress_id] = snapshot
        self._update_job(progress_id, progress=snapshot)

    def resolve_repo_path(self, repo_path: str) -> str:
        return Repo.discover_repo_path(repo_path)

    def should_reindex(
        self,
        repo_path: str,
        *,
        max_commits: int = 50,
        context_lines: int = 3,
    ) -> bool:
        normalized_repo_path = self.resolve_repo_path(repo_path)
        repo = self._get_repo_row(normalized_repo_path)
        plan = self.plan_repo_sync(
            IngestRequest(
                repo_path=normalized_repo_path,
                max_commits=max_commits,
                context_lines=context_lines,
                force=False,
            ),
            normalized_repo_path=normalized_repo_path,
            repo=repo,
        )
        return plan.mode != "noop"

    def plan_repo_sync(
        self,
        request: IngestRequest,
        *,
        normalized_repo_path: str | None = None,
        repo: SQLRepo | None = None,
    ) -> RepoSyncPlan:
        scan_started_at = perf_counter()
        normalized_repo_path = normalized_repo_path or self.resolve_repo_path(
            request.repo_path
        )
        self._set_progress(
            progress_id=request.progress_id,
            repo_path=normalized_repo_path,
            phase="planning",
            label="Planning repository sync",
            stage_percent=0.1,
            stage_start_percent=0.0,
            stage_weight=PLANNING_WEIGHT,
            started_at=datetime.utcnow(),
        )
        repo = repo if repo is not None else self._get_repo_row(normalized_repo_path)
        _, current_branch_states = Repo.get_branch_states(
            normalized_repo_path,
            max_commits=request.max_commits,
        )
        self._set_progress(
            progress_id=request.progress_id,
            repo_path=normalized_repo_path,
            phase="planning",
            label="Computed repository sync plan",
            stage_percent=1.0,
            stage_start_percent=0.0,
            stage_weight=PLANNING_WEIGHT,
        )
        stored_branch_states = (
            self._get_stored_branch_states(normalized_repo_path) if repo else {}
        )

        rebuild_reason = self._get_full_rebuild_reason(repo, request)
        if rebuild_reason is not None:
            logger.info(
                "Planned full repo rebuild for %s in %.3fs",
                normalized_repo_path,
                perf_counter() - scan_started_at,
            )
            return RepoSyncPlan(
                mode="full_rebuild",
                normalized_repo_path=normalized_repo_path,
                repo=repo,
                reason=rebuild_reason,
                current_branch_states=current_branch_states,
                stored_branch_states=stored_branch_states,
                changed_branch_names=set(current_branch_states) | set(stored_branch_states),
                removed_branch_names=set(stored_branch_states) - set(current_branch_states),
                target_commit_shas=self._collect_target_commit_shas(current_branch_states),
                missing_commit_shas=set(),
                removed_commit_shas=set(),
            )

        if repo is None:
            target_commit_shas = self._collect_target_commit_shas(current_branch_states)
            logger.info(
                "Planned initial repo sync for %s in %.3fs",
                normalized_repo_path,
                perf_counter() - scan_started_at,
            )
            return RepoSyncPlan(
                mode="incremental",
                normalized_repo_path=normalized_repo_path,
                repo=None,
                reason="initial_sync",
                current_branch_states=current_branch_states,
                stored_branch_states={},
                changed_branch_names=set(current_branch_states),
                removed_branch_names=set(),
                target_commit_shas=target_commit_shas,
                missing_commit_shas=target_commit_shas,
                removed_commit_shas=set(),
            )

        stored_commit_shas = self._get_stored_commit_shas(normalized_repo_path)
        target_commit_shas = self._collect_target_commit_shas(current_branch_states)
        changed_branch_names = self._detect_changed_branches(
            repo=repo,
            request=request,
            current_branch_states=current_branch_states,
            stored_branch_states=stored_branch_states,
        )
        removed_branch_names = set(stored_branch_states) - set(current_branch_states)
        missing_commit_shas = target_commit_shas - stored_commit_shas
        removed_commit_shas = stored_commit_shas - target_commit_shas

        if (
            not changed_branch_names
            and not missing_commit_shas
            and not removed_commit_shas
            and not request.force
        ):
            logger.info(
                "Planned noop repo sync for %s in %.3fs",
                normalized_repo_path,
                perf_counter() - scan_started_at,
            )
            return RepoSyncPlan(
                mode="noop",
                normalized_repo_path=normalized_repo_path,
                repo=repo,
                reason=None,
                current_branch_states=current_branch_states,
                stored_branch_states=stored_branch_states,
                changed_branch_names=set(),
                removed_branch_names=removed_branch_names,
                target_commit_shas=target_commit_shas,
                missing_commit_shas=set(),
                removed_commit_shas=set(),
            )

        logger.info(
            "Planned incremental repo sync for %s in %.3fs",
            normalized_repo_path,
            perf_counter() - scan_started_at,
        )
        return RepoSyncPlan(
            mode="incremental",
            normalized_repo_path=normalized_repo_path,
            repo=repo,
            reason="branch_delta",
            current_branch_states=current_branch_states,
            stored_branch_states=stored_branch_states,
            changed_branch_names=changed_branch_names,
            removed_branch_names=removed_branch_names,
            target_commit_shas=target_commit_shas,
            missing_commit_shas=missing_commit_shas,
            removed_commit_shas=removed_commit_shas,
        )

    def _collect_target_commit_shas(
        self, branch_states: dict[str, BranchState]
    ) -> set[str]:
        return {
            commit_sha
            for branch_state in branch_states.values()
            for commit_sha in branch_state.commits
        }

    def _detect_changed_branches(
        self,
        *,
        repo: SQLRepo,
        request: IngestRequest,
        current_branch_states: dict[str, BranchState],
        stored_branch_states: dict[str, StoredBranchState],
    ) -> set[str]:
        if repo.indexed_max_commits != request.max_commits:
            return set(current_branch_states) | set(stored_branch_states)

        changed_branch_names: set[str] = set()
        all_branch_names = set(current_branch_states) | set(stored_branch_states)
        for branch_name in all_branch_names:
            current = current_branch_states.get(branch_name)
            stored = stored_branch_states.get(branch_name)
            if current is None or stored is None:
                changed_branch_names.add(branch_name)
                continue
            if current.head_commit_sha != stored.head_commit_sha:
                changed_branch_names.add(branch_name)
                continue
            if set(current.commits) != stored.commit_shas:
                changed_branch_names.add(branch_name)
        return changed_branch_names

    def _get_full_rebuild_reason(
        self,
        repo: SQLRepo | None,
        request: IngestRequest,
    ) -> str | None:
        if repo is None:
            return None
        if self._is_embedding_profile_mismatch(repo):
            return "embedding_profile_changed"
        if bool(repo.reindex_required):
            return "repo_marked_for_reindex"
        if repo.indexed_context_lines is None or repo.indexed_max_commits is None:
            return "missing_sync_metadata"
        if repo.indexed_context_lines != request.context_lines:
            return "context_lines_changed"
        return None

    def _get_repo_row(self, repo_path: str) -> SQLRepo | None:
        return (
            self.session.query(SQLRepo)
            .options(joinedload(SQLRepo.embedding_profile))
            .filter(SQLRepo.path == repo_path)
            .first()
        )

    def _get_stored_branch_states(self, repo_path: str) -> dict[str, StoredBranchState]:
        branch_rows = (
            self.session.query(SQLBranch)
            .filter(SQLBranch.repo_path == repo_path)
            .options(selectinload(SQLBranch.commits))
            .all()
        )
        return {
            branch.name: StoredBranchState(
                name=branch.name,
                head_commit_sha=branch.head_commit_sha,
                commit_shas={commit.sha for commit in branch.commits},
            )
            for branch in branch_rows
        }

    def _get_stored_commit_shas(self, repo_path: str) -> set[str]:
        rows = (
            self.session.query(SQLCommit.sha)
            .filter(SQLCommit.repo_path == repo_path)
            .all()
        )
        return {sha for (sha,) in rows}

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
        self._delete_branch_links(branch_ids=branch_ids, commit_shas=commit_shas)
        self._delete_commits(repo_path, commit_shas)

        if branch_ids:
            self.session.execute(delete(SQLBranch).where(SQLBranch.id.in_(branch_ids)))

        self.session.execute(delete(SQLRepo).where(SQLRepo.path == repo_path))
        self.session.flush()

    def delete_repo_data(self, repo_path: str) -> str:
        normalized_repo_path = normalize_repo_path(repo_path)

        review_sessions = (
            self.session.query(SQLReviewSession)
            .filter(SQLReviewSession.repo_path == normalized_repo_path)
            .all()
        )
        for review_session in review_sessions:
            self.session.delete(review_session)
        self.session.flush()

        self._delete_repo_rows(normalized_repo_path)
        self.session.commit()
        return normalized_repo_path

    def _delete_branch_links(
        self,
        *,
        branch_ids: list[int] | None = None,
        commit_shas: list[str] | None = None,
    ) -> None:
        query = delete(commits_branches)
        filters = []
        if branch_ids:
            filters.append(commits_branches.c.branch_id.in_(branch_ids))
        if commit_shas:
            filters.append(commits_branches.c.commit_sha.in_(commit_shas))
        if not filters:
            return
        for condition in filters:
            query = query.where(condition)
        self.session.execute(query)

    def _delete_commits(self, repo_path: str, commit_shas: list[str]) -> None:
        if not commit_shas:
            return

        file_change_rows = (
            self.session.query(SQLFileChange.id, SQLFileChange.snapshot_id)
            .filter(SQLFileChange.commit_sha.in_(commit_shas))
            .all()
        )
        file_change_ids = [file_change_id for file_change_id, _ in file_change_rows]
        snapshot_ids = sorted(
            {snapshot_id for _, snapshot_id in file_change_rows if snapshot_id},
            reverse=True,
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

        self.session.execute(
            delete(SQLCommit).where(
                SQLCommit.repo_path == repo_path,
                SQLCommit.sha.in_(commit_shas),
            )
        )

    def _get_or_create_repo_row(self, repo_path: str, user_id: str | int) -> SQLRepo:
        repo = self._get_repo_row(repo_path)
        if repo is not None:
            repo.user_id = int(user_id)
            return repo

        repo = SQLRepo(path=repo_path, user_id=int(user_id))
        self.session.add(repo)
        self.session.flush()
        return repo

    def _populate_commit_features(
        self,
        commits: dict[str, Commit],
        metrics: IngestMetrics,
        *,
        progress_id: str | None,
        repo_path: str,
    ) -> None:
        ast_started_at = perf_counter()
        total_file_changes = sum(len(commit.file_changes) for commit in commits.values())
        processed_file_changes = 0
        self._set_progress(
            progress_id=progress_id,
            repo_path=repo_path,
            phase="extracting_ast",
            label="Extracting AST summaries",
            stage_percent=0.0 if total_file_changes else 1.0,
            stage_start_percent=PLANNING_WEIGHT + COMMIT_LOAD_WEIGHT,
            stage_weight=AST_WEIGHT,
            completed_units=0,
            total_units=total_file_changes,
        )
        for commit in commits.values():
            metrics.commit_count += 1
            metrics.file_change_count += len(commit.file_changes)
            for file_change in commit.file_changes:
                metrics.hunk_count += len(file_change.hunks)
                self.ast_extractor.populate_file_change(file_change)
                processed_file_changes += 1
                self._set_progress(
                    progress_id=progress_id,
                    repo_path=repo_path,
                    phase="extracting_ast",
                    label="Extracting AST summaries",
                    stage_percent=(
                        processed_file_changes / total_file_changes
                        if total_file_changes
                        else 1.0
                    ),
                    stage_start_percent=PLANNING_WEIGHT + COMMIT_LOAD_WEIGHT,
                    stage_weight=AST_WEIGHT,
                    completed_units=processed_file_changes,
                    total_units=total_file_changes,
                    commit_count=metrics.commit_count,
                    file_change_count=metrics.file_change_count,
                    hunk_count=metrics.hunk_count,
                )
        metrics.ast_extraction_seconds += perf_counter() - ast_started_at

        if self.embedder is None or not commits:
            if self.embedder is None and commits:
                logger.info("Semantic embeddings are disabled; indexing without vectors")
            return

        embedding_started_at = perf_counter()

        def handle_embedding_progress(
            completed_batches: int,
            total_batches: int,
            current_stats: EmbeddingExecutionStats,
        ) -> None:
            self._set_progress(
                progress_id=progress_id,
                repo_path=repo_path,
                phase="embedding",
                label="Generating embeddings",
                stage_percent=(
                    completed_batches / total_batches if total_batches else 1.0
                ),
                stage_start_percent=PLANNING_WEIGHT + COMMIT_LOAD_WEIGHT + AST_WEIGHT,
                stage_weight=EMBEDDING_WEIGHT,
                completed_units=completed_batches,
                total_units=total_batches,
                commit_count=metrics.commit_count,
                file_change_count=metrics.file_change_count,
                hunk_count=metrics.hunk_count,
                embedding_batches=total_batches,
            )

        self._set_progress(
            progress_id=progress_id,
            repo_path=repo_path,
            phase="embedding",
            label="Generating embeddings",
            stage_percent=0.0,
            stage_start_percent=PLANNING_WEIGHT + COMMIT_LOAD_WEIGHT + AST_WEIGHT,
            stage_weight=EMBEDDING_WEIGHT,
            completed_units=0,
            total_units=0,
            commit_count=metrics.commit_count,
            file_change_count=metrics.file_change_count,
            hunk_count=metrics.hunk_count,
        )
        embedding_stats = self.embedder.embed_repo(
            type("RepoView", (), {"commits": commits})(),
            on_batch_completed=handle_embedding_progress,
        )
        metrics.semantic_payload_build_seconds += (
            embedding_stats.semantic_payload_build_seconds
        )
        metrics.ast_payload_build_seconds += embedding_stats.ast_payload_build_seconds
        metrics.embedding_http_seconds += embedding_stats.http_seconds
        metrics.semantic_work_items += embedding_stats.semantic_work_items
        metrics.ast_work_items += embedding_stats.ast_work_items
        metrics.semantic_tokens += embedding_stats.semantic_tokens
        metrics.ast_tokens += embedding_stats.ast_tokens
        metrics.embedding_http_requests += embedding_stats.http_requests
        metrics.rate_limit_retries += embedding_stats.rate_limit_retries
        metrics.rate_limit_failures += embedding_stats.rate_limit_failures
        metrics.rate_limit_sleep_seconds += embedding_stats.rate_limit_sleep_seconds
        metrics.semantic_batches += embedding_stats.semantic_batches
        metrics.ast_batches += embedding_stats.ast_batches

    def _order_missing_commits(self, commits: dict[str, Commit]) -> list[str]:
        child_map: dict[str, list[str]] = {}
        pending_count: dict[str, int] = {}
        ready: list[str] = []
        for commit_sha, commit in commits.items():
            first_parent = commit.parents[0] if commit.parents else None
            if first_parent and first_parent in commits:
                pending_count[commit_sha] = 1
                child_map.setdefault(first_parent, []).append(commit_sha)
            else:
                pending_count[commit_sha] = 0
                ready.append(commit_sha)

        ordered: list[str] = []
        ready.sort(key=lambda sha: (commits[sha].time, sha))
        while ready:
            commit_sha = ready.pop(0)
            ordered.append(commit_sha)
            children = child_map.get(commit_sha, [])
            if not children:
                continue
            for child_sha in sorted(children, key=lambda sha: (commits[sha].time, sha)):
                pending_count[child_sha] -= 1
                if pending_count[child_sha] == 0:
                    ready.append(child_sha)
            ready.sort(key=lambda sha: (commits[sha].time, sha))

        if len(ordered) != len(commits):
            unresolved = [sha for sha in commits if sha not in set(ordered)]
            ordered.extend(sorted(unresolved, key=lambda sha: (commits[sha].time, sha)))
        return ordered

    def _preload_parent_snapshots(
        self,
        parent_shas: set[str],
        *,
        inserted_snapshots: dict[str, dict[str, SQLFileSnapshot]],
        cached_snapshots: dict[str, dict[str, SQLFileSnapshot]],
    ) -> None:
        pending_parent_shas = {
            parent_sha
            for parent_sha in parent_shas
            if parent_sha not in inserted_snapshots and parent_sha not in cached_snapshots
        }
        if not pending_parent_shas:
            return

        file_changes = (
            self.session.query(SQLFileChange)
            .filter(SQLFileChange.commit_sha.in_(pending_parent_shas))
            .options(selectinload(SQLFileChange.snapshot))
            .all()
        )
        for parent_sha in pending_parent_shas:
            cached_snapshots[parent_sha] = {}
        for file_change in file_changes:
            if file_change.snapshot is None or file_change.commit_sha is None:
                continue
            cached_snapshots.setdefault(file_change.commit_sha, {})[
                file_change.snapshot.path
            ] = file_change.snapshot

    def _resolve_parent_snapshot_lookup(
        self,
        parent_sha: str | None,
        *,
        inserted_snapshots: dict[str, dict[str, SQLFileSnapshot]],
        cached_snapshots: dict[str, dict[str, SQLFileSnapshot]],
    ) -> dict[str, SQLFileSnapshot]:
        if parent_sha is None:
            return {}
        if parent_sha in inserted_snapshots:
            return inserted_snapshots[parent_sha]
        return cached_snapshots.get(parent_sha, {})

    def _build_sql_commit(
        self,
        commit: Commit,
        *,
        parent_snapshot_lookup: dict[str, SQLFileSnapshot],
        repo_path: str,
    ) -> tuple[SQLCommit, dict[str, SQLFileSnapshot]]:
        sql_commit = SQLCommit(
            sha=commit.sha,
            parents=commit.parents,
            author=commit.author,
            email=commit.email,
            time=commit.time,
            message=commit.message,
            summary=commit.summary,
            semantic_embedding=commit.semantic_embedding,
            repo_path=repo_path,
        )

        sql_file_changes: list[SQLFileChange] = []
        snapshot_lookup: dict[str, SQLFileSnapshot] = {}
        for file_change in commit.file_changes:
            sql_file_change = SQLFileChange(
                old_path=file_change.old_path,
                new_path=file_change.new_path,
                status=file_change.status.value,
                summary=file_change.summary,
                ast_summary=file_change.ast_summary,
                semantic_embedding=file_change.semantic_embedding,
                ast_embedding=file_change.ast_embedding,
                commit_sha=commit.sha,
            )

            if file_change.snapshot is not None:
                snapshot_path = file_change.snapshot.path
                sanitized_snapshot_text = file_change.snapshot.content.replace("\x00", "")
                previous_key = (
                    file_change.old_path
                    if file_change.status
                    in {FileChangeStatus.RENAMED, FileChangeStatus.COPIED}
                    else snapshot_path
                )
                sql_snapshot = SQLFileSnapshot(
                    path=snapshot_path,
                    content=sanitized_snapshot_text,
                    previous_snapshot=parent_snapshot_lookup.get(previous_key),
                )
                sql_file_change.snapshot = sql_snapshot
                snapshot_lookup[snapshot_path] = sql_snapshot

            sql_file_change.hunks = [
                SQLDiffHunk(
                    old_start=hunk.old_start,
                    old_lines=hunk.old_lines,
                    new_start=hunk.new_start,
                    new_lines=hunk.new_lines,
                    content=hunk.content,
                    summary=hunk.summary,
                    ast_summary=hunk.ast_summary,
                    semantic_embedding=hunk.semantic_embedding,
                    ast_embedding=hunk.ast_embedding,
                    commit_sha=commit.sha,
                )
                for hunk in file_change.hunks
            ]
            sql_file_changes.append(sql_file_change)

        sql_commit.file_changes = sql_file_changes
        return sql_commit, snapshot_lookup

    def _apply_sync_metadata(
        self,
        repo: SQLRepo,
        *,
        request: IngestRequest,
        result: RepoSyncResult,
        metrics: IngestMetrics,
    ) -> None:
        repo.embedding_profile = self._ensure_active_embedding_profile()
        repo.reindex_required = False
        repo.indexed_max_commits = request.max_commits
        repo.indexed_context_lines = request.context_lines
        repo.last_synced_at = datetime.utcnow()
        repo.last_sync_status = result.mode
        repo.last_sync_summary = {
            **result.as_payload(),
            "metrics": metrics.as_payload(),
        }

    def _persist_commits_and_branches(
        self,
        *,
        normalized_repo_path: str,
        repo_row: SQLRepo,
        request: IngestRequest,
        plan: RepoSyncPlan,
        mode: SyncMode,
        reason: str | None,
        metrics: IngestMetrics,
    ) -> RepoSyncResult:
        inserted_snapshots: dict[str, dict[str, SQLFileSnapshot]] = {}
        cached_snapshots: dict[str, dict[str, SQLFileSnapshot]] = {}
        missing_commit_models: dict[str, Commit] = {}

        load_started_at = perf_counter()
        if plan.missing_commit_shas:
            total_missing_commits = len(plan.missing_commit_shas)
            self._set_progress(
                progress_id=request.progress_id,
                repo_path=normalized_repo_path,
                phase="loading_commits",
                label="Loading commits from Git",
                stage_percent=0.0 if total_missing_commits else 1.0,
                stage_start_percent=PLANNING_WEIGHT,
                stage_weight=COMMIT_LOAD_WEIGHT,
                completed_units=0,
                total_units=total_missing_commits,
            )
            _, missing_commit_models = Repo.load_commits(
                normalized_repo_path,
                sorted(plan.missing_commit_shas),
                context_lines=request.context_lines,
                progress_callback=lambda loaded_count, total_count: self._set_progress(
                    progress_id=request.progress_id,
                    repo_path=normalized_repo_path,
                    phase="loading_commits",
                    label="Loading commits from Git",
                    stage_percent=(loaded_count / total_count) if total_count else 1.0,
                    stage_start_percent=PLANNING_WEIGHT,
                    stage_weight=COMMIT_LOAD_WEIGHT,
                    completed_units=loaded_count,
                    total_units=total_count,
                ),
            )
        metrics.commit_load_seconds += perf_counter() - load_started_at

        if missing_commit_models:
            self._populate_commit_features(
                missing_commit_models,
                metrics,
                progress_id=request.progress_id,
                repo_path=normalized_repo_path,
            )
            parent_shas = {
                commit.parents[0]
                for commit in missing_commit_models.values()
                if commit.parents and commit.parents[0] not in missing_commit_models
            }
            self._preload_parent_snapshots(
                parent_shas,
                inserted_snapshots=inserted_snapshots,
                cached_snapshots=cached_snapshots,
            )

            db_started_at = perf_counter()
            pending_since_flush = 0
            persisted_commits = 0
            total_commits_to_insert = len(missing_commit_models)
            self._set_progress(
                progress_id=request.progress_id,
                repo_path=normalized_repo_path,
                phase="writing_db",
                label="Writing repository data",
                stage_percent=0.0 if total_commits_to_insert else 1.0,
                stage_start_percent=PLANNING_WEIGHT
                + COMMIT_LOAD_WEIGHT
                + AST_WEIGHT
                + EMBEDDING_WEIGHT,
                stage_weight=DB_WRITE_WEIGHT,
                completed_units=0,
                total_units=total_commits_to_insert,
                inserted_commits=0,
            )
            for commit_sha in self._order_missing_commits(missing_commit_models):
                commit = missing_commit_models[commit_sha]
                first_parent = commit.parents[0] if commit.parents else None
                parent_snapshot_lookup = self._resolve_parent_snapshot_lookup(
                    first_parent,
                    inserted_snapshots=inserted_snapshots,
                    cached_snapshots=cached_snapshots,
                )
                sql_commit, snapshot_lookup = self._build_sql_commit(
                    commit,
                    parent_snapshot_lookup=parent_snapshot_lookup,
                    repo_path=normalized_repo_path,
                )
                inserted_snapshots[commit.sha] = snapshot_lookup
                self.session.add(sql_commit)
                pending_since_flush += 1
                if pending_since_flush >= self.flush_size:
                    self.session.flush()
                    persisted_commits += pending_since_flush
                    self._set_progress(
                        progress_id=request.progress_id,
                        repo_path=normalized_repo_path,
                        phase="writing_db",
                        label="Writing repository data",
                        stage_percent=(
                            persisted_commits / total_commits_to_insert
                            if total_commits_to_insert
                            else 1.0
                        ),
                        stage_start_percent=PLANNING_WEIGHT
                        + COMMIT_LOAD_WEIGHT
                        + AST_WEIGHT
                        + EMBEDDING_WEIGHT,
                        stage_weight=DB_WRITE_WEIGHT,
                        completed_units=persisted_commits,
                        total_units=total_commits_to_insert,
                        inserted_commits=persisted_commits,
                    )
                    pending_since_flush = 0

            self.session.flush()
            if pending_since_flush:
                persisted_commits += pending_since_flush
            self._set_progress(
                progress_id=request.progress_id,
                repo_path=normalized_repo_path,
                phase="writing_db",
                label="Writing repository data",
                stage_percent=1.0,
                stage_start_percent=PLANNING_WEIGHT
                + COMMIT_LOAD_WEIGHT
                + AST_WEIGHT
                + EMBEDDING_WEIGHT,
                stage_weight=DB_WRITE_WEIGHT,
                completed_units=persisted_commits,
                total_units=total_commits_to_insert,
                inserted_commits=persisted_commits,
            )
            metrics.db_insert_seconds += perf_counter() - db_started_at

        commit_row_map: dict[str, SQLCommit] = {}
        if plan.target_commit_shas:
            commit_rows = (
                self.session.query(SQLCommit)
                .filter(
                    SQLCommit.repo_path == normalized_repo_path,
                    SQLCommit.sha.in_(plan.target_commit_shas),
                )
                .all()
            )
            commit_row_map = {commit.sha: commit for commit in commit_rows}

        existing_branches = (
            self.session.query(SQLBranch)
            .filter(SQLBranch.repo_path == normalized_repo_path)
            .options(selectinload(SQLBranch.commits))
            .all()
        )
        existing_branch_map = {branch.name: branch for branch in existing_branches}

        removed_branch_ids = [
            branch.id
            for name, branch in existing_branch_map.items()
            if name in plan.removed_branch_names
        ]
        if removed_branch_ids:
            self._delete_branch_links(branch_ids=removed_branch_ids)
            self.session.execute(delete(SQLBranch).where(SQLBranch.id.in_(removed_branch_ids)))

        for branch_name, branch_state in plan.current_branch_states.items():
            branch = existing_branch_map.get(branch_name)
            if (
                branch is not None
                and branch_name not in plan.changed_branch_names
                and branch_name not in plan.removed_branch_names
            ):
                continue

            ordered_commits = [
                commit_row_map[commit_sha]
                for commit_sha in branch_state.commits
                if commit_sha in commit_row_map
            ]
            if branch is None:
                branch = SQLBranch(
                    name=branch_name,
                    repo_path=normalized_repo_path,
                    head_commit_sha=branch_state.head_commit_sha,
                    commits=ordered_commits,
                )
                self.session.add(branch)
                continue

            branch.head_commit_sha = branch_state.head_commit_sha
            branch.commits = ordered_commits

        if plan.removed_commit_shas:
            removed_commit_list = sorted(plan.removed_commit_shas)
            self._delete_branch_links(commit_shas=removed_commit_list)
            db_started_at = perf_counter()
            self._delete_commits(normalized_repo_path, removed_commit_list)
            metrics.db_insert_seconds += perf_counter() - db_started_at

        reused_commits = len(plan.target_commit_shas - plan.missing_commit_shas)
        result = RepoSyncResult(
            mode=mode,
            changed_branches=len(plan.changed_branch_names),
            inserted_commits=len(plan.missing_commit_shas),
            reused_commits=reused_commits,
            removed_commits=len(plan.removed_commit_shas),
            reason=reason,
        )
        self._apply_sync_metadata(repo_row, request=request, result=result, metrics=metrics)
        return result

    def _sync_incremental(
        self,
        *,
        normalized_repo_path: str,
        request: IngestRequest,
        user_id: str | int,
        plan: RepoSyncPlan,
        metrics: IngestMetrics,
    ) -> RepoSyncResult:
        repo_row = self._get_or_create_repo_row(normalized_repo_path, user_id)
        return self._persist_commits_and_branches(
            normalized_repo_path=normalized_repo_path,
            repo_row=repo_row,
            request=request,
            plan=plan,
            mode="incremental",
            reason=plan.reason,
            metrics=metrics,
        )

    def _rebuild_repo(
        self,
        *,
        normalized_repo_path: str,
        request: IngestRequest,
        user_id: str | int,
        plan: RepoSyncPlan,
        metrics: IngestMetrics,
    ) -> RepoSyncResult:
        logger.info(
            "Performing full repo rebuild for %s (%s)",
            normalized_repo_path,
            plan.reason or "unknown_reason",
        )
        db_started_at = perf_counter()
        if plan.repo is not None:
            self._delete_repo_rows(normalized_repo_path)
        repo_row = self._get_or_create_repo_row(normalized_repo_path, user_id)
        metrics.db_insert_seconds += perf_counter() - db_started_at
        rebuild_plan = RepoSyncPlan(
            mode="full_rebuild",
            normalized_repo_path=plan.normalized_repo_path,
            repo=None,
            reason=plan.reason,
            current_branch_states=plan.current_branch_states,
            stored_branch_states={},
            changed_branch_names=set(plan.current_branch_states),
            removed_branch_names=set(),
            target_commit_shas=plan.target_commit_shas,
            missing_commit_shas=plan.target_commit_shas,
            removed_commit_shas=set(),
        )
        result = self._persist_commits_and_branches(
            normalized_repo_path=normalized_repo_path,
            repo_row=repo_row,
            request=request,
            plan=rebuild_plan,
            mode="full_rebuild",
            reason=plan.reason,
            metrics=metrics,
        )
        return RepoSyncResult(
            mode="full_rebuild",
            changed_branches=result.changed_branches,
            inserted_commits=result.inserted_commits,
            reused_commits=0,
            removed_commits=len(plan.repo.commits) if plan.repo is not None else 0,
            reason=plan.reason,
        )

    async def ingest_repo(self, request: IngestRequest, user_id: str | int) -> str:
        job = self.start_ingest_job(request, user_id)
        completed_job = await self.wait_for_job(job.job_id)
        if completed_job.status == "failed":
            raise RuntimeError(completed_job.error or "Repository sync failed")
        if completed_job.status == "cancelled":
            raise RuntimeError("Repository sync was cancelled")
        return completed_job.result_repo_path or completed_job.repo_path

    def _ingest_repo_sync(self, request: IngestRequest, user_id: str | int) -> str:
        total_started_at = perf_counter()
        metrics = IngestMetrics()
        user = self.session.query(SQLUser).filter(SQLUser.id == user_id).first()
        if not user:
            raise Exception(f"Cannot ingest: User {user_id} not found")

        normalized_repo_path = self.resolve_repo_path(request.repo_path)
        repo = self._get_repo_row(normalized_repo_path)
        plan_started_at = perf_counter()
        plan = self.plan_repo_sync(
            request,
            normalized_repo_path=normalized_repo_path,
            repo=repo,
        )
        metrics.repo_scan_seconds += perf_counter() - plan_started_at

        try:
            if plan.mode == "noop":
                if repo is not None:
                    result = RepoSyncResult(
                        mode="noop",
                        changed_branches=0,
                        inserted_commits=0,
                        reused_commits=len(plan.target_commit_shas),
                        removed_commits=0,
                    )
                    metrics.total_seconds = perf_counter() - total_started_at
                    self._apply_sync_metadata(
                        repo, request=request, result=result, metrics=metrics
                    )
                    self._set_progress(
                        progress_id=request.progress_id,
                        repo_path=normalized_repo_path,
                        phase="completed",
                        label="Repository is up to date",
                        stage_percent=1.0,
                        stage_start_percent=0.0,
                        stage_weight=100.0,
                        completed_units=1,
                        total_units=1,
                    )
                    self.session.commit()
                logger.info("Skipping ingest for unchanged repo at %s", normalized_repo_path)
                return normalized_repo_path

            if plan.mode == "full_rebuild":
                result = self._rebuild_repo(
                    normalized_repo_path=normalized_repo_path,
                    request=request,
                    user_id=user_id,
                    plan=plan,
                    metrics=metrics,
                )
            else:
                result = self._sync_incremental(
                    normalized_repo_path=normalized_repo_path,
                    request=request,
                    user_id=user_id,
                    plan=plan,
                    metrics=metrics,
                )

            self.session.flush()
            metrics.total_seconds = perf_counter() - total_started_at
            repo_row = self._get_repo_row(normalized_repo_path)
            if repo_row is not None:
                self._apply_sync_metadata(
                    repo_row,
                    request=request,
                    result=result,
                    metrics=metrics,
                )
            self._set_progress(
                progress_id=request.progress_id,
                repo_path=normalized_repo_path,
                phase="completed",
                label="Repository sync complete",
                stage_percent=1.0,
                stage_start_percent=0.0,
                stage_weight=100.0,
                completed_units=result.inserted_commits + result.reused_commits,
                total_units=max(
                    result.inserted_commits + result.reused_commits,
                    len(plan.target_commit_shas),
                    1,
                ),
                commit_count=metrics.commit_count,
                file_change_count=metrics.file_change_count,
                hunk_count=metrics.hunk_count,
                embedding_batches=metrics.semantic_batches + metrics.ast_batches,
                inserted_commits=result.inserted_commits,
            )
            self.session.commit()
            logger.info(
                "Indexed repo at %s using %s sync (%s inserted, %s removed) metrics=%s",
                normalized_repo_path,
                result.mode,
                result.inserted_commits,
                result.removed_commits,
                metrics.as_payload(),
            )
        except Exception as error:
            existing_progress = (
                self.get_progress(request.progress_id) if request.progress_id else None
            )
            self._set_progress(
                progress_id=request.progress_id,
                repo_path=normalized_repo_path,
                phase="failed",
                label="Repository sync failed",
                stage_percent=existing_progress.stage_percent if existing_progress else 0.0,
                stage_start_percent=0.0,
                stage_weight=0.0,
                error=str(error),
                percent_override=existing_progress.percent if existing_progress else 0.0,
            )
            self.session.rollback()
            raise

        return normalized_repo_path
