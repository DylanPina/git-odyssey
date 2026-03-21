from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session

from api.api_model import AIRuntimeValidationRequest
from api.dependencies import get_session, get_settings
from infrastructure.ai_clients import HTTPProviderRegistry
from infrastructure.ai_runtime import (
    compute_embedding_fingerprint,
    describe_capability,
    load_ai_runtime_config,
    load_ai_secret_values,
)
from infrastructure.errors import AIConfigurationError, AIError
from infrastructure.settings import Settings
from data.schema import SQLEmbeddingProfile, SQLRepo

router = APIRouter()


def _get_active_embedding_fingerprint(config) -> str | None:
    if config is None or config.capabilities.embeddings is None:
        return None

    binding = config.capabilities.embeddings
    profile = config.get_profile(binding.provider_profile_id)
    return compute_embedding_fingerprint(
        provider_type=profile.provider_type,
        base_url=profile.base_url or "",
        model_id=binding.model_id,
    )


def _has_reindex_required_repos(session: Session, config) -> bool:
    active_fingerprint = _get_active_embedding_fingerprint(config)
    if active_fingerprint is None:
        return False

    return (
        session.query(SQLRepo.path)
        .outerjoin(SQLRepo.embedding_profile)
        .filter(
            or_(
                SQLRepo.embedding_profile_id.is_(None),
                SQLEmbeddingProfile.fingerprint != active_fingerprint,
            )
        )
        .first()
        is not None
    )


@router.get("/health")
async def desktop_health(
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    runtime_error = None
    config = None
    secret_values: dict[str, str] = {}

    try:
        config = load_ai_runtime_config(settings)
        secret_values = load_ai_secret_values(settings)
    except AIConfigurationError as exc:
        runtime_error = str(exc)

    text_status = describe_capability(config, secret_values, "text_generation")
    embeddings_status = describe_capability(config, secret_values, "embeddings")
    embeddings_status["reindex_required"] = _has_reindex_required_repos(session, config)

    if runtime_error:
        text_status["message"] = runtime_error
        embeddings_status["message"] = runtime_error

    return {
        "mode": "desktop",
        "authentication": {
            "desktop_backend_reachable": True,
            "desktop_user_available": True,
        },
        "ai": {
            "text_generation": text_status,
            "embeddings": embeddings_status,
        },
        "desktop_user": {
            "id": settings.desktop_user_id,
            "username": settings.desktop_user_username,
            "email": settings.desktop_user_email,
        },
    }


@router.post("/validate-ai-config")
async def validate_ai_config(
    request: AIRuntimeValidationRequest,
    session: Session = Depends(get_session),
):
    config = request.config
    secret_values = request.secret_values
    registry = HTTPProviderRegistry(config=config, secret_values=secret_values)

    text_status = describe_capability(config, secret_values, "text_generation")
    embeddings_status = describe_capability(config, secret_values, "embeddings")
    embeddings_status["reindex_required"] = _has_reindex_required_repos(session, config)

    text_binding = config.capabilities.text_generation
    if text_status["ready"]:
        try:
            registry.get_text_client(text_binding.provider_profile_id).generate(
                model=text_binding.model_id,
                instructions="You are GitOdyssey's AI endpoint validator.",
                input_text="Reply with READY.",
                temperature=text_binding.temperature,
            )
            text_status["message"] = "Validated successfully."
        except AIError as exc:
            text_status["ready"] = False
            text_status["message"] = str(exc)

    embeddings_binding = config.capabilities.embeddings
    if embeddings_binding is not None and embeddings_status["ready"]:
        try:
            result = registry.get_embedding_client(
                embeddings_binding.provider_profile_id
            ).embed(
                model=embeddings_binding.model_id,
                inputs=["GitOdyssey semantic search readiness probe"],
            )
            if result.dimensions is None:
                embeddings_status["message"] = "Validated successfully."
            else:
                embeddings_status["message"] = (
                    f"Validated successfully (dimension {result.dimensions})."
                )
        except AIError as exc:
            embeddings_status["ready"] = False
            embeddings_status["message"] = str(exc)

    return {
        "text_generation": text_status,
        "embeddings": embeddings_status,
    }
