from fastapi import APIRouter, Depends
from services.filter_service import FilterService
from api.api_model import FilterRequest, FilterResponse
from sqlalchemy.orm import Session
from infrastructure.db import get_session


router = APIRouter()


@router.post("/", response_model=FilterResponse)
def filter_commits(
    request: FilterRequest, db: Session = Depends(get_session)
) -> FilterResponse:
    service = FilterService(db)
    return service.filter(request)
