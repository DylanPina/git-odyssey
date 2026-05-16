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
    GoogleAIRegistry,
    GoogleVertexRegistry,
    TextGenerationClient,
)
from infrastructure.ai_runtime import (
    AIRuntimeConfig,
    AST_ENABLED_LANGUAGES,
    AST_SCHEMA_VERSION,
    DOCUMENT_SCHEMA_VERSION,
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
from services.review_service import ReviewCompareService, ReviewGenerationService
from services.review_session_service import ReviewSessionPersistenceService
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
def get_provider_registry() -> GoogleAIRegistry:
    config = get_ai_runtime_config()
    if not config.google_project_id:
        raise MissingConfigurationError(
            "Google Cloud project ID is missing. Complete Google AI setup before using this capability."
        )
    return GoogleVertexRegistry(
        config=get_ai_runtime_config(),
    )


def _require_target(capability_name: str):
    config = get_ai_runtime_config()
    target = getattr(config.capabilities, capability_name)
    if target is not None:
        if config.google_project_id:
            return target
        raise MissingConfigurationError(
            "Google Cloud project ID is missing. Complete Google AI setup before using this capability."
        )
    raise MissingConfigurationError(
        f"No validated Google AI target is configured for {capability_name}."
    )


def _require_embedding_dimension(target) -> int | None:
    if target.embedding_output_dimension:
        return target.embedding_output_dimension
    return None


def _embedding_fingerprint_for_target(target) -> str:
    config = get_ai_runtime_config()
    observed_dimension = _require_embedding_dimension(target)
    return compute_embedding_fingerprint(
        target_kind=target.target_kind,
        resource_name=target.resource_name,
        project_id=config.google_project_id or "",
        location=target.location or config.google_location,
        adapter_family=target.adapter_family,
        observed_dimension=observed_dimension,
        document_schema_version=DOCUMENT_SCHEMA_VERSION,
        ast_schema_version=AST_SCHEMA_VERSION,
        ast_enabled_languages=AST_ENABLED_LANGUAGES,
    )


def _noop_secret_check() -> None:
    if get_ai_secret_values() is not None:
        return


@lru_cache(maxsize=1)
def get_text_client() -> TextGenerationClient:
    _require_target("text_generation")
    return get_provider_registry().get_text_client()


@lru_cache(maxsize=1)
def get_embedding_client() -> EmbeddingClient | None:
    if get_ai_runtime_config().capabilities.embeddings is None:
        return None
    _require_target("embeddings")
    return get_provider_registry().get_embedding_client()


@lru_cache(maxsize=1)
def get_ai_engine() -> AIEngine:
    target = _require_target("text_generation")
    return AIEngine(
        client=get_text_client(),
        target=target,
        temperature=0.2,
    )


@lru_cache(maxsize=1)
def get_review_ai_engine() -> AIEngine:
    target = _require_target("review")
    return AIEngine(
        client=get_provider_registry().get_text_client(),
        target=target,
        temperature=0.0,
    )


@lru_cache(maxsize=1)
def get_embedding_engine() -> EmbeddingEngine | None:
    config = get_ai_runtime_config()
    target = config.capabilities.embeddings
    if target is None:
        return None
    client = get_embedding_client()
    if client is None:
        return None

    return EmbeddingEngine(
        client=client,
        target=target,
        profile_fingerprint=_embedding_fingerprint_for_target(target),
        google_project_id=config.google_project_id,
        google_location=target.location or config.google_location,
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
    settings: Settings = Depends(get_settings),
) -> IngestService:
    return IngestService(session, embedder, flush_size=settings.ingest_flush_size)


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


def get_review_compare_service() -> ReviewCompareService:
    return ReviewCompareService()


def get_review_generation_service(
    compare_service: ReviewCompareService = Depends(get_review_compare_service),
    ai_engine: AIEngine = Depends(get_review_ai_engine),
) -> ReviewGenerationService:
    return ReviewGenerationService(compare_service=compare_service, ai_engine=ai_engine)


def get_review_session_persistence_service(
    session: Session = Depends(get_session),
    compare_service: ReviewCompareService = Depends(get_review_compare_service),
) -> ReviewSessionPersistenceService:
    return ReviewSessionPersistenceService(
        session=session,
        compare_service=compare_service,
    )
