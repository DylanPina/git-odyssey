import hashlib
import json
import re
from datetime import datetime, timezone

import pygit2
from pydantic import BaseModel, Field, ValidationError

from api.api_model import (
    GenerateReviewRequest,
    ReviewCompareRequest,
    ReviewCompareResponse,
    ReviewFinding,
    ReviewReport,
    ReviewStats,
)
from core.ai import AIEngine
from core.repo import DETACHED_HEAD_BRANCH_NAME, Repo
from data.data_model import DiffHunk, FileChange, FileSnapshot
from data.schema import FileChangeStatus
from infrastructure.errors import AIRequestError
from utils.prompts import build_review_report_prompt

MAX_REVIEW_FILES = 20
MAX_REVIEW_HUNKS_PER_FILE = 12
MAX_REVIEW_HUNK_CHARS = 2400
MAX_REVIEW_SNAPSHOT_CHARS = 4000
RAW_SHA_PATTERN = re.compile(r"^[0-9a-fA-F]{7,40}$")


class ReviewServiceError(ValueError):
    def __init__(self, detail: str, status_code: int = 400):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class ReviewCompareService:
    def compare(self, request: ReviewCompareRequest) -> ReviewCompareResponse:
        base_ref = request.base_ref.strip()
        head_ref = request.head_ref.strip()

        if not request.repo_path.strip():
            raise ReviewServiceError("Repository path is required.", status_code=400)

        if not base_ref or not head_ref:
            raise ReviewServiceError(
                "Select both a base branch and a head branch before loading the diff.",
                status_code=400,
            )

        if base_ref == head_ref:
            raise ReviewServiceError(
                "Choose two different local branches to compare.", status_code=400
            )

        repo, repo_path = self._open_repo(request.repo_path)
        base_commit = self._resolve_local_branch(repo, base_ref)
        head_commit = self._resolve_local_branch(repo, head_ref)

        merge_base_oid = repo.merge_base(base_commit.id, head_commit.id)
        if merge_base_oid is None:
            raise ReviewServiceError(
                "The selected branches do not share a merge base.", status_code=400
            )

        merge_base_commit = repo[merge_base_oid]
        diff = merge_base_commit.tree.diff_to_tree(
            head_commit.tree, context_lines=request.context_lines
        )
        try:
            diff.find_similar(
                pygit2.GIT_DIFF_FIND_RENAMES | pygit2.GIT_DIFF_FIND_COPIES
            )
        except Exception:
            # Rename detection is helpful but not required for a usable compare payload.
            pass

        file_changes: list[FileChange] = []
        additions = 0
        deletions = 0

        for patch in diff:
            file_change, file_additions, file_deletions = self._build_file_change(
                repo=repo,
                merge_base_commit=merge_base_commit,
                head_commit=head_commit,
                patch=patch,
            )
            file_changes.append(file_change)
            additions += file_additions
            deletions += file_deletions

        if not file_changes:
            raise ReviewServiceError(
                "No changes were found between the selected branches.", status_code=400
            )

        return ReviewCompareResponse(
            repo_path=repo_path,
            base_ref=base_ref,
            head_ref=head_ref,
            merge_base_sha=str(merge_base_commit.id),
            stats=ReviewStats(
                files_changed=len(file_changes),
                additions=additions,
                deletions=deletions,
            ),
            file_changes=file_changes,
            truncated=False,
        )

    def _open_repo(self, repo_path: str) -> tuple[pygit2.Repository, str]:
        try:
            return Repo.open_repo(repo_path)
        except ValueError as error:
            raise ReviewServiceError(str(error), status_code=404) from error

    def _resolve_local_branch(
        self, repo: pygit2.Repository, ref_name: str
    ) -> pygit2.Commit:
        if ref_name == DETACHED_HEAD_BRANCH_NAME:
            raise ReviewServiceError(
                "Detached-HEAD review mode is not supported in v1.", status_code=400
            )

        if RAW_SHA_PATTERN.fullmatch(ref_name):
            raise ReviewServiceError(
                "Raw SHA review targets are not supported in v1. Select a local branch instead.",
                status_code=400,
            )

        if ref_name.startswith("refs/"):
            raise ReviewServiceError(
                "Review compares support local branch names only, not raw ref paths.",
                status_code=400,
            )

        branch = repo.lookup_branch(ref_name, pygit2.GIT_BRANCH_LOCAL)
        if branch is None:
            remote_branch = repo.lookup_branch(ref_name, pygit2.GIT_BRANCH_REMOTE)
            if remote_branch is not None:
                raise ReviewServiceError(
                    f"'{ref_name}' is a remote branch. Review compares support local branches only.",
                    status_code=400,
                )
            raise ReviewServiceError(
                f"Local branch '{ref_name}' was not found in this repository.",
                status_code=400,
            )

        try:
            resolved = repo[branch.target]
        except Exception as error:
            raise ReviewServiceError(
                f"Failed to resolve local branch '{ref_name}'.", status_code=400
            ) from error

        if not isinstance(resolved, pygit2.Commit):
            raise ReviewServiceError(
                f"Local branch '{ref_name}' does not point to a commit.", status_code=400
            )

        return resolved

    def _build_file_change(
        self,
        *,
        repo: pygit2.Repository,
        merge_base_commit: pygit2.Commit,
        head_commit: pygit2.Commit,
        patch,
    ) -> tuple[FileChange, int, int]:
        delta = patch.delta
        status = self._map_file_change_status(delta.status)
        old_path = delta.old_file.path or ""
        new_path = delta.new_file.path or ""
        hunks: list[DiffHunk] = []
        additions = 0
        deletions = 0

        for hunk in patch.hunks:
            hunk_lines: list[str] = []
            for line in hunk.lines:
                content = (
                    line.content.decode("utf-8", "replace")
                    if isinstance(line.content, (bytes, bytearray))
                    else line.content
                )
                origin = line.origin
                hunk_lines.append(f"{origin}{content}")
                if origin == "+":
                    additions += 1
                elif origin == "-":
                    deletions += 1

            hunks.append(
                DiffHunk(
                    old_start=hunk.old_start,
                    old_lines=hunk.old_lines,
                    new_start=hunk.new_start,
                    new_lines=hunk.new_lines,
                    content="".join(hunk_lines),
                    commit_sha=str(head_commit.id),
                )
            )

        snapshot = self._build_snapshot(
            repo=repo,
            merge_base_commit=merge_base_commit,
            head_commit=head_commit,
            old_path=old_path,
            new_path=new_path,
            status=status,
        )

        return (
            FileChange(
                old_path=old_path,
                new_path=new_path,
                status=status,
                hunks=hunks,
                snapshot=snapshot,
                commit_sha=str(head_commit.id),
            ),
            additions,
            deletions,
        )

    def _build_snapshot(
        self,
        *,
        repo: pygit2.Repository,
        merge_base_commit: pygit2.Commit,
        head_commit: pygit2.Commit,
        old_path: str,
        new_path: str,
        status: FileChangeStatus,
    ) -> FileSnapshot:
        commit_sha = str(head_commit.id)

        if status == FileChangeStatus.DELETED:
            deleted_content = self._get_snapshot(repo, merge_base_commit.tree, old_path)
            return FileSnapshot(
                path=old_path or new_path,
                content=deleted_content or "",
                commit_sha=commit_sha,
            )

        current_path = new_path or old_path
        current_content = self._get_snapshot(repo, head_commit.tree, current_path)
        previous_snapshot = None

        if status in {
            FileChangeStatus.MODIFIED,
            FileChangeStatus.RENAMED,
            FileChangeStatus.COPIED,
        }:
            previous_content = self._get_snapshot(repo, merge_base_commit.tree, old_path)
            previous_snapshot = FileSnapshot(
                path=old_path,
                content=previous_content or "",
                commit_sha=str(merge_base_commit.id),
            )

        return FileSnapshot(
            path=current_path,
            content=current_content or "",
            commit_sha=commit_sha,
            previous_snapshot=previous_snapshot,
        )

    def _get_snapshot(
        self, repo: pygit2.Repository, tree: pygit2.Tree, path: str
    ) -> str | None:
        if not path:
            return None

        try:
            parts = [part for part in path.split("/") if part]
            current = tree

            for index, part in enumerate(parts):
                entry = current[part]
                obj = repo[entry.id]

                if index < len(parts) - 1:
                    if isinstance(obj, pygit2.Tree):
                        current = obj
                        continue
                    return None

                if hasattr(obj, "data"):
                    return obj.data.decode("utf-8", "replace").replace("\x00", "")
                return None
        except Exception:
            return None

    def _map_file_change_status(self, status_code: int) -> FileChangeStatus:
        if status_code == 1:
            return FileChangeStatus.ADDED
        if status_code == 2:
            return FileChangeStatus.DELETED
        if status_code == 3:
            return FileChangeStatus.MODIFIED
        if status_code == 4:
            return FileChangeStatus.RENAMED
        if status_code == 5:
            return FileChangeStatus.COPIED
        raise ReviewServiceError(
            f"Unsupported diff selection encountered a change with status code {status_code}.",
            status_code=400,
        )


class _RawReviewFinding(BaseModel):
    severity: str
    title: str
    body: str
    file_path: str
    new_start: int | None = None
    old_start: int | None = None


class _RawReviewReport(BaseModel):
    summary: str
    findings: list[_RawReviewFinding] = Field(default_factory=list)


class ReviewGenerationService:
    def __init__(
        self,
        compare_service: ReviewCompareService,
        ai_engine: AIEngine,
    ):
        self.compare_service = compare_service
        self.ai_engine = ai_engine

    def generate(self, request: GenerateReviewRequest) -> ReviewReport:
        compare = self.compare_service.compare(
            ReviewCompareRequest(
                repo_path=request.repo_path,
                base_ref=request.base_ref,
                head_ref=request.head_ref,
                context_lines=request.context_lines,
            )
        )

        reviewed_files, partial = self._prepare_review_context(compare)
        instructions, input_text = build_review_report_prompt(
            base_ref=compare.base_ref,
            head_ref=compare.head_ref,
            merge_base_sha=compare.merge_base_sha,
            files_changed=compare.stats.files_changed,
            additions=compare.stats.additions,
            deletions=compare.stats.deletions,
            partial=partial,
            reviewed_files=reviewed_files,
        )
        raw_output = self.ai_engine.generate_text(instructions, input_text)
        parsed = self._parse_review_output(raw_output)

        findings = [
            ReviewFinding(
                id=self._build_finding_id(index, raw_finding),
                severity=self._normalize_severity(raw_finding.severity),
                title=raw_finding.title.strip(),
                body=raw_finding.body.strip(),
                file_path=raw_finding.file_path.strip(),
                new_start=raw_finding.new_start,
                old_start=raw_finding.old_start,
            )
            for index, raw_finding in enumerate(parsed.findings, start=1)
        ]

        return ReviewReport(
            summary=parsed.summary.strip(),
            findings=findings,
            partial=partial,
            generated_at=datetime.now(timezone.utc),
        )

    def _prepare_review_context(
        self, compare: ReviewCompareResponse
    ) -> tuple[str, bool]:
        partial = False
        file_blocks: list[str] = []

        for file_index, file_change in enumerate(compare.file_changes, start=1):
            if file_index > MAX_REVIEW_FILES:
                partial = True
                break

            hunk_blocks: list[str] = []
            hunks = file_change.hunks or []
            if len(hunks) > MAX_REVIEW_HUNKS_PER_FILE:
                partial = True

            for hunk_index, hunk in enumerate(hunks[:MAX_REVIEW_HUNKS_PER_FILE], start=1):
                truncated_hunk, hunk_truncated = self._truncate_text(
                    hunk.content or "", MAX_REVIEW_HUNK_CHARS
                )
                partial = partial or hunk_truncated
                hunk_blocks.append(
                    "\n".join(
                        [
                            f"    Hunk {hunk_index}:",
                            (
                                "      Range: "
                                f"-{hunk.old_start},{hunk.old_lines} "
                                f"+{hunk.new_start},{hunk.new_lines}"
                            ),
                            "      Diff:",
                            "```diff",
                            truncated_hunk,
                            "```",
                        ]
                    )
                )

            previous_snapshot_text = (
                file_change.snapshot.previous_snapshot.content
                if file_change.snapshot and file_change.snapshot.previous_snapshot
                else ""
            )
            current_snapshot_text = (
                file_change.snapshot.content if file_change.snapshot else ""
            )
            previous_snapshot, prev_truncated = self._truncate_text(
                previous_snapshot_text, MAX_REVIEW_SNAPSHOT_CHARS
            )
            current_snapshot, current_truncated = self._truncate_text(
                current_snapshot_text, MAX_REVIEW_SNAPSHOT_CHARS
            )
            partial = partial or prev_truncated or current_truncated
            hunk_section = hunk_blocks if hunk_blocks else ["    (No textual hunks)"]

            file_blocks.append(
                "\n".join(
                    [
                        f"File {file_index}:",
                        f"  Path: {file_change.new_path or file_change.old_path}",
                        f"  Old Path: {file_change.old_path}",
                        f"  New Path: {file_change.new_path}",
                        f"  Status: {file_change.status.value}",
                        "  Previous Snapshot:",
                        "```",
                        previous_snapshot,
                        "```",
                        "  Current Snapshot:",
                        "```",
                        current_snapshot,
                        "```",
                        "  Hunks:",
                        *hunk_section,
                    ]
                )
            )

        return ("\n\n".join(file_blocks), partial)

    def _parse_review_output(self, raw_output: str) -> _RawReviewReport:
        try:
            payload = json.loads(self._extract_json_object(raw_output))
        except json.JSONDecodeError as error:
            raise AIRequestError(
                f"AI review output was not valid JSON: {error.msg}"
            ) from error

        try:
            return _RawReviewReport.model_validate(payload)
        except ValidationError as error:
            raise AIRequestError(
                f"AI review output did not match the expected schema: {error}"
            ) from error

    def _extract_json_object(self, raw_output: str) -> str:
        candidate = raw_output.strip()

        fenced_match = re.search(
            r"```(?:json)?\s*(\{.*\})\s*```",
            candidate,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if fenced_match:
            return fenced_match.group(1)

        start = candidate.find("{")
        end = candidate.rfind("}")
        if start != -1 and end != -1 and end > start:
            return candidate[start : end + 1]

        return candidate

    def _normalize_severity(self, severity: str) -> str:
        normalized = severity.strip().lower()
        if normalized not in {"high", "medium", "low"}:
            raise AIRequestError(
                f"AI review output used an unsupported severity '{severity}'."
            )
        return normalized

    def _build_finding_id(
        self, index: int, finding: _RawReviewFinding
    ) -> str:
        digest = hashlib.sha1(
            "|".join(
                [
                    finding.file_path.strip(),
                    str(finding.new_start or ""),
                    str(finding.old_start or ""),
                    finding.title.strip(),
                ]
            ).encode("utf-8")
        ).hexdigest()[:10]
        return f"finding-{index}-{digest}"

    def _truncate_text(self, value: str, limit: int) -> tuple[str, bool]:
        if len(value) <= limit:
            return value, False
        return value[: limit - 15] + "\n...[truncated]", True
