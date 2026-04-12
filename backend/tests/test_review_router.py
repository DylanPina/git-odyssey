import asyncio
import unittest
from unittest.mock import Mock

from fastapi import HTTPException

from api.api_model import (
    GenerateReviewRequest,
    ReviewHistoryResponse,
    ReviewRunStartRequest,
    ReviewCompareRequest,
    ReviewCompareResponse,
    ReviewSessionCreateRequest,
    ReviewSessionResponse,
    ReviewReport,
)
from api.routers import review as review_router
from services.review_service import ReviewServiceError


class ReviewRouterTests(unittest.TestCase):
    def test_compare_review_target_returns_service_payload(self) -> None:
        review_compare_service = Mock()
        expected = ReviewCompareResponse(
            repo_path="/tmp/example-repo",
            base_ref="main",
            head_ref="feature",
            merge_base_sha="abc123",
            stats={"files_changed": 1, "additions": 1, "deletions": 0},
            file_changes=[],
            truncated=False,
        )
        review_compare_service.compare.return_value = expected

        result = asyncio.run(
            review_router.compare_review_target(
                request=ReviewCompareRequest(
                    repo_path="/tmp/example-repo",
                    base_ref="main",
                    head_ref="feature",
                    context_lines=3,
                ),
                review_compare_service=review_compare_service,
            )
        )

        self.assertEqual(result, expected)
        review_compare_service.compare.assert_called_once()

    def test_compare_review_target_translates_review_errors(self) -> None:
        review_compare_service = Mock()
        review_compare_service.compare.side_effect = ReviewServiceError(
            "Choose two different local branches to compare.",
            status_code=400,
        )

        with self.assertRaises(HTTPException) as context:
            asyncio.run(
                review_router.compare_review_target(
                    request=ReviewCompareRequest(
                        repo_path="/tmp/example-repo",
                        base_ref="main",
                        head_ref="main",
                        context_lines=3,
                    ),
                    review_compare_service=review_compare_service,
                )
            )

        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(
            context.exception.detail,
            "Choose two different local branches to compare.",
        )

    def test_generate_review_returns_service_payload(self) -> None:
        review_generation_service = Mock()
        expected = ReviewReport(
            summary="Summary",
            findings=[],
            partial=False,
            generated_at="2026-03-21T12:00:00Z",
        )
        review_generation_service.generate.return_value = expected

        result = asyncio.run(
            review_router.generate_review(
                request=GenerateReviewRequest(
                    repo_path="/tmp/example-repo",
                    base_ref="main",
                    head_ref="feature",
                    context_lines=3,
                ),
                review_generation_service=review_generation_service,
            )
        )

        self.assertEqual(result, expected)
        review_generation_service.generate.assert_called_once()

    def test_generate_review_translates_review_errors(self) -> None:
        review_generation_service = Mock()
        review_generation_service.generate.side_effect = ReviewServiceError(
            "No changes were found between the selected branches.",
            status_code=400,
        )

        with self.assertRaises(HTTPException) as context:
            asyncio.run(
                review_router.generate_review(
                    request=GenerateReviewRequest(
                        repo_path="/tmp/example-repo",
                        base_ref="feature-copy",
                        head_ref="feature",
                        context_lines=3,
                    ),
                    review_generation_service=review_generation_service,
                )
            )

        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(
            context.exception.detail,
            "No changes were found between the selected branches.",
        )

    def test_create_review_session_returns_service_payload(self) -> None:
        review_session_service = Mock()
        expected = ReviewSessionResponse(
            id="rev_sess_123",
            repo_path="/tmp/example-repo",
            base_ref="main",
            head_ref="feature",
            merge_base_sha="abc123",
            base_head_sha="def456",
            head_head_sha="789abc",
            stats={"files_changed": 1, "additions": 1, "deletions": 0},
            file_changes=[],
            truncated=False,
            status="ready",
            created_at="2026-03-28T12:00:00Z",
            updated_at="2026-03-28T12:00:00Z",
            runs=[],
        )
        review_session_service.create_session.return_value = expected

        result = asyncio.run(
            review_router.create_review_session(
                request=ReviewSessionCreateRequest(
                    repo_path="/tmp/example-repo",
                    base_ref="main",
                    head_ref="feature",
                    context_lines=3,
                ),
                review_session_service=review_session_service,
            )
        )

        self.assertEqual(result, expected)
        review_session_service.create_session.assert_called_once()

    def test_list_review_history_returns_service_payload(self) -> None:
        review_session_service = Mock()
        expected = ReviewHistoryResponse(
            items=[
                {
                    "session_id": "rev_sess_123",
                    "run_id": "rev_run_456",
                    "repo_path": "/tmp/example-repo",
                    "base_ref": "main",
                    "head_ref": "feature",
                    "merge_base_sha": "merge123",
                    "base_head_sha": "base456",
                    "head_head_sha": "head789",
                    "engine": "codex_cli",
                    "mode": "native_review",
                    "partial": False,
                    "summary": "Looks good overall.",
                    "findings_count": 0,
                    "severity_counts": {"high": 0, "medium": 0, "low": 0},
                    "generated_at": "2026-03-29T14:00:00Z",
                    "completed_at": "2026-03-29T14:01:00Z",
                    "run_created_at": "2026-03-29T13:59:00Z",
                }
            ]
        )
        review_session_service.list_history.return_value = expected

        result = asyncio.run(
            review_router.list_review_history(
                repo_path="/tmp/example-repo",
                target_mode="compare",
                base_ref="main",
                head_ref="feature",
                review_session_service=review_session_service,
            )
        )

        self.assertEqual(result, expected)
        review_session_service.list_history.assert_called_once_with(
            repo_path="/tmp/example-repo",
            target_mode="compare",
            base_ref="main",
            head_ref="feature",
            commit_sha=None,
        )

    def test_create_review_run_returns_service_payload(self) -> None:
        review_session_service = Mock()
        review_session_service.create_run.return_value = {
            "id": "rev_run_456",
            "session_id": "rev_sess_123",
            "engine": "codex_cli",
            "mode": "native_review",
            "status": "pending",
            "custom_instructions": "Focus on auth flows.",
            "applied_instructions": "App-wide review guidelines:\nFocus on auth flows.",
            "created_at": "2026-03-28T12:00:00Z",
            "updated_at": "2026-03-28T12:00:00Z",
            "events": [],
            "approvals": [],
            "result": None,
        }

        result = asyncio.run(
            review_router.create_review_run(
                session_id="rev_sess_123",
                request=ReviewRunStartRequest(
                    engine="codex_cli",
                    mode="native_review",
                    custom_instructions="Focus on auth flows.",
                    applied_instructions="App-wide review guidelines:\nFocus on auth flows.",
                ),
                review_session_service=review_session_service,
            )
        )

        self.assertEqual(result["id"], "rev_run_456")
        review_session_service.create_run.assert_called_once()


if __name__ == "__main__":
    unittest.main()
