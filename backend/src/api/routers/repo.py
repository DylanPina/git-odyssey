from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from infrastructure.db import get_session
from services.repo_service import RepoService
from api.api_model import RepoResponse, CommitResponse, CommitsResponse


router = APIRouter()


@router.get("/{repo_owner}/{repo_name}", response_model=RepoResponse)
def get_repo(repo_owner: str, repo_name: str, db: Session = Depends(get_session)):
  try:
    result = RepoService(db).get_repo(f"https://github.com/{repo_owner}/{repo_name}")
    if not result.branches and not result.commits:
      raise HTTPException(status_code=404, detail="Repository not found")
    return result
  except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))

@router.get("/{repo_owner}/{repo_name}/commits", response_model=CommitsResponse)
def get_commits(repo_owner: str, repo_name: str, db: Session = Depends(get_session)):
  try:
    return RepoService(db).get_commits(f"https://github.com/{repo_owner}/{repo_name}")
  except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))

@router.get("/{repo_owner}/{repo_name}/commit/{commit_sha}", response_model=CommitResponse)
def get_commit(repo_owner: str, repo_name: str, commit_sha: str, db: Session = Depends(get_session)):
  try:
    return RepoService(db).get_commit(f"https://github.com/{repo_owner}/{repo_name}", commit_sha)
  except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))