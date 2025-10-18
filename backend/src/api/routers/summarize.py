from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from infrastructure.db import get_session
from services.summarize_service import SummarizeService
from core.ai import AIEngine
from core.embedder import OpenAIEmbedder
from data.database import Database


router = APIRouter()


@router.get("/commit/{sha}")
def summarize_commit(sha: str, db: Session = Depends(get_session)) -> str:
    service = SummarizeService(Database(), OpenAIEmbedder(), AIEngine())
    return service.summarize_commit(sha)


@router.get("/file_change/{id}")
def summarize_file_change(id: int, db: Session = Depends(get_session)) -> str:
    service = SummarizeService(Database(), OpenAIEmbedder(), AIEngine())
    return service.summarize_file_change(id)


@router.get("/hunk/{id}")
def summarize_hunk(id: int, db: Session = Depends(get_session)) -> str:
    service = SummarizeService(Database(), OpenAIEmbedder(), AIEngine())
    return service.summarize_hunk(id)
