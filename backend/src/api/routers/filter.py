from fastapi import APIRouter
from services.filter_service import FilterService
from api.api_model import FilterRequest, FilterResponse


router = APIRouter()


@router.post("/", response_model=FilterResponse)
def filter_commits(request: FilterRequest) -> FilterResponse:
    service = FilterService()
    return service.filter(request)
