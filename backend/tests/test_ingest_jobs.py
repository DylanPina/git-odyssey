import asyncio
import unittest
from unittest.mock import Mock

from api.api_model import IngestRequest
from services.ingest_service import IngestService


class IngestJobTests(unittest.TestCase):
    def setUp(self) -> None:
        IngestService.reset_runtime_state()
        self.service = IngestService(session=Mock(), embedder=None)
        self.service.resolve_repo_path = Mock(side_effect=lambda repo_path: repo_path)

    def tearDown(self) -> None:
        IngestService.reset_runtime_state()

    def test_start_ingest_job_returns_immediately_with_queued_snapshot(self) -> None:
        self.service._spawn_job_worker = Mock()

        job = self.service.start_ingest_job(
            IngestRequest(repo_path="/tmp/example-project"),
            user_id=1,
        )

        self.assertEqual(job.status, "queued")
        self.assertEqual(job.repo_path, "/tmp/example-project")
        self.assertEqual(job.progress.job_id, job.job_id)
        self.assertEqual(job.progress.progress_id, job.job_id)
        self.assertEqual(job.progress.label, "Queued repository sync")
        self.service._spawn_job_worker.assert_called_once()

    def test_start_ingest_job_reuses_active_job_for_same_repo(self) -> None:
        self.service._spawn_job_worker = Mock()

        first_job = self.service.start_ingest_job(
            IngestRequest(repo_path="/tmp/example-project"),
            user_id=1,
        )
        second_job = self.service.start_ingest_job(
            IngestRequest(repo_path="/tmp/example-project", force=True),
            user_id=1,
        )

        self.assertEqual(second_job.job_id, first_job.job_id)
        self.service._spawn_job_worker.assert_called_once()

    def test_wait_for_job_returns_terminal_status(self) -> None:
        self.service._spawn_job_worker = Mock()
        job = self.service.start_ingest_job(
            IngestRequest(repo_path="/tmp/example-project"),
            user_id=1,
        )

        async def wait_for_completion():
            async def mark_completed():
                await asyncio.sleep(0.01)
                self.service._update_job(
                    job.job_id,
                    status="completed",
                    result_repo_path=job.repo_path,
                )

            marker = asyncio.create_task(mark_completed())
            try:
                return await self.service.wait_for_job(
                    job.job_id, poll_interval_seconds=0.001
                )
            finally:
                await marker

        completed_job = asyncio.run(wait_for_completion())

        self.assertEqual(completed_job.status, "completed")
        self.assertEqual(completed_job.result_repo_path, "/tmp/example-project")
