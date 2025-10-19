from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from infrastructure.db import get_session
from api.api_model import IngestRequest, RepoResponse
from services.ingest_service import IngestService
from services.repo_service import RepoService

router = APIRouter()


@router.post("/", response_model=RepoResponse)
def ingest(request: IngestRequest, db: Session = Depends(get_session)):
    if not request.url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="URL is required"
        )
    service = IngestService()
    try:
        service.ingest_repo(request)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)
        )
    return RepoService(db).get_repo(request.url)
