from fastapi import APIRouter, Depends, HTTPException, status
from api.api_model import IngestRequest, RepoResponse
from services.ingest_service import IngestService
from services.repo_service import RepoService
from api.dependencies import (
    get_current_user,
    get_ingest_service,
    get_repo_service,
    get_installation_token,
)
from data.data_model import User

router = APIRouter()


@router.post("", response_model=RepoResponse)
async def ingest(
    request: IngestRequest,
    current_user: User = Depends(get_current_user),
    installation_token: str = Depends(get_installation_token),
    ingest_service: IngestService = Depends(get_ingest_service),
    repo_service: RepoService = Depends(get_repo_service),
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

    try:
        await ingest_service.ingest_repo(request, user_id, installation_token)
        return repo_service.get_repo(request.url)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)
        )
