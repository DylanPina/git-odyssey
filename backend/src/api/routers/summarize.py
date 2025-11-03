from fastapi import APIRouter, Depends
from api.dependencies import get_summarize_service
from services.summarize_service import SummarizeService


router = APIRouter()


@router.get("/commit/{sha}")
def summarize_commit(
    sha: str, summarize_service: SummarizeService = Depends(get_summarize_service)
) -> str:
    return summarize_service.summarize_commit(sha)


@router.get("/file_change/{id}")
def summarize_file_change(
    id: int, summarize_service: SummarizeService = Depends(get_summarize_service)
) -> str:
    return summarize_service.summarize_file_change(id)


@router.get("/hunk/{id}")
def summarize_hunk(
    id: int, summarize_service: SummarizeService = Depends(get_summarize_service)
) -> str:
    return summarize_service.summarize_hunk(id)
