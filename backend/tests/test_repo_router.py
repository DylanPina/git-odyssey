import asyncio
import unittest
from unittest.mock import AsyncMock, Mock

from fastapi import HTTPException

from api.routers import repo as repo_router
from data.data_model import User


class RepoRouterTests(unittest.TestCase):
    def test_get_repo_auto_ingests_when_valid_repo_is_not_indexed(self) -> None:
        current_user = User(
            id=1,
            username="local-user",
            email="local@gitodyssey.app",
            api_credits_remaining=100,
        )
        repo_service = Mock()
        repo_service.has_repo.return_value = False
        repo_service.get_repo.return_value = Mock()
        ingest_service = Mock()
        ingest_service.resolve_repo_path.return_value = "/tmp/example-project"
        ingest_service.ingest_repo = AsyncMock(return_value="/tmp/example-project")

        asyncio.run(
            repo_router.get_repo(
                repo_path="/tmp/example-project",
                current_user=current_user,
                ingest_service=ingest_service,
                repo_service=repo_service,
                )
            )

        ingest_service.ingest_repo.assert_called_once()
        ingest_request = ingest_service.ingest_repo.await_args.args[0]
        self.assertEqual(ingest_request.max_commits, repo_router.DEFAULT_MAX_COMMITS)
        self.assertEqual(
            ingest_request.context_lines, repo_router.DEFAULT_CONTEXT_LINES
        )

    def test_get_repo_uses_supplied_repo_ingest_settings(self) -> None:
        current_user = User(
            id=1,
            username="local-user",
            email="local@gitodyssey.app",
            api_credits_remaining=100,
        )
        repo_service = Mock()
        repo_service.has_repo.return_value = False
        repo_service.get_repo.return_value = Mock()
        ingest_service = Mock()
        ingest_service.resolve_repo_path.return_value = "/tmp/example-project"
        ingest_service.ingest_repo = AsyncMock(return_value="/tmp/example-project")

        asyncio.run(
            repo_router.get_repo(
                repo_path="/tmp/example-project",
                max_commits=125,
                context_lines=7,
                current_user=current_user,
                ingest_service=ingest_service,
                repo_service=repo_service,
            )
        )

        ingest_request = ingest_service.ingest_repo.await_args.args[0]
        self.assertEqual(ingest_request.max_commits, 125)
        self.assertEqual(ingest_request.context_lines, 7)

    def test_get_repo_returns_404_when_repository_is_missing(self) -> None:
        current_user = User(
            id=1,
            username="local-user",
            email="local@gitodyssey.app",
            api_credits_remaining=100,
        )
        repo_service = Mock()
        repo_service.has_repo.return_value = False
        repo_service.get_repo.return_value = None
        ingest_service = Mock()
        ingest_service.resolve_repo_path.return_value = "/tmp/example-project"
        ingest_service.ingest_repo = AsyncMock(return_value="/tmp/example-project")

        with self.assertRaises(HTTPException) as context:
            asyncio.run(
                repo_router.get_repo(
                    repo_path="/tmp/example-project",
                    current_user=current_user,
                    ingest_service=ingest_service,
                    repo_service=repo_service,
                )
            )

        self.assertEqual(context.exception.status_code, 404)
        self.assertEqual(context.exception.detail, "Repository not found")


if __name__ == "__main__":
    unittest.main()
