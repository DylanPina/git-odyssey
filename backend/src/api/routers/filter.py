from fastapi import APIRouter, Depends
from services.filter_service import FilterService
from api.api_model import FilterRequest, FilterResponse
from api.dependencies import get_filter_service


router = APIRouter()


@router.post("", response_model=FilterResponse)
def filter_commits(
    request: FilterRequest, filter_service: FilterService = Depends(get_filter_service)
) -> FilterResponse:
    return filter_service.filter(request)
