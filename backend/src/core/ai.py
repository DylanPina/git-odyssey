from infrastructure.ai_clients import ResponsesTextClient

from utils.prompts import (
    build_question_prompt,
    build_hunk_summary_prompt,
    format_hunk_aggregation,
    build_filechange_summary_prompt,
    build_commit_summary_prompt,
)
from data.data_model import DiffHunk, FileChange, Commit


class AIEngine:
    def __init__(
        self,
        client: ResponsesTextClient,
        model: str = "gpt-5.4-mini",
        temperature: float = 0.2,
    ):
        self.client = client
        self.model = model
        self.temperature = temperature

    def _invoke(self, instructions: str, input_text: str) -> str:
        return self.client.generate(
            model=self.model,
            temperature=self.temperature,
            instructions=instructions,
            input_text=input_text,
        )

    def answer_question(self, question: str, context: str) -> str:
        instructions, input_text = build_question_prompt(question, context)
        return self._invoke(instructions, input_text)

    def summarize_hunk(self, hunk: DiffHunk) -> str:
        """Generate a summary for a diff hunk using raw content."""
        instructions, input_text = build_hunk_summary_prompt(
            old_start=hunk.old_start,
            old_lines=hunk.old_lines,
            new_start=hunk.new_start,
            new_lines=hunk.new_lines,
            lines=(hunk.content or "").strip(),
        )
        return self._invoke(instructions, input_text)

    def summarize_filechange(self, file_change: FileChange) -> str:
        """Generate a summary for a file change."""
        formatted_hunks = []
        for i, hunk in enumerate(file_change.hunks, 1):
            formatted_hunk = format_hunk_aggregation(
                index=i,
                old_start=hunk.old_start,
                old_lines=hunk.old_lines,
                new_start=hunk.new_start,
                new_lines=hunk.new_lines,
                content=hunk.content or "",
            )
            formatted_hunks.append(formatted_hunk)

        hunks_text = "\n".join(formatted_hunks)
        instructions, input_text = build_filechange_summary_prompt(
            old_path=file_change.old_path,
            new_path=file_change.new_path,
            status=file_change.status.value,
            hunks=hunks_text,
        )
        return self._invoke(instructions, input_text)

    def summarize_commit(self, commit: Commit) -> str:
        """Generate a summary for a commit with all file changes formatted."""
        formatted_file_changes = []
        for i, file_change in enumerate(commit.file_changes, 1):
            formatted_hunks = []
            for j, hunk in enumerate(file_change.hunks, 1):
                formatted_hunk = format_hunk_aggregation(
                    index=j,
                    old_start=hunk.old_start,
                    old_lines=hunk.old_lines,
                    new_start=hunk.new_start,
                    new_lines=hunk.new_lines,
                    content=hunk.content or "",
                )
                formatted_hunks.append(formatted_hunk)

            hunks_text = "\n".join(formatted_hunks)
            file_change_text = f"""File Change {i}:
            Old Path: {file_change.old_path}
            New Path: {file_change.new_path}
            Status: {file_change.status.value}
            Hunks:
            {hunks_text}
            """
            formatted_file_changes.append(file_change_text)

        file_changes_text = "\n".join(formatted_file_changes)
        instructions, input_text = build_commit_summary_prompt(
            sha=commit.sha,
            message=commit.message,
            author=commit.author or "Unknown",
            file_changes=file_changes_text,
        )
        return self._invoke(instructions, input_text)
