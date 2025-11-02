from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from api.dependencies import get_session, get_settings
from api.api_model import IngestRequest, RepoResponse
from services.ingest_service import IngestService
from services.repo_service import RepoService
from services.security_service import get_current_user
from data.data_model import User
from infrastructure.settings import Settings

router = APIRouter()


@router.post("/", response_model=RepoResponse)
def ingest(
    request: IngestRequest,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    if not request.url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="URL is required"
        )
    user_id = current_user.id
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized"
        )

    service = IngestService(db, settings)
    try:
        service.ingest_repo(request, user_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)
        )
    return RepoService(db).get_repo(request.url)
