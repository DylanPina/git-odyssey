from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from types import SimpleNamespace
from typing import Literal

from sqlalchemy import delete
from sqlalchemy.orm import Session, joinedload, selectinload

from api.api_model import IngestRequest
from core.ast_extractor import ASTSummaryExtractor
from core.embedder import EmbeddingEngine
from core.repo import BranchState, Repo
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
    SQLUser,
    commits_branches,
)
from utils.logger import logger

SyncMode = Literal["noop", "incremental", "full_rebuild"]


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


class IngestService:
    def __init__(self, session: Session, embedder: EmbeddingEngine | None):
        self.session = session
        self.embedder = embedder
        self.ast_extractor = ASTSummaryExtractor()

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
        normalized_repo_path = normalized_repo_path or self.resolve_repo_path(
            request.repo_path
        )
        repo = repo if repo is not None else self._get_repo_row(normalized_repo_path)
        _, current_branch_states = Repo.get_branch_states(
            normalized_repo_path,
            max_commits=request.max_commits,
        )
        stored_branch_states = (
            self._get_stored_branch_states(normalized_repo_path) if repo else {}
        )

        rebuild_reason = self._get_full_rebuild_reason(repo, request)
        if rebuild_reason is not None:
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

    def _populate_commit_features(self, commits: dict[str, Commit]) -> None:
        for commit in commits.values():
            for file_change in commit.file_changes:
                self.ast_extractor.populate_file_change(file_change)

        if self.embedder is None or not commits:
            if self.embedder is None and commits:
                logger.info("Semantic embeddings are disabled; indexing without vectors")
            return

        self.embedder.embed_repo(SimpleNamespace(commits=commits))

    def _order_missing_commits(self, commits: dict[str, Commit]) -> list[str]:
        pending = set(commits)
        ordered: list[str] = []
        resolved: set[str] = set()

        while pending:
            progressed = False
            for commit_sha in sorted(
                pending,
                key=lambda sha: (commits[sha].time, sha),
            ):
                parents = commits[commit_sha].parents
                first_parent = parents[0] if parents else None
                if first_parent is None or first_parent not in pending or first_parent in resolved:
                    ordered.append(commit_sha)
                    pending.remove(commit_sha)
                    resolved.add(commit_sha)
                    progressed = True
                    break
            if not progressed:
                ordered.extend(sorted(pending, key=lambda sha: (commits[sha].time, sha)))
                break

        return ordered

    def _get_parent_snapshot_lookup(
        self,
        parent_sha: str,
        *,
        inserted_snapshots: dict[str, dict[str, SQLFileSnapshot]],
        cached_snapshots: dict[str, dict[str, SQLFileSnapshot]],
    ) -> dict[str, SQLFileSnapshot]:
        if parent_sha in inserted_snapshots:
            return inserted_snapshots[parent_sha]
        if parent_sha in cached_snapshots:
            return cached_snapshots[parent_sha]

        file_changes = (
            self.session.query(SQLFileChange)
            .filter(SQLFileChange.commit_sha == parent_sha)
            .options(selectinload(SQLFileChange.snapshot))
            .all()
        )
        snapshot_lookup = {
            file_change.snapshot.path: file_change.snapshot
            for file_change in file_changes
            if file_change.snapshot is not None
        }
        cached_snapshots[parent_sha] = snapshot_lookup
        return snapshot_lookup

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
    ) -> None:
        repo.embedding_profile = self._ensure_active_embedding_profile()
        repo.reindex_required = False
        repo.indexed_max_commits = request.max_commits
        repo.indexed_context_lines = request.context_lines
        repo.last_synced_at = datetime.utcnow()
        repo.last_sync_status = result.mode
        repo.last_sync_summary = result.as_payload()

    def _rebuild_repo(
        self,
        *,
        normalized_repo_path: str,
        request: IngestRequest,
        user_id: str | int,
        plan: RepoSyncPlan,
    ) -> RepoSyncResult:
        logger.info(
            "Performing full repo rebuild for %s (%s)",
            normalized_repo_path,
            plan.reason or "unknown_reason",
        )
        repo = Repo(
            repo_path=normalized_repo_path,
            context_lines=request.context_lines,
            max_commits=request.max_commits,
        )
        self.ast_extractor.populate_repo(repo)
        if self.embedder is not None:
            self.embedder.embed_repo(repo)
        else:
            logger.info(
                "Semantic embeddings are disabled; indexing repo %s without vectors",
                normalized_repo_path,
            )

        sql_repo = repo.to_sql()
        sql_repo.user_id = int(user_id)
        result = RepoSyncResult(
            mode="full_rebuild",
            changed_branches=len(repo.branches),
            inserted_commits=len(repo.commits),
            reused_commits=0,
            removed_commits=len(plan.repo.commits) if plan.repo is not None else 0,
            reason=plan.reason,
        )
        self._apply_sync_metadata(sql_repo, request=request, result=result)

        if plan.repo is not None:
            self._delete_repo_rows(normalized_repo_path)

        self.session.add(sql_repo)
        return result

    def _sync_incremental(
        self,
        *,
        normalized_repo_path: str,
        request: IngestRequest,
        user_id: str | int,
        plan: RepoSyncPlan,
    ) -> RepoSyncResult:
        repo_row = self._get_or_create_repo_row(normalized_repo_path, user_id)

        inserted_snapshots: dict[str, dict[str, SQLFileSnapshot]] = {}
        cached_snapshots: dict[str, dict[str, SQLFileSnapshot]] = {}
        missing_commit_models: dict[str, Commit] = {}

        if plan.missing_commit_shas:
            _, missing_commit_models = Repo.load_commits(
                normalized_repo_path,
                sorted(plan.missing_commit_shas),
                context_lines=request.context_lines,
            )
            self._populate_commit_features(missing_commit_models)

            for commit_sha in self._order_missing_commits(missing_commit_models):
                commit = missing_commit_models[commit_sha]
                first_parent = commit.parents[0] if commit.parents else None
                parent_snapshot_lookup = (
                    self._get_parent_snapshot_lookup(
                        first_parent,
                        inserted_snapshots=inserted_snapshots,
                        cached_snapshots=cached_snapshots,
                    )
                    if first_parent
                    else {}
                )
                sql_commit, snapshot_lookup = self._build_sql_commit(
                    commit,
                    parent_snapshot_lookup=parent_snapshot_lookup,
                    repo_path=normalized_repo_path,
                )
                inserted_snapshots[commit.sha] = snapshot_lookup
                self.session.add(sql_commit)

            self.session.flush()

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
            self._delete_commits(normalized_repo_path, removed_commit_list)

        reused_commits = len(plan.target_commit_shas - plan.missing_commit_shas)
        result = RepoSyncResult(
            mode="incremental",
            changed_branches=len(plan.changed_branch_names),
            inserted_commits=len(plan.missing_commit_shas),
            reused_commits=reused_commits,
            removed_commits=len(plan.removed_commit_shas),
            reason=plan.reason,
        )
        self._apply_sync_metadata(repo_row, request=request, result=result)
        return result

    # TODO: Make async (this is bottleneck) - store ingestion jobs and use Celery or Arq
    async def ingest_repo(self, request: IngestRequest, user_id: str) -> str:
        user = self.session.query(SQLUser).filter(SQLUser.id == user_id).first()
        if not user:
            raise Exception(f"Cannot ingest: User {user_id} not found")

        normalized_repo_path = self.resolve_repo_path(request.repo_path)
        repo = self._get_repo_row(normalized_repo_path)
        plan = self.plan_repo_sync(
            request,
            normalized_repo_path=normalized_repo_path,
            repo=repo,
        )

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
                    self._apply_sync_metadata(repo, request=request, result=result)
                    self.session.commit()
                logger.info("Skipping ingest for unchanged repo at %s", normalized_repo_path)
                return normalized_repo_path

            if plan.mode == "full_rebuild":
                result = self._rebuild_repo(
                    normalized_repo_path=normalized_repo_path,
                    request=request,
                    user_id=user_id,
                    plan=plan,
                )
            else:
                result = self._sync_incremental(
                    normalized_repo_path=normalized_repo_path,
                    request=request,
                    user_id=user_id,
                    plan=plan,
                )

            self.session.flush()
            self.session.commit()
            logger.info(
                "Indexed repo at %s using %s sync (%s inserted, %s removed)",
                normalized_repo_path,
                result.mode,
                result.inserted_commits,
                result.removed_commits,
            )
        except Exception:
            self.session.rollback()
            raise

        return normalized_repo_path
