from core.retriever import Retriever
from core.embedder import OpenAIEmbedder
from api.api_model import FilterRequest, FilterResponse
from sqlalchemy.orm import Session


class FilterService:
    def __init__(self, db: Session):
        self.db = db
        self.embedder = OpenAIEmbedder()
        self.retriever = Retriever(self.db, self.embedder)

    def filter(self, request: FilterRequest) -> FilterResponse:
        commit_shas = self.retriever.filter(
            request.query,
            request.filters,
            request.repo_url,
            request.max_results,
        )
        return FilterResponse(commit_shas=commit_shas)
