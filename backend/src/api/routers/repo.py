from fastapi import APIRouter, Depends, HTTPException

from api.api_model import CommitResponse, CommitsResponse, IngestRequest, RepoResponse
from api.dependencies import get_current_user, get_ingest_service, get_repo_service
from data.data_model import User
from services.ingest_service import IngestService
from services.repo_service import RepoService

DEFAULT_MAX_COMMITS = 50
DEFAULT_CONTEXT_LINES = 3

router = APIRouter()


async def ensure_fresh_repo_index(
    repo_path: str,
    current_user: User,
    ingest_service: IngestService,
    repo_service: RepoService,
    max_commits: int = DEFAULT_MAX_COMMITS,
    context_lines: int = DEFAULT_CONTEXT_LINES,
) -> str:
    normalized_repo_path = ingest_service.resolve_repo_path(repo_path)
    if not repo_service.has_repo(normalized_repo_path):
        await ingest_service.ingest_repo(
            IngestRequest(
                repo_path=normalized_repo_path,
                max_commits=max_commits,
                context_lines=context_lines,
                force=False,
            ),
            current_user.id,
        )
    elif ingest_service.should_reindex(normalized_repo_path):
        await ingest_service.ingest_repo(
            IngestRequest(
                repo_path=normalized_repo_path,
                max_commits=max_commits,
                context_lines=context_lines,
                force=True,
            ),
            current_user.id,
        )

    return normalized_repo_path


@router.get("", response_model=RepoResponse)
async def get_repo(
    repo_path: str,
    max_commits: int = DEFAULT_MAX_COMMITS,
    context_lines: int = DEFAULT_CONTEXT_LINES,
    current_user: User = Depends(get_current_user),
    ingest_service: IngestService = Depends(get_ingest_service),
    repo_service: RepoService = Depends(get_repo_service),
):
    try:
        normalized_repo_path = await ensure_fresh_repo_index(
            repo_path=repo_path,
            current_user=current_user,
            ingest_service=ingest_service,
            repo_service=repo_service,
            max_commits=max_commits,
            context_lines=context_lines,
        )
        result = repo_service.get_repo(normalized_repo_path)
        if result is None:
            raise HTTPException(status_code=404, detail="Repository not found")
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/commits", response_model=CommitsResponse)
async def get_commits(
    repo_path: str,
    max_commits: int = DEFAULT_MAX_COMMITS,
    context_lines: int = DEFAULT_CONTEXT_LINES,
    current_user: User = Depends(get_current_user),
    ingest_service: IngestService = Depends(get_ingest_service),
    repo_service: RepoService = Depends(get_repo_service),
):
    try:
        normalized_repo_path = await ensure_fresh_repo_index(
            repo_path=repo_path,
            current_user=current_user,
            ingest_service=ingest_service,
            repo_service=repo_service,
            max_commits=max_commits,
            context_lines=context_lines,
        )
        return repo_service.get_commits(normalized_repo_path)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/commit/{commit_sha}", response_model=CommitResponse)
async def get_commit(
    repo_path: str,
    commit_sha: str,
    max_commits: int = DEFAULT_MAX_COMMITS,
    context_lines: int = DEFAULT_CONTEXT_LINES,
    current_user: User = Depends(get_current_user),
    ingest_service: IngestService = Depends(get_ingest_service),
    repo_service: RepoService = Depends(get_repo_service),
):
    try:
        normalized_repo_path = await ensure_fresh_repo_index(
            repo_path=repo_path,
            current_user=current_user,
            ingest_service=ingest_service,
            repo_service=repo_service,
            max_commits=max_commits,
            context_lines=context_lines,
        )
        return repo_service.get_commit(normalized_repo_path, commit_sha)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
