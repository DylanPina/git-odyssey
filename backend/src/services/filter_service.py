from core.retriever import Retriever
from api.api_model import FilterRequest, FilterResponse


class FilterService:
    def __init__(self, retriever: Retriever):
        self.retriever = retriever

    def filter(self, request: FilterRequest) -> FilterResponse:
        results = self.retriever.filter(
            request.query,
            request.filters,
            request.repo_path,
            request.max_results,
        )
        return FilterResponse(
            commit_shas=[result["sha"] for result in results],
            results=results,
        )
