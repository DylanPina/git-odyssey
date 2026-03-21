from datetime import datetime
from functools import lru_cache
from typing import Generator

from fastapi import Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import infrastructure.db as db
from core.ai import AIEngine
from core.embedder import EmbeddingEngine
from core.retriever import Retriever
from core.writer import Writer
from data.adapter import DatabaseAdapter
from data.data_model import User
from data.schema import SQLUser
from infrastructure.ai_clients import (
    EmbeddingClient,
    HTTPProviderRegistry,
    ProviderRegistry,
    ResponsesTextClient,
)
from infrastructure.ai_runtime import (
    AIRuntimeConfig,
    OPENAI_DEFAULT_BASE_URL,
    compute_embedding_fingerprint,
    load_ai_runtime_config,
    load_ai_secret_values,
)
from infrastructure.errors import MissingConfigurationError
from infrastructure.settings import Settings
from services.chat_service import ChatService
from services.filter_service import FilterService
from services.ingest_service import IngestService
from services.repo_service import RepoService
from services.summarize_service import SummarizeService


def get_session() -> Generator[Session, None, None]:
    with db.SessionLocal() as session:
        yield session


@lru_cache(maxsize=1)
def get_db_adapter() -> DatabaseAdapter:
    return DatabaseAdapter()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


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


@lru_cache(maxsize=1)
def get_ai_runtime_config() -> AIRuntimeConfig:
    return load_ai_runtime_config(get_settings())


@lru_cache(maxsize=1)
def get_ai_secret_values() -> dict[str, str]:
    return load_ai_secret_values(get_settings())


@lru_cache(maxsize=1)
def get_provider_registry() -> ProviderRegistry:
    return HTTPProviderRegistry(
        config=get_ai_runtime_config(),
        secret_values=get_ai_secret_values(),
    )


def _require_profile_secret(profile) -> None:
    if profile.auth_mode == "none":
        return

    secret_value = get_ai_secret_values().get(profile.api_key_secret_ref or "")
    if secret_value:
        return

    raise MissingConfigurationError(
        f"Provider profile '{profile.label}' is missing its API key. Save the provider secret in desktop settings before using this capability."
    )


@lru_cache(maxsize=1)
def get_text_client() -> ResponsesTextClient:
    config = get_ai_runtime_config()
    binding = config.capabilities.text_generation
    profile = config.get_profile(binding.provider_profile_id)
    _require_profile_secret(profile)
    return get_provider_registry().get_text_client(profile.id)


@lru_cache(maxsize=1)
def get_embedding_client() -> EmbeddingClient | None:
    config = get_ai_runtime_config()
    binding = config.capabilities.embeddings
    if binding is None:
        return None

    profile = config.get_profile(binding.provider_profile_id)
    _require_profile_secret(profile)
    return get_provider_registry().get_embedding_client(profile.id)


@lru_cache(maxsize=1)
def get_ai_engine() -> AIEngine:
    binding = get_ai_runtime_config().capabilities.text_generation
    return AIEngine(
        client=get_text_client(),
        model=binding.model_id,
        temperature=binding.temperature,
    )


@lru_cache(maxsize=1)
def get_embedding_engine() -> EmbeddingEngine | None:
    config = get_ai_runtime_config()
    binding = config.capabilities.embeddings
    if binding is None:
        return None

    profile = config.get_profile(binding.provider_profile_id)
    client = get_embedding_client()
    if client is None:
        return None

    return EmbeddingEngine(
        client=client,
        model=binding.model_id,
        provider_type=profile.provider_type,
        base_url=profile.base_url or OPENAI_DEFAULT_BASE_URL,
        profile_fingerprint=compute_embedding_fingerprint(
            provider_type=profile.provider_type,
            base_url=profile.base_url or OPENAI_DEFAULT_BASE_URL,
            model_id=binding.model_id,
        ),
    )


def get_writer(
    session: Session = Depends(get_session),
    embedder: EmbeddingEngine | None = Depends(get_embedding_engine),
) -> Writer:
    return Writer(session, embedder)


def get_retriever(
    session: Session = Depends(get_session),
    embedder: EmbeddingEngine | None = Depends(get_embedding_engine),
    db_adapter: DatabaseAdapter = Depends(get_db_adapter),
) -> Retriever:
    return Retriever(session, embedder, db_adapter)


def get_summarize_service(
    ai_engine: AIEngine = Depends(get_ai_engine),
    writer: Writer = Depends(get_writer),
    retriever: Retriever = Depends(get_retriever),
) -> SummarizeService:
    return SummarizeService(ai_engine, writer, retriever)


def get_ingest_service(
    session: Session = Depends(get_session),
    embedder: EmbeddingEngine | None = Depends(get_embedding_engine),
) -> IngestService:
    return IngestService(session, embedder)


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
    retriever: Retriever = Depends(get_retriever),
) -> FilterService:
    return FilterService(retriever)
