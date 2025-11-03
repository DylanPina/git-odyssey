from core.retriever import Retriever
from core.writer import Writer
from core.ai import AIEngine


class SummarizeService:
    def __init__(
        self,
        ai_engine: AIEngine,
        writer: Writer,
        retriever: Retriever,
    ):
        self.ai_engine = ai_engine
        self.writer = writer
        self.retriever = retriever

    def summarize_commit(self, sha: str):
        commit = self.retriever.get_commit(sha)
        if not commit:
            return ""
        commit.summary = self.ai_engine.summarize_commit(commit)
        self.writer.update_summaries(commit)
        return commit.summary or ""

    def summarize_file_change(self, id: int) -> str:
        file_change = self.retriever.get_file_change(id)
        if not file_change:
            return ""
        file_change.summary = self.ai_engine.summarize_filechange(file_change)
        self.writer.update_summaries(file_change)
        return file_change.summary or ""

    def summarize_hunk(self, id: int) -> str:
        hunk = self.retriever.get_hunk(id)
        if not hunk:
            return ""
        hunk.summary = self.ai_engine.summarize_hunk(hunk)
        self.writer.update_summaries(hunk)
        return hunk.summary or ""
