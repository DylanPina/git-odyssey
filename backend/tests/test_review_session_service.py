import unittest
from unittest.mock import Mock

from api.api_model import ReviewSubmittedFinding
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


if __name__ == "__main__":
    unittest.main()
