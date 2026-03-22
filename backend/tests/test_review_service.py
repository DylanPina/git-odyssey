import json
import os
import subprocess
import tempfile
import unittest
from unittest.mock import Mock

from api.api_model import GenerateReviewRequest, ReviewCompareRequest, ReviewCompareResponse
from data.data_model import DiffHunk, FileChange, FileSnapshot
from data.schema import FileChangeStatus
from infrastructure.errors import AIRequestError
from services.review_service import (
    MAX_REVIEW_FILES,
    ReviewCompareService,
    ReviewGenerationService,
    ReviewServiceError,
)


def run_git(cwd: str, *args: str) -> str:
    env = {
        **os.environ,
        "GIT_AUTHOR_NAME": "GitOdyssey",
        "GIT_AUTHOR_EMAIL": "gitodyssey@example.com",
        "GIT_COMMITTER_NAME": "GitOdyssey",
        "GIT_COMMITTER_EMAIL": "gitodyssey@example.com",
    }
    completed = subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
        env=env,
    )
    return completed.stdout.strip()


def write_file(repo_dir: str, relative_path: str, content: str) -> None:
    absolute_path = os.path.join(repo_dir, relative_path)
    os.makedirs(os.path.dirname(absolute_path), exist_ok=True)
    with open(absolute_path, "w", encoding="utf-8") as handle:
        handle.write(content)


class ReviewCompareServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.repo_dir = os.path.realpath(self.tempdir.name)
        run_git(self.repo_dir, "init")
        run_git(self.repo_dir, "checkout", "-b", "main")

        write_file(self.repo_dir, "README.md", "hello\n")
        write_file(
            self.repo_dir,
            "src/app.py",
            'def greet(name):\n    return f"Hi {name}"\n',
        )
        write_file(self.repo_dir, "delete_me.txt", "remove me\n")
        write_file(self.repo_dir, "rename_me.txt", "alpha\nbeta\ngamma\n")
        run_git(self.repo_dir, "add", ".")
        run_git(self.repo_dir, "commit", "-m", "Initial commit")
        self.initial_sha = run_git(self.repo_dir, "rev-parse", "HEAD")

        run_git(self.repo_dir, "checkout", "-b", "feature")
        write_file(
            self.repo_dir,
            "src/app.py",
            'def greet(name):\n    clean = name.strip()\n    return f"Hello {clean}"\n',
        )
        write_file(
            self.repo_dir,
            "src/new_feature.py",
            "def enabled():\n    return True\n",
        )
        os.remove(os.path.join(self.repo_dir, "delete_me.txt"))
        run_git(self.repo_dir, "mv", "rename_me.txt", "renamed.txt")
        write_file(self.repo_dir, "renamed.txt", "alpha\nbeta updated\ngamma\n")
        run_git(self.repo_dir, "add", "-A")
        run_git(self.repo_dir, "commit", "-m", "Feature review target")
        self.feature_sha = run_git(self.repo_dir, "rev-parse", "HEAD")
        run_git(self.repo_dir, "branch", "feature-copy", "feature")

        run_git(self.repo_dir, "checkout", "main")
        write_file(self.repo_dir, "base-only.txt", "base branch only\n")
        run_git(self.repo_dir, "add", "base-only.txt")
        run_git(self.repo_dir, "commit", "-m", "Base only change")

        self.service = ReviewCompareService()

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def test_compare_uses_merge_base_and_shapes_file_snapshots(self) -> None:
        response = self.service.compare(
            ReviewCompareRequest(
                repo_path=self.repo_dir,
                base_ref="main",
                head_ref="feature",
                context_lines=3,
            )
        )

        self.assertEqual(response.repo_path, self.repo_dir)
        self.assertEqual(response.merge_base_sha, self.initial_sha)
        self.assertFalse(response.truncated)
        self.assertEqual(response.stats.files_changed, 4)
        self.assertEqual(response.stats.additions, 5)
        self.assertEqual(response.stats.deletions, 3)

        file_changes_by_path = {
            (file_change.new_path or file_change.old_path): file_change
            for file_change in response.file_changes
        }
        self.assertNotIn("base-only.txt", file_changes_by_path)

        modified = file_changes_by_path["src/app.py"]
        self.assertEqual(modified.status, FileChangeStatus.MODIFIED)
        self.assertIn('return f"Hello {clean}"', modified.snapshot.content)
        self.assertIsNotNone(modified.snapshot.previous_snapshot)
        self.assertIn('return f"Hi {name}"', modified.snapshot.previous_snapshot.content)

        added = file_changes_by_path["src/new_feature.py"]
        self.assertEqual(added.status, FileChangeStatus.ADDED)
        self.assertIn("return True", added.snapshot.content)
        self.assertIsNone(added.snapshot.previous_snapshot)

        deleted = next(
            file_change
            for file_change in response.file_changes
            if file_change.status == FileChangeStatus.DELETED
        )
        self.assertEqual(deleted.old_path, "delete_me.txt")
        self.assertEqual(deleted.snapshot.path, "delete_me.txt")
        self.assertEqual(deleted.snapshot.content, "remove me\n")
        self.assertIsNone(deleted.snapshot.previous_snapshot)

        renamed = file_changes_by_path["renamed.txt"]
        self.assertEqual(renamed.status, FileChangeStatus.RENAMED)
        self.assertEqual(renamed.old_path, "rename_me.txt")
        self.assertEqual(renamed.snapshot.path, "renamed.txt")
        self.assertIsNotNone(renamed.snapshot.previous_snapshot)
        self.assertEqual(renamed.snapshot.previous_snapshot.path, "rename_me.txt")
        self.assertEqual(renamed.snapshot.previous_snapshot.content, "alpha\nbeta\ngamma\n")
        self.assertEqual(renamed.snapshot.content, "alpha\nbeta updated\ngamma\n")

    def test_compare_rejects_invalid_branch_selection(self) -> None:
        with self.assertRaises(ReviewServiceError) as context:
            self.service.compare(
                ReviewCompareRequest(
                    repo_path=self.repo_dir,
                    base_ref="missing-branch",
                    head_ref="feature",
                    context_lines=3,
                )
            )

        self.assertEqual(context.exception.status_code, 400)
        self.assertIn("Local branch 'missing-branch' was not found", context.exception.detail)

    def test_compare_rejects_same_ref_selection(self) -> None:
        with self.assertRaises(ReviewServiceError) as context:
            self.service.compare(
                ReviewCompareRequest(
                    repo_path=self.repo_dir,
                    base_ref="main",
                    head_ref="main",
                    context_lines=3,
                )
            )

        self.assertEqual(context.exception.status_code, 400)
        self.assertIn("Choose two different local branches", context.exception.detail)

    def test_compare_rejects_empty_diffs(self) -> None:
        with self.assertRaises(ReviewServiceError) as context:
            self.service.compare(
                ReviewCompareRequest(
                    repo_path=self.repo_dir,
                    base_ref="feature-copy",
                    head_ref="feature",
                    context_lines=3,
                )
            )

        self.assertEqual(context.exception.status_code, 400)
        self.assertIn("No changes were found", context.exception.detail)


def build_compare_response(file_count: int = 1) -> ReviewCompareResponse:
    file_changes: list[FileChange] = []

    for index in range(file_count):
        file_changes.append(
            FileChange(
                old_path=f"src/file_{index}.py",
                new_path=f"src/file_{index}.py",
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
                    path=f"src/file_{index}.py",
                    content="value = compute_flag()\n",
                    commit_sha="head-sha",
                    previous_snapshot=FileSnapshot(
                        path=f"src/file_{index}.py",
                        content="value = False\n",
                        commit_sha="base-sha",
                    ),
                ),
            )
        )

    return ReviewCompareResponse(
        repo_path="/tmp/example-repo",
        base_ref="main",
        head_ref="feature",
        merge_base_sha="merge-base-sha",
        stats={"files_changed": file_count, "additions": file_count, "deletions": file_count},
        file_changes=file_changes,
        truncated=False,
    )


class ReviewGenerationServiceTests(unittest.TestCase):
    def test_generate_validates_and_returns_review_report(self) -> None:
        compare_service = Mock()
        compare_service.compare.return_value = build_compare_response()
        ai_engine = Mock()
        ai_engine.generate_text.return_value = json.dumps(
            {
                "summary": "The diff adds a computed flag path and should be checked for callers that expect a boolean default.",
                "findings": [
                    {
                        "severity": "medium",
                        "title": "Computed flag may raise unexpectedly",
                        "body": "The new call to compute_flag() replaces a constant fallback and can now throw or perform extra work on hot paths.",
                        "file_path": "src/file_0.py",
                        "new_start": 10,
                        "old_start": 10,
                    }
                ],
            }
        )
        service = ReviewGenerationService(compare_service=compare_service, ai_engine=ai_engine)

        report = service.generate(
            GenerateReviewRequest(
                repo_path="/tmp/example-repo",
                base_ref="main",
                head_ref="feature",
                context_lines=3,
            )
        )

        self.assertFalse(report.partial)
        self.assertEqual(len(report.findings), 1)
        self.assertEqual(report.findings[0].severity, "medium")
        self.assertEqual(report.findings[0].file_path, "src/file_0.py")
        self.assertEqual(report.summary.startswith("The diff adds"), True)
        self.assertIsNotNone(report.generated_at)
        ai_engine.generate_text.assert_called_once()

    def test_generate_marks_partial_when_review_context_is_capped(self) -> None:
        compare_service = Mock()
        compare_service.compare.return_value = build_compare_response(
            file_count=MAX_REVIEW_FILES + 1
        )
        ai_engine = Mock()
        ai_engine.generate_text.return_value = json.dumps(
            {"summary": "Partial review.", "findings": []}
        )
        service = ReviewGenerationService(compare_service=compare_service, ai_engine=ai_engine)

        report = service.generate(
            GenerateReviewRequest(
                repo_path="/tmp/example-repo",
                base_ref="main",
                head_ref="feature",
                context_lines=3,
            )
        )

        self.assertTrue(report.partial)

    def test_generate_rejects_malformed_model_output(self) -> None:
        compare_service = Mock()
        compare_service.compare.return_value = build_compare_response()
        ai_engine = Mock()
        ai_engine.generate_text.return_value = "not json"
        service = ReviewGenerationService(compare_service=compare_service, ai_engine=ai_engine)

        with self.assertRaises(AIRequestError) as context:
            service.generate(
                GenerateReviewRequest(
                    repo_path="/tmp/example-repo",
                    base_ref="main",
                    head_ref="feature",
                    context_lines=3,
                )
            )

        self.assertIn("not valid JSON", str(context.exception))


if __name__ == "__main__":
    unittest.main()
