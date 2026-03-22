import asyncio
import unittest
from unittest.mock import Mock

from fastapi import HTTPException

from api.api_model import (
    GenerateReviewRequest,
    ReviewCompareRequest,
    ReviewCompareResponse,
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


if __name__ == "__main__":
    unittest.main()
