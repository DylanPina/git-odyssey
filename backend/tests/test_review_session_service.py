from datetime import datetime, timezone
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

from api.api_model import (
    ReviewRunStartRequest,
    ReviewSessionCreateRequest,
    ReviewSubmittedFinding,
)
from data.data_model import DiffHunk, FileChange, FileSnapshot
from data.schema import FileChangeStatus
from services.review_service import ReviewServiceError
from services.review_session_service import ReviewSessionPersistenceService


def build_compare_file_changes() -> list[FileChange]:
    return [
        FileChange(
            old_path="src/file_0.py",
            new_path="src/file_0.py",
            status=FileChangeStatus.MODIFIED,
            commit_sha="head-sha",
            hunks=[
                DiffHunk(
                    old_start=10,
                    old_lines=1,
                    new_start=10,
                    new_lines=2,
                    content="-value = False\n+value = compute_flag()\n",
                    commit_sha="head-sha",
                )
            ],
            snapshot=FileSnapshot(
                path="src/file_0.py",
                content="value = compute_flag()\n",
                commit_sha="head-sha",
                previous_snapshot=FileSnapshot(
                    path="src/file_0.py",
                    content="value = False\n",
                    commit_sha="base-sha",
                ),
            ),
        )
    ]


class ReviewSessionPersistenceServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = ReviewSessionPersistenceService(
            session=Mock(),
            compare_service=Mock(),
        )

    def test_normalize_findings_snaps_context_line_to_changed_line(self) -> None:
        file_changes = build_compare_file_changes()
        file_changes[0].hunks[0].content = (
            " line_one\n"
            " line_two\n"
            "+new_value = compute_flag()\n"
            "+return new_value\n"
            " trailing_context\n"
        )
        file_changes[0].hunks[0].new_start = 1
        file_changes[0].hunks[0].new_lines = 5

        normalized = self.service._normalize_and_validate_findings(
            [file_change.model_dump(mode="json") for file_change in file_changes],
            [
                ReviewSubmittedFinding(
                    severity="medium",
                    title="Context line anchor",
                    body="Anchored to a context line inside the changed hunk.",
                    file_path="src/file_0.py",
                    new_start=2,
                    old_start=2,
                )
            ],
        )

        self.assertEqual(len(normalized), 1)
        self.assertEqual(normalized[0].new_start, 3)

    def test_normalize_findings_rejects_line_outside_changed_hunk(self) -> None:
        file_changes = build_compare_file_changes()
        file_changes[0].hunks[0].content = (
            " line_one\n"
            "+new_value = compute_flag()\n"
            " trailing_context\n"
        )
        file_changes[0].hunks[0].new_start = 10
        file_changes[0].hunks[0].new_lines = 3

        with self.assertRaises(ReviewServiceError) as context:
            self.service._normalize_and_validate_findings(
                [file_change.model_dump(mode="json") for file_change in file_changes],
                [
                    ReviewSubmittedFinding(
                        severity="medium",
                        title="Outside hunk anchor",
                        body="Anchored outside the changed hunk.",
                        file_path="src/file_0.py",
                        new_start=2,
                        old_start=2,
                    )
                ],
            )

        self.assertIn("points to unchanged line", str(context.exception))

    def test_normalize_findings_remaps_supporting_file_to_changed_file(self) -> None:
        file_changes = build_compare_file_changes()
        file_changes[0].old_path = "version-history.json"
        file_changes[0].new_path = "version-history.json"
        file_changes[0].hunks[0].content = (
            " [\n"
            "   {\n"
            "+    \"date\": \"August 10th, 2024\",\n"
            "+    \"version\": \"2.0.1\",\n"
            "+    \"changes\": []\n"
            "+  },\n"
            "+  {\n"
            "     \"date\": \"July 11th, 2024\",\n"
        )
        file_changes[0].hunks[0].new_start = 1
        file_changes[0].hunks[0].new_lines = 8

        normalized = self.service._normalize_and_validate_findings(
            [file_change.model_dump(mode="json") for file_change in file_changes],
            [
                ReviewSubmittedFinding(
                    severity="medium",
                    title="Supporting file path anchor",
                    body=(
                        "version-history.json adds 2.0.1, but lib/constants.ts still "
                        "reports the old current version."
                    ),
                    file_path="lib/constants.ts",
                    new_start=18,
                    old_start=18,
                )
            ],
        )

        self.assertEqual(len(normalized), 1)
        self.assertEqual(normalized[0].file_path, "version-history.json")
        self.assertEqual(normalized[0].new_start, 3)

    def test_create_session_reuses_existing_exact_session(self) -> None:
        existing_session = object()
        expected_response = object()
        self.service.compare_service.resolve_target.return_value = SimpleNamespace(
            target_mode="compare",
            commit_sha=None,
            repo_path="/tmp/example-repo",
            base_ref="main",
            head_ref="feature",
            base_head_sha="base-sha",
            head_head_sha="head-sha",
        )
        query = self.service.session.query.return_value
        query.filter.return_value.order_by.return_value.first.return_value = (
            existing_session
        )
        self.service._build_session_response = Mock(return_value=expected_response)

        result = self.service.create_session(
            ReviewSessionCreateRequest(
                repo_path="/tmp/example-repo",
                target_mode="compare",
                base_ref="main",
                head_ref="feature",
                context_lines=3,
            )
        )

        self.assertIs(result, expected_response)
        self.service.compare_service.compare_resolved.assert_not_called()
        self.service.session.add.assert_not_called()
        self.service.session.commit.assert_not_called()
        self.service._build_session_response.assert_called_once_with(
            existing_session, include_runs=True
        )

    def test_list_history_returns_successful_completed_review_runs(self) -> None:
        generated_at = datetime(2026, 3, 29, 12, 0, tzinfo=timezone.utc)
        completed_at = datetime(2026, 3, 29, 12, 5, tzinfo=timezone.utc)
        created_at = datetime(2026, 3, 29, 11, 58, tzinfo=timezone.utc)
        run = SimpleNamespace(
            id="rev_run_123",
            session_id="rev_sess_123",
            engine="codex_cli",
            mode="native_review",
            completed_at=completed_at,
            created_at=created_at,
            session=SimpleNamespace(
                repo_path="/tmp/example-repo",
                target_mode="compare",
                base_ref="main",
                head_ref="feature",
                commit_sha=None,
                merge_base_sha="merge-sha",
                base_head_sha="base-sha",
                head_head_sha="head-sha",
            ),
            result=SimpleNamespace(
                summary="Review summary",
                findings=[
                    {
                        "id": "finding-1",
                        "severity": "high",
                        "title": "Bug",
                        "body": "Body",
                        "file_path": "src/file.py",
                        "new_start": 10,
                    },
                    {
                        "id": "finding-2",
                        "severity": "low",
                        "title": "Nit",
                        "body": "Body",
                        "file_path": "src/file.py",
                        "new_start": 20,
                    },
                ],
                partial=False,
                generated_at=generated_at,
            ),
        )
        self.service.compare_service.resolve_repo_path.return_value = "/tmp/example-repo"
        query = self.service.session.query.return_value
        query.join.return_value = query
        query.options.return_value = query
        query.filter.return_value = query
        query.order_by.return_value.all.return_value = [run]

        result = self.service.list_history(
            repo_path="/tmp/example-repo",
            target_mode="compare",
            base_ref=" main ",
            head_ref=" feature ",
        )

        self.assertEqual(len(result.items), 1)
        item = result.items[0]
        self.assertEqual(item.session_id, "rev_sess_123")
        self.assertEqual(item.run_id, "rev_run_123")
        self.assertEqual(item.repo_path, "/tmp/example-repo")
        self.assertEqual(item.target_mode, "compare")
        self.assertEqual(item.base_ref, "main")
        self.assertEqual(item.head_ref, "feature")
        self.assertIsNone(item.commit_sha)
        self.assertEqual(item.findings_count, 2)
        self.assertEqual(item.severity_counts.high, 1)
        self.assertEqual(item.severity_counts.medium, 0)
        self.assertEqual(item.severity_counts.low, 1)
        self.assertEqual(item.generated_at, generated_at)
        self.assertEqual(item.completed_at, completed_at)

    def test_create_run_persists_custom_and_applied_instructions(self) -> None:
        session_row = SimpleNamespace(
            id="rev_sess_123",
            status="ready",
            updated_at=None,
        )
        expected_response = object()
        self.service._get_session_or_404 = Mock(return_value=session_row)
        self.service._next_id = Mock(return_value="rev_run_123")
        self.service._build_run_response = Mock(return_value=expected_response)

        result = self.service.create_run(
            "rev_sess_123",
            ReviewRunStartRequest(
                engine="codex_cli",
                mode="native_review",
                custom_instructions="  Focus on auth flows.  ",
                applied_instructions="  App-wide review guidelines:\nFocus on auth flows.  ",
            ),
        )

        self.assertIs(result, expected_response)
        run = self.service.session.add.call_args.args[0]
        self.assertEqual(run.custom_instructions, "Focus on auth flows.")
        self.assertEqual(
            run.applied_instructions,
            "App-wide review guidelines:\nFocus on auth flows.",
        )
        self.service._build_run_response.assert_called_once_with(
            run, include_events=True
        )


if __name__ == "__main__":
    unittest.main()
