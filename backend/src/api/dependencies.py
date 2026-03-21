from datetime import datetime
from typing import Generator
from functools import lru_cache
from fastapi import Depends
from openai import OpenAI
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

import infrastructure.db as db
from core.ai import AIEngine
from core.embedder import OpenAIEmbedder
from core.retriever import Retriever
from core.writer import Writer
from data.adapter import DatabaseAdapter
from data.data_model import User
from data.schema import SQLUser
from infrastructure.errors import MissingConfigurationError
from infrastructure.settings import Settings
from services.chat_service import ChatService
from services.filter_service import FilterService
from services.ingest_service import IngestService
from services.repo_service import RepoService
from services.summarize_service import SummarizeService


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
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    db_adapter: DatabaseAdapter = Depends(get_db_adapter),
) -> User:
    return get_or_create_desktop_user(
        session=session, settings=settings, db_adapter=db_adapter
    )


def get_or_create_desktop_user(
    session: Session,
    settings: Settings,
    db_adapter: DatabaseAdapter,
) -> User:
    user = (
        session.query(SQLUser)
        .filter(SQLUser.id == settings.desktop_user_id)
        .first()
    )

    if not user:
        now = datetime.now()
        user = SQLUser(
            id=settings.desktop_user_id,
            username=settings.desktop_user_username,
            email=settings.desktop_user_email,
            api_credits_remaining=100,
            created_at=now,
            updated_at=now,
        )
        session.add(user)
        try:
            session.commit()
            session.refresh(user)
        except IntegrityError:
            session.rollback()
            user = (
                session.query(SQLUser)
                .filter(SQLUser.id == settings.desktop_user_id)
                .first()
            )
            if not user:
                raise

    return db_adapter.parse_sql_user(user)

# Core Components


@lru_cache(maxsize=1)
def get_openai_client() -> OpenAI:
    settings = get_settings()
    if not settings.openai_api_key:
        raise MissingConfigurationError(
            "OpenAI API key is not configured. Save it in desktop settings before using AI features."
        )
    return OpenAI(api_key=settings.openai_api_key)


@lru_cache(maxsize=1)
def get_openai_embedder() -> OpenAIEmbedder:
    settings = get_settings()
    return OpenAIEmbedder(
        client=get_openai_client(),
        model=settings.openai_embedding_model,
    )


@lru_cache(maxsize=1)
def get_ai_engine() -> AIEngine:
    settings = get_settings()
    return AIEngine(
        client=get_openai_client(),
        model=settings.openai_text_model,
    )


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
