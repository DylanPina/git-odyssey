from fastapi import APIRouter, Depends, HTTPException, status
from openai import AuthenticationError as OpenAIAuthenticationError
from openai import APIStatusError as OpenAIAPIStatusError
from api.api_model import IngestRequest, RepoResponse
from services.ingest_service import IngestService
from services.repo_service import RepoService
from api.dependencies import (
    get_current_user,
    get_ingest_service,
    get_repo_service,
)
from data.data_model import User

router = APIRouter()


@router.post("", response_model=RepoResponse)
async def ingest(
    request: IngestRequest,
    current_user: User = Depends(get_current_user),
    ingest_service: IngestService = Depends(get_ingest_service),
    repo_service: RepoService = Depends(get_repo_service),
):
    if not request.repo_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Repository path is required"
        )
    user_id = current_user.id
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized"
        )

    try:
        normalized_repo_path = await ingest_service.ingest_repo(request, user_id)
        result = repo_service.get_repo(normalized_repo_path)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Repository not found",
            )
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except HTTPException:
        raise
    except (OpenAIAuthenticationError, OpenAIAPIStatusError):
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)
        )
