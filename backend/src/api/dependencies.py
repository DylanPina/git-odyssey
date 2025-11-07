from typing import Generator
from sqlalchemy.orm import Session
import infrastructure.db as db
from infrastructure.settings import Settings
from functools import lru_cache
from core.embedder import GeminiEmbedder, OpenAIEmbedder
from core.ai import AIEngine
from core.writer import Writer
from core.retriever import Retriever
from services.chat_service import ChatService
from services.summarize_service import SummarizeService
from services.ingest_service import IngestService
from services.repo_service import RepoService
from services.filter_service import FilterService
from fastapi import Request, Depends, HTTPException
from data.schema import SQLUser
from data.adapter import DatabaseAdapter
from data.data_model import User
import jwt
import time
import httpx


# Infrastructure


def get_session() -> Generator[Session, None, None]:
    with db.SessionLocal() as session:
        yield session


@lru_cache(maxsize=1)
def get_db_adapter() -> DatabaseAdapter:
    return DatabaseAdapter()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


# Security


def get_current_user(
    request: Request,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    db_adapter: DatabaseAdapter = Depends(get_db_adapter),
) -> User:
    print("Cookies: ", request.cookies)
    token = request.cookies.get("session_token")
    print("Token: ", token)
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        print("Payload: ", payload)
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = session.query(SQLUser).filter(SQLUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return db_adapter.parse_sql_user(user)


async def get_installation_token(
    current_user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> str:
    """FastAPI dependency to get GitHub installation access token for current user."""
    if not current_user.installation_id:
        raise HTTPException(
            status_code=400,
            detail="User has no GitHub App installation. Please install the app first.",
        )

    # Create App JWT for GitHub API authentication
    now = int(time.time())
    app_jwt_payload = {
        "iat": now - 60,
        "exp": now + (10 * 60) - 60,
        "iss": settings.github_app_id,
    }
    app_jwt = jwt.encode(
        app_jwt_payload, settings.github_app_private_key, algorithm="RS256")

    # Request installation access token from GitHub
    headers = {
        "Authorization": f"Bearer {app_jwt}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"https://api.github.com/app/installations/{current_user.installation_id}/access_tokens",
            headers=headers,
        )
        response.raise_for_status()
        return response.json()["token"]


# Core Components


@lru_cache(maxsize=1)
def get_gemini_embedder() -> GeminiEmbedder:
    return GeminiEmbedder()


@lru_cache(maxsize=1)
def get_openai_embedder() -> OpenAIEmbedder:
    return OpenAIEmbedder()


@lru_cache(maxsize=1)
def get_ai_engine() -> AIEngine:
    return AIEngine()


def get_writer(
    session: Session = Depends(get_session),
    embedder: OpenAIEmbedder = Depends(get_openai_embedder),
) -> Writer:
    return Writer(session, embedder)


def get_retriever(
    session: Session = Depends(get_session),
    embedder: OpenAIEmbedder = Depends(get_openai_embedder),
    db_adapter: DatabaseAdapter = Depends(get_db_adapter),
) -> Retriever:
    return Retriever(session, embedder, db_adapter)


# Core Services


def get_summarize_service(
    ai_engine: AIEngine = Depends(get_ai_engine),
    writer: Writer = Depends(get_writer),
    retriever: Retriever = Depends(get_retriever),
) -> SummarizeService:
    return SummarizeService(ai_engine, writer, retriever)


def get_ingest_service(
    session: Session = Depends(get_session),
    embedder: OpenAIEmbedder = Depends(get_openai_embedder),
    settings: Settings = Depends(get_settings),
) -> IngestService:
    return IngestService(session, embedder, settings)


def get_repo_service(
    session: Session = Depends(get_session),
    db_adapter: DatabaseAdapter = Depends(get_db_adapter),
) -> RepoService:
    return RepoService(session, db_adapter)


def get_chat_service(
    ai_engine: AIEngine = Depends(get_ai_engine),
    retriever: Retriever = Depends(get_retriever),
) -> ChatService:
    return ChatService(ai_engine, retriever)


def get_filter_service(
    embedder: OpenAIEmbedder = Depends(get_openai_embedder),
    retriever: Retriever = Depends(get_retriever),
) -> FilterService:
    return FilterService(embedder, retriever)
