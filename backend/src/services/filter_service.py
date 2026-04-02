from core.retriever import Retriever
from api.api_model import FilterRequest, FilterResponse


class FilterService:
    def __init__(self, retriever: Retriever):
        self.retriever = retriever

    def filter(self, request: FilterRequest) -> FilterResponse:
        search_result = self.retriever.filter(
            request.query,
            request.filters,
            request.repo_path,
            request.max_results,
        )
        return FilterResponse(
            commit_shas=[result["sha"] for result in search_result.results],
            results=search_result.results,
            total_ranked_results=search_result.total_ranked_results,
            total_relevant_results=search_result.total_relevant_results,
            has_more_relevant=search_result.has_more_relevant,
            max_results=search_result.max_results,
        )
