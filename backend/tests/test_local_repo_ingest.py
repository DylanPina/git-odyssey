import os
import subprocess
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from core.repo import BranchState, DETACHED_HEAD_BRANCH_NAME, Repo
from services.ingest_service import IngestService


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


def write_file(target_path: str, content: str) -> None:
    with open(target_path, "w", encoding="utf-8") as handle:
        handle.write(content)


def create_commit(repo_dir: str, file_name: str, content: str, message: str) -> None:
    write_file(os.path.join(repo_dir, file_name), content)
    run_git(repo_dir, "add", file_name)
    run_git(repo_dir, "commit", "-m", message)


class LocalRepoIngestTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.repo_dir = os.path.realpath(self.tempdir.name)
        run_git(self.repo_dir, "init")
        run_git(self.repo_dir, "checkout", "-b", "main")
        create_commit(self.repo_dir, "README.md", "hello\n", "Initial commit")

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def build_service(self) -> IngestService:
        return IngestService(
            session=Mock(),
            embedder=None,
        )

    def test_resolve_repo_path_walks_up_from_nested_directory(self) -> None:
        nested_dir = os.path.join(self.repo_dir, "src", "nested")
        os.makedirs(nested_dir)

        resolved_path = Repo.discover_repo_path(nested_dir)

        self.assertEqual(resolved_path, self.repo_dir)

    def test_should_reindex_is_false_when_branch_heads_are_unchanged(self) -> None:
        service = self.build_service()
        _, branch_states = Repo.get_branch_states(self.repo_dir, max_commits=50)
        service._get_repo_row = Mock(
            return_value=SimpleNamespace(
                embedding_profile=None,
                reindex_required=False,
                indexed_context_lines=3,
                indexed_max_commits=50,
            )
        )
        service._get_stored_branch_states = Mock(
            return_value={
                name: SimpleNamespace(
                    name=name,
                    head_commit_sha=state.head_commit_sha,
                    commit_shas=set(state.commits),
                )
                for name, state in branch_states.items()
            }
        )
        service._get_stored_commit_shas = Mock(
            return_value={
                commit_sha
                for state in branch_states.values()
                for commit_sha in state.commits
            }
        )

        should_reindex = service.should_reindex(
            self.repo_dir,
            max_commits=50,
            context_lines=3,
        )

        self.assertFalse(should_reindex)

    def test_should_reindex_is_true_when_branch_heads_change(self) -> None:
        service = self.build_service()
        _, stored_branch_states = Repo.get_branch_states(self.repo_dir, max_commits=50)
        create_commit(self.repo_dir, "README.md", "hello again\n", "Update readme")
        service._get_repo_row = Mock(
            return_value=SimpleNamespace(
                embedding_profile=None,
                reindex_required=False,
                indexed_context_lines=3,
                indexed_max_commits=50,
            )
        )
        service._get_stored_branch_states = Mock(
            return_value={
                name: SimpleNamespace(
                    name=name,
                    head_commit_sha=state.head_commit_sha,
                    commit_shas=set(state.commits),
                )
                for name, state in stored_branch_states.items()
            }
        )
        service._get_stored_commit_shas = Mock(
            return_value={
                commit_sha
                for state in stored_branch_states.values()
                for commit_sha in state.commits
            }
        )

        should_reindex = service.should_reindex(
            self.repo_dir,
            max_commits=50,
            context_lines=3,
        )

        self.assertTrue(should_reindex)

    def test_should_reindex_is_true_when_max_commit_window_changes(self) -> None:
        service = self.build_service()
        _, stored_branch_states = Repo.get_branch_states(self.repo_dir, max_commits=1)
        create_commit(self.repo_dir, "README.md", "hello again\n", "Update readme")
        current_states = {
            "main": BranchState(
                name="main",
                repo_path=self.repo_dir,
                head_commit_sha=run_git(self.repo_dir, "rev-parse", "HEAD"),
                commits=[
                    run_git(self.repo_dir, "rev-parse", "HEAD"),
                    run_git(self.repo_dir, "rev-parse", "HEAD~1"),
                ],
            )
        }

        service._get_repo_row = Mock(
            return_value=SimpleNamespace(
                embedding_profile=None,
                reindex_required=False,
                indexed_context_lines=3,
                indexed_max_commits=1,
            )
        )
        service._get_stored_branch_states = Mock(
            return_value={
                name: SimpleNamespace(
                    name=name,
                    head_commit_sha=state.head_commit_sha,
                    commit_shas=set(state.commits),
                )
                for name, state in stored_branch_states.items()
            }
        )
        service._get_stored_commit_shas = Mock(
            return_value={
                commit_sha
                for state in stored_branch_states.values()
                for commit_sha in state.commits
            }
        )
        original_get_branch_states = Repo.get_branch_states
        Repo.get_branch_states = Mock(return_value=(self.repo_dir, current_states))
        try:
            should_reindex = service.should_reindex(
                self.repo_dir,
                max_commits=2,
                context_lines=3,
            )
        finally:
            Repo.get_branch_states = original_get_branch_states

        self.assertTrue(should_reindex)

    def test_detached_head_uses_synthetic_branch_view(self) -> None:
        head_sha = run_git(self.repo_dir, "rev-parse", "HEAD")
        run_git(self.repo_dir, "checkout", head_sha)

        _, branch_heads = Repo.get_branch_heads(self.repo_dir)

        self.assertEqual(branch_heads, {DETACHED_HEAD_BRANCH_NAME: head_sha})

    def test_embedding_profile_mismatch_triggers_reindex(self) -> None:
        service = self.build_service()
        service.embedder = SimpleNamespace(profile_fingerprint="new-fingerprint")
        repo = SimpleNamespace(
            embedding_profile=SimpleNamespace(fingerprint="old-fingerprint")
        )

        self.assertTrue(service._is_embedding_profile_mismatch(repo))

    def test_context_line_changes_require_full_rebuild(self) -> None:
        service = self.build_service()
        repo = SimpleNamespace(
            embedding_profile=None,
            reindex_required=False,
            indexed_context_lines=3,
            indexed_max_commits=50,
        )

        reason = service._get_full_rebuild_reason(
            repo,
            SimpleNamespace(context_lines=7, max_commits=50),
        )

        self.assertEqual(reason, "context_lines_changed")


if __name__ == "__main__":
    unittest.main()
