import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from core.ai import AIEngine
from data.data_model import Commit, DiffHunk, FileChange
from data.schema import FileChangeStatus


def build_commit_fixture() -> Commit:
    first_hunk = DiffHunk(
        old_start=10,
        old_lines=2,
        new_start=10,
        new_lines=4,
        content="-return False\n+return is_enabled(user)\n",
        commit_sha="abc123",
    )
    second_hunk = DiffHunk(
        old_start=20,
        old_lines=1,
        new_start=22,
        new_lines=2,
        content="-timeout = 30\n+timeout = settings.auth_timeout\n",
        commit_sha="abc123",
    )
    file_change = FileChange(
        old_path="src/auth.py",
        new_path="src/auth.py",
        status=FileChangeStatus.MODIFIED,
        hunks=[first_hunk, second_hunk],
        commit_sha="abc123",
    )
    return Commit(
        sha="abc123",
        repo_path="/tmp/example-repo",
        parents=["def456"],
        author="Casey",
        email="casey@example.com",
        time=1700000000,
        message="Refine auth guard behavior",
        file_changes=[file_change],
    )


class AIEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = Mock()
        self.client.responses.create.return_value = SimpleNamespace(
            output_text="  OpenAI summary output.  "
        )
        self.engine = AIEngine(
            client=self.client,
            model="gpt-5.4-mini",
            temperature=0.2,
        )

    def test_answer_question_uses_openai_responses(self) -> None:
        result = self.engine.answer_question(
            "What changed in auth?",
            "Commit abc123 updated auth checks.",
        )

        self.assertEqual(result, "OpenAI summary output.")
        self.client.responses.create.assert_called_once()
        kwargs = self.client.responses.create.call_args.kwargs
        self.assertEqual(kwargs["model"], "gpt-5.4-mini")
        self.assertEqual(kwargs["temperature"], 0.2)
        self.assertIn("Git repositories", kwargs["instructions"])
        self.assertIn("What changed in auth?", kwargs["input"])
        self.assertIn("Commit abc123 updated auth checks.", kwargs["input"])

    def test_summarize_hunk_formats_diff_context(self) -> None:
        hunk = build_commit_fixture().file_changes[0].hunks[0]

        result = self.engine.summarize_hunk(hunk)

        self.assertEqual(result, "OpenAI summary output.")
        kwargs = self.client.responses.create.call_args.kwargs
        self.assertIn("code hunk", kwargs["input"])
        self.assertIn("return is_enabled(user)", kwargs["input"])
        self.assertIn("10-2", kwargs["input"])

    def test_summarize_filechange_includes_all_hunks(self) -> None:
        file_change = build_commit_fixture().file_changes[0]

        result = self.engine.summarize_filechange(file_change)

        self.assertEqual(result, "OpenAI summary output.")
        kwargs = self.client.responses.create.call_args.kwargs
        self.assertIn("src/auth.py", kwargs["input"])
        self.assertIn("Hunk 1:", kwargs["input"])
        self.assertIn("Hunk 2:", kwargs["input"])
        self.assertIn("timeout = settings.auth_timeout", kwargs["input"])

    def test_summarize_commit_includes_nested_file_changes(self) -> None:
        commit = build_commit_fixture()

        result = self.engine.summarize_commit(commit)

        self.assertEqual(result, "OpenAI summary output.")
        kwargs = self.client.responses.create.call_args.kwargs
        self.assertIn("Commit Information:", kwargs["input"])
        self.assertIn("Refine auth guard behavior", kwargs["input"])
        self.assertIn("File Change 1:", kwargs["input"])
        self.assertIn("src/auth.py", kwargs["input"])

    def test_falls_back_to_output_messages_when_output_text_missing(self) -> None:
        self.client.responses.create.return_value = SimpleNamespace(
            output_text="",
            output=[
                SimpleNamespace(
                    type="message",
                    content=[
                        SimpleNamespace(type="output_text", text="  Fallback text  ")
                    ],
                )
            ],
        )

        result = self.engine.answer_question("What changed?", "Context")

        self.assertEqual(result, "Fallback text")


if __name__ == "__main__":
    unittest.main()
