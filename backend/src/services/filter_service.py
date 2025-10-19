from core.retriever import Retriever
from core.embedder import OpenAIEmbedder
from data.database import Database
from api.api_model import FilterRequest, FilterResponse


class FilterService:
    def __init__(self):
        self.db = Database()
        self.embedder = OpenAIEmbedder()
        self.retriever = Retriever(self.db, self.embedder)

    def filter(self, request: FilterRequest) -> FilterResponse:
        """commit_shas = self.retriever.filter(
            request.query,
            request.filters,
            request.repo_url,
            request.max_results,
        )"""
        commit_shas = self.retriever.get_context(request.query, request.context_shas)
        return FilterResponse(commit_shas=commit_shas)
