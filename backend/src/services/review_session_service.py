from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import func
from sqlalchemy.orm import Session

from api.api_model import (
    ReviewApprovalResponse,
    ReviewApprovalUpsertRequest,
    ReviewCompareRequest,
    ReviewFinding,
    ReviewResultResponse,
    ReviewResultSubmitRequest,
    ReviewRunEventInput,
    ReviewRunEventResponse,
    ReviewRunEventsRequest,
    ReviewRunResponse,
    ReviewRunStartRequest,
    ReviewRunStatusUpdateRequest,
    ReviewSessionCreateRequest,
    ReviewSessionResponse,
)
from data.data_model import DiffHunk, FileChange
from data.schema import (
    SQLReviewApproval,
    SQLReviewResult,
    SQLReviewRun,
    SQLReviewRunEvent,
    SQLReviewSession,
)
from services.review_service import (
    ReviewCompareService,
    ReviewServiceError,
    build_review_finding_id,
)


VALID_SEVERITIES = {"high", "medium", "low"}
RUN_STATUS_TO_SESSION_STATUS = {
    "pending": "running",
    "running": "running",
    "awaiting_approval": "running",
    "completed": "completed",
    "failed": "failed",
    "cancelled": "cancelled",
}
RUN_STATUS_TO_PHASE = {
    "pending": "queued",
    "running": "running",
    "awaiting_approval": "awaiting_approval",
    "completed": "completed",
    "failed": "failed",
    "cancelled": "cancelled",
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ReviewSessionPersistenceService:
    def __init__(
        self,
        session: Session,
        compare_service: ReviewCompareService,
    ):
        self.session = session
        self.compare_service = compare_service

    def create_session(self, request: ReviewSessionCreateRequest) -> ReviewSessionResponse:
        compare = self.compare_service.compare(
            ReviewCompareRequest(
                repo_path=request.repo_path,
                base_ref=request.base_ref,
                head_ref=request.head_ref,
                context_lines=request.context_lines,
            )
        )
        (
            _repo,
            repo_path,
            base_commit,
            head_commit,
            _merge_base_commit,
        ) = self.compare_service.resolve_compare_target(
            repo_path=request.repo_path,
            base_ref=request.base_ref.strip(),
            head_ref=request.head_ref.strip(),
        )

        now = _utcnow()
        session_row = SQLReviewSession(
            id=self._next_id("rev_sess"),
            repo_path=repo_path,
            base_ref=compare.base_ref,
            head_ref=compare.head_ref,
            merge_base_sha=compare.merge_base_sha,
            base_head_sha=str(base_commit.id),
            head_head_sha=str(head_commit.id),
            context_lines=request.context_lines,
            review_mode="diff",
            instructions_preset="default",
            diff_stats=compare.stats.model_dump(mode="json"),
            changed_files=self._build_changed_files(compare.file_changes),
            stats=compare.stats.model_dump(mode="json"),
            file_changes=[
                self._strip_none_fields(fc.model_dump(mode="json"))
                for fc in compare.file_changes
            ],
            truncated=compare.truncated,
            status="ready",
            created_at=now,
            updated_at=now,
        )

        self.session.add(session_row)
        self.session.commit()
        self.session.refresh(session_row)
        return self._build_session_response(session_row, include_runs=False)

    def get_session(
        self, session_id: str, *, include_runs: bool = True
    ) -> ReviewSessionResponse:
        session_row = self._get_session_or_404(session_id)
        return self._build_session_response(session_row, include_runs=include_runs)

    def create_run(
        self, session_id: str, request: ReviewRunStartRequest
    ) -> ReviewRunResponse:
        session_row = self._get_session_or_404(session_id)
        now = _utcnow()
        run = SQLReviewRun(
            id=self._next_id("rev_run"),
            session_id=session_row.id,
            engine=request.engine.strip() or "codex_cli",
            depth="standard",
            execution_policy="on-request",
            allowlisted_commands_profile="default",
            include_optional_retrieval=False,
            mode=request.mode.strip() or "native_review",
            status="pending",
            phase="queued",
            partial=False,
            findings_payload=[],
            event_log_payload=[],
            command_logs=[],
            created_at=now,
            updated_at=now,
        )
        session_row.status = "running"
        session_row.updated_at = now
        self.session.add(run)
        self.session.commit()
        self.session.refresh(run)
        return self._build_run_response(run, include_events=True)

    def get_run(self, session_id: str, run_id: str) -> ReviewRunResponse:
        run = self._get_run_or_404(session_id, run_id)
        return self._build_run_response(run, include_events=True)

    def update_run_status(
        self,
        session_id: str,
        run_id: str,
        request: ReviewRunStatusUpdateRequest,
    ) -> ReviewRunResponse:
        run = self._get_run_or_404(session_id, run_id)
        now = _utcnow()
        run.status = request.status
        run.phase = RUN_STATUS_TO_PHASE.get(request.status, run.phase)
        run.error_detail = request.error_detail
        run.review_thread_id = request.review_thread_id or run.review_thread_id
        run.worktree_path = request.worktree_path or run.worktree_path
        run.codex_home_path = request.codex_home_path or run.codex_home_path
        if request.started_at is not None:
            run.started_at = request.started_at
        if request.completed_at is not None:
            run.completed_at = request.completed_at
        run.updated_at = now

        run.session.status = RUN_STATUS_TO_SESSION_STATUS.get(request.status, "running")
        run.session.updated_at = now
        self.session.commit()
        self.session.refresh(run)
        return self._build_run_response(run, include_events=True)

    def append_run_events(
        self,
        session_id: str,
        run_id: str,
        request: ReviewRunEventsRequest,
    ) -> list[ReviewRunEventResponse]:
        run = self._get_run_or_404(session_id, run_id)
        current_sequence = (
            self.session.query(func.max(SQLReviewRunEvent.sequence))
            .filter(SQLReviewRunEvent.run_id == run.id)
            .scalar()
            or 0
        )
        persisted_events: list[SQLReviewRunEvent] = []
        now = _utcnow()

        for offset, event in enumerate(request.events, start=1):
            event_row = SQLReviewRunEvent(
                run_id=run.id,
                sequence=current_sequence + offset,
                event_type=event.event_type,
                payload=event.payload,
                created_at=event.created_at or now,
            )
            self.session.add(event_row)
            persisted_events.append(event_row)
            self._apply_event_status(run, event)

        run.event_log_payload = [*list(run.event_log_payload or []), *[event.model_dump(mode="json") for event in request.events]]
        run.command_logs = self._merge_command_logs(run.command_logs or [], request.events)
        run.updated_at = now
        run.session.updated_at = now
        self.session.commit()
        for event_row in persisted_events:
            self.session.refresh(event_row)
        self.session.refresh(run)

        return [self._build_event_response(event_row) for event_row in persisted_events]

    def upsert_approval(
        self,
        session_id: str,
        run_id: str,
        request: ReviewApprovalUpsertRequest,
    ) -> ReviewApprovalResponse:
        run = self._get_run_or_404(session_id, run_id)
        approval = (
            self.session.query(SQLReviewApproval)
            .filter(SQLReviewApproval.id == request.id, SQLReviewApproval.run_id == run.id)
            .one_or_none()
        )
        now = _utcnow()

        if approval is None:
            approval = SQLReviewApproval(
                id=request.id,
                run_id=run.id,
                created_at=now,
                updated_at=now,
                method=request.method,
                status=request.status,
                summary=request.summary,
                thread_id=request.thread_id,
                turn_id=request.turn_id,
                item_id=request.item_id,
                request_payload=request.request_payload,
                response_payload=request.response_payload,
            )
            self.session.add(approval)
        else:
            approval.method = request.method
            approval.status = request.status
            approval.summary = request.summary
            approval.thread_id = request.thread_id
            approval.turn_id = request.turn_id
            approval.item_id = request.item_id
            approval.request_payload = request.request_payload
            approval.response_payload = request.response_payload
            approval.updated_at = now

        if request.status == "pending":
            run.status = "awaiting_approval"
            run.phase = "awaiting_approval"
        elif run.status == "awaiting_approval":
            run.status = "running"
            run.phase = "running"

        run.updated_at = now
        run.session.updated_at = now
        self.session.commit()
        self.session.refresh(approval)
        self.session.refresh(run)
        return self._build_approval_response(approval)

    def submit_result(
        self,
        session_id: str,
        run_id: str,
        request: ReviewResultSubmitRequest,
    ) -> ReviewResultResponse:
        run = self._get_run_or_404(session_id, run_id)
        normalized_findings = self._normalize_and_validate_findings(
            run.session.file_changes, request.findings
        )
        now = _utcnow()

        result = run.result
        if result is None:
            result = SQLReviewResult(
                id=self._next_id("rev_result"),
                run_id=run.id,
                created_at=now,
                updated_at=now,
            )
            self.session.add(result)

        result.summary = request.summary.strip()
        result.findings = [finding.model_dump(mode="json") for finding in normalized_findings]
        result.partial = request.partial
        result.generated_at = request.generated_at or now
        result.updated_at = now

        run.status = "completed"
        run.phase = "completed"
        run.completed_at = run.completed_at or now
        run.updated_at = now
        run.summary = result.summary
        run.partial = result.partial
        run.findings_payload = [finding.model_dump(mode="json") for finding in normalized_findings]
        run.session.status = "completed"
        run.session.updated_at = now

        self.session.commit()
        self.session.refresh(result)
        return self._build_result_response(result)

    def _apply_event_status(self, run: SQLReviewRun, event: ReviewRunEventInput) -> None:
        now = _utcnow()
        event_type = (event.event_type or "").strip()
        if event_type == "run_started":
            run.status = "running"
            run.started_at = event.created_at or now
        elif event_type == "run_completed":
            run.status = "completed"
            run.phase = "completed"
            run.completed_at = event.created_at or now
        elif event_type == "run_failed":
            run.status = "failed"
            run.phase = "failed"
            run.completed_at = event.created_at or now
            run.error_detail = str(event.payload.get("detail") or "Review run failed.")
        elif event_type == "run_cancelled":
            run.status = "cancelled"
            run.phase = "cancelled"
            run.completed_at = event.created_at or now
        elif event_type == "approval_requested":
            run.status = "awaiting_approval"
            run.phase = "awaiting_approval"
        elif event_type == "approval_resolved" and run.status == "awaiting_approval":
            run.status = "running"
            run.phase = "running"

        run.session.status = RUN_STATUS_TO_SESSION_STATUS.get(run.status, "running")

    def _normalize_and_validate_findings(
        self,
        raw_file_changes: list,
        findings,
    ) -> list[ReviewFinding]:
        file_changes = [
            FileChange.model_validate(self._strip_none_fields(item))
            for item in raw_file_changes
        ]
        changed_lines_by_path = self._build_changed_lines_by_path(file_changes)
        changed_file_paths = list(changed_lines_by_path.keys())
        file_changes_by_path = {
            (file_change.new_path or file_change.old_path): file_change
            for file_change in file_changes
        }
        normalized: list[ReviewFinding] = []

        for index, finding in enumerate(findings, start=1):
            severity = finding.severity.strip().lower()
            if severity not in VALID_SEVERITIES:
                raise ReviewServiceError(
                    f"Review finding severity '{finding.severity}' is unsupported.",
                    status_code=400,
                )

            file_path = finding.file_path.strip()
            path_was_remapped = False
            if file_path not in changed_lines_by_path:
                coerced_file_path = self._coerce_to_changed_file_path(
                    changed_file_paths,
                    finding.title,
                    finding.body,
                )
                if coerced_file_path is None:
                    raise ReviewServiceError(
                        f"Review finding path '{file_path}' is not part of the persisted diff.",
                        status_code=400,
                    )
                file_path = coerced_file_path
                path_was_remapped = True

            if finding.new_start is None:
                raise ReviewServiceError(
                    f"Review finding '{finding.title}' must anchor to a changed head-side line.",
                    status_code=400,
                )

            normalized_new_start = finding.new_start
            if path_was_remapped:
                normalized_new_start = self._get_default_changed_line(
                    file_changes_by_path[file_path]
                )
            elif normalized_new_start not in changed_lines_by_path[file_path]:
                normalized_new_start = self._coerce_to_changed_line(
                    file_changes_by_path[file_path],
                    normalized_new_start,
                )
                if normalized_new_start is None:
                    raise ReviewServiceError(
                        f"Review finding '{finding.title}' points to unchanged line {finding.new_start} in '{file_path}'.",
                        status_code=400,
                    )

            normalized.append(
                ReviewFinding(
                    id=finding.id
                    or build_review_finding_id(
                        index,
                        file_path=file_path,
                        new_start=normalized_new_start,
                        old_start=finding.old_start,
                        title=finding.title,
                    ),
                    severity=severity,
                    title=finding.title.strip(),
                    body=finding.body.strip(),
                    file_path=file_path,
                    new_start=normalized_new_start,
                    old_start=finding.old_start,
                )
            )

        return normalized

    def _build_changed_lines_by_path(
        self, file_changes: list[FileChange]
    ) -> dict[str, set[int]]:
        changed_lines_by_path: dict[str, set[int]] = {}
        for file_change in file_changes:
            file_path = file_change.new_path or file_change.old_path
            changed_lines_by_path[file_path] = set(
                self._collect_changed_lines(file_change)
            )

        return changed_lines_by_path

    def _coerce_to_changed_line(
        self,
        file_change: FileChange,
        requested_new_start: int,
    ) -> int | None:
        best_match: tuple[int, int] | None = None

        for hunk, changed_lines in self._collect_changed_lines_by_hunk(file_change):
            if hunk.new_lines <= 0 or not changed_lines:
                continue
            hunk_start = hunk.new_start
            hunk_end = hunk.new_start + hunk.new_lines - 1
            if requested_new_start < hunk_start or requested_new_start > hunk_end:
                continue
            for changed_line in changed_lines:
                distance = abs(changed_line - requested_new_start)
                if best_match is None or distance < best_match[0] or (
                    distance == best_match[0] and changed_line < best_match[1]
                ):
                    best_match = (distance, changed_line)

        return None if best_match is None else best_match[1]

    def _coerce_to_changed_file_path(
        self,
        changed_file_paths: list[str],
        title: str,
        body: str,
    ) -> str | None:
        if not changed_file_paths:
            return None

        haystack = f"{title}\n{body}".lower()
        for file_path in changed_file_paths:
            basename = file_path.rsplit("/", 1)[-1].lower()
            if file_path.lower() in haystack or basename in haystack:
                return file_path

        if len(changed_file_paths) == 1:
            return changed_file_paths[0]

        return None

    def _get_default_changed_line(self, file_change: FileChange) -> int | None:
        changed_lines = self._collect_changed_lines(file_change)
        return changed_lines[0] if changed_lines else None

    def _collect_changed_lines(self, file_change: FileChange) -> list[int]:
        changed_lines: list[int] = []
        for _hunk, hunk_changed_lines in self._collect_changed_lines_by_hunk(file_change):
            changed_lines.extend(hunk_changed_lines)
        return changed_lines

    def _collect_changed_lines_by_hunk(
        self,
        file_change: FileChange,
    ) -> list[tuple[DiffHunk, list[int]]]:
        changed_lines_by_hunk: list[tuple[DiffHunk, list[int]]] = []
        for hunk in file_change.hunks or []:
            changed_lines: list[int] = []
            old_line = hunk.old_start
            new_line = hunk.new_start
            for raw_line in (hunk.content or "").splitlines():
                if not raw_line:
                    continue
                origin = raw_line[0]
                if origin == "+":
                    changed_lines.append(new_line)
                    new_line += 1
                elif origin == "-":
                    old_line += 1
                else:
                    old_line += 1
                    new_line += 1
            changed_lines_by_hunk.append((hunk, changed_lines))
        return changed_lines_by_hunk

    def _get_session_or_404(self, session_id: str) -> SQLReviewSession:
        session_row = (
            self.session.query(SQLReviewSession)
            .filter(SQLReviewSession.id == session_id)
            .one_or_none()
        )
        if session_row is None:
            raise ReviewServiceError("Review session was not found.", status_code=404)
        return session_row

    def _get_run_or_404(self, session_id: str, run_id: str) -> SQLReviewRun:
        run = (
            self.session.query(SQLReviewRun)
            .filter(SQLReviewRun.id == run_id, SQLReviewRun.session_id == session_id)
            .one_or_none()
        )
        if run is None:
            raise ReviewServiceError("Review run was not found.", status_code=404)
        return run

    def _build_session_response(
        self, session_row: SQLReviewSession, *, include_runs: bool
    ) -> ReviewSessionResponse:
        runs = (
            [self._build_run_response(run, include_events=False) for run in session_row.runs]
            if include_runs
            else []
        )
        return ReviewSessionResponse(
            id=session_row.id,
            repo_path=session_row.repo_path,
            base_ref=session_row.base_ref,
            head_ref=session_row.head_ref,
            merge_base_sha=session_row.merge_base_sha,
            base_head_sha=session_row.base_head_sha,
            head_head_sha=session_row.head_head_sha,
            stats=session_row.stats or session_row.diff_stats or {},
            file_changes=[
                FileChange.model_validate(self._strip_none_fields(item))
                for item in (session_row.file_changes or session_row.changed_files or [])
            ],
            truncated=session_row.truncated,
            status=session_row.status,
            created_at=session_row.created_at,
            updated_at=session_row.updated_at,
            runs=runs,
        )

    def _build_run_response(
        self, run: SQLReviewRun, *, include_events: bool
    ) -> ReviewRunResponse:
        return ReviewRunResponse(
            id=run.id,
            session_id=run.session_id,
            engine=run.engine,
            mode=run.mode,
            status=run.status,
            error_detail=run.error_detail,
            review_thread_id=run.review_thread_id,
            worktree_path=run.worktree_path,
            codex_home_path=run.codex_home_path,
            started_at=run.started_at,
            completed_at=run.completed_at,
            created_at=run.created_at,
            updated_at=run.updated_at,
            events=(
                [self._build_event_response(event) for event in run.event_rows]
                if include_events
                else []
            ),
            approvals=[self._build_approval_response(approval) for approval in run.approvals],
            result=self._build_result_response(run.result) if run.result is not None else None,
        )

    def _build_event_response(
        self, event: SQLReviewRunEvent
    ) -> ReviewRunEventResponse:
        return ReviewRunEventResponse(
            id=event.id,
            run_id=event.run_id,
            sequence=event.sequence,
            event_type=event.event_type,
            payload=event.payload or {},
            created_at=event.created_at,
        )

    def _build_approval_response(
        self, approval: SQLReviewApproval
    ) -> ReviewApprovalResponse:
        return ReviewApprovalResponse(
            id=approval.id,
            run_id=approval.run_id,
            method=approval.method,
            status=approval.status,
            summary=approval.summary,
            thread_id=approval.thread_id,
            turn_id=approval.turn_id,
            item_id=approval.item_id,
            request_payload=approval.request_payload or {},
            response_payload=approval.response_payload,
            created_at=approval.created_at,
            updated_at=approval.updated_at,
        )

    def _build_result_response(self, result: SQLReviewResult) -> ReviewResultResponse:
        return ReviewResultResponse(
            id=result.id,
            run_id=result.run_id,
            summary=result.summary,
            findings=[ReviewFinding.model_validate(item) for item in result.findings or []],
            partial=result.partial,
            generated_at=result.generated_at,
            created_at=result.created_at,
            updated_at=result.updated_at,
        )

    def _next_id(self, prefix: str) -> str:
        return f"{prefix}_{uuid4().hex[:12]}"

    def _build_changed_files(self, file_changes: list[FileChange]) -> list[dict]:
        changed_files: list[dict] = []
        for file_change in file_changes:
            changed_lines: list[int] = []
            deleted_lines: list[int] = []
            for hunk in file_change.hunks or []:
                old_line = hunk.old_start
                new_line = hunk.new_start
                for raw_line in (hunk.content or "").splitlines():
                    if not raw_line:
                        continue
                    origin = raw_line[0]
                    if origin == "+":
                        changed_lines.append(new_line)
                        new_line += 1
                    elif origin == "-":
                        deleted_lines.append(old_line)
                        old_line += 1
                    else:
                        old_line += 1
                        new_line += 1

            changed_files.append(
                {
                    "path": file_change.new_path or file_change.old_path,
                    "status": file_change.status.value,
                    "old_path": file_change.old_path,
                    "new_path": file_change.new_path,
                    "added_lines": changed_lines,
                    "deleted_lines": deleted_lines,
                }
            )
        return changed_files

    def _merge_command_logs(
        self,
        current_logs: list,
        events: list[ReviewRunEventInput],
    ) -> list:
        command_logs = list(current_logs)
        for event in events:
            if event.event_type != "codex_notification":
                continue
            payload = event.payload or {}
            if payload.get("method") != "item/completed":
                continue
            params = payload.get("params") or {}
            if not isinstance(params, dict):
                continue
            item = params.get("item") or {}
            if not isinstance(item, dict) or item.get("type") != "commandExecution":
                continue
            command_logs.append(
                {
                    "id": item.get("id"),
                    "command": item.get("command"),
                    "cwd": item.get("cwd"),
                    "aggregated_output": item.get("aggregatedOutput"),
                    "exit_code": item.get("exitCode"),
                    "duration_ms": item.get("durationMs"),
                }
            )

        return command_logs

    def _strip_none_fields(self, value):
        if isinstance(value, dict):
            return {
                key: self._strip_none_fields(nested)
                for key, nested in value.items()
                if nested is not None
            }
        if isinstance(value, list):
            return [self._strip_none_fields(item) for item in value]
        return value
