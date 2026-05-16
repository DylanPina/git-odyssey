from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from api.api_model import (
    AIRuntimeValidationRequest,
    GoogleDeploymentRequest,
    GoogleDeploymentResponse,
    GoogleModelGardenEntryResponse,
    GoogleModelGardenListResponse,
    GoogleTargetValidationRequest,
    GoogleTargetValidationResponse,
)
from api.dependencies import get_session, get_settings
from infrastructure.ai_clients import GoogleVertexRegistry, check_adc_status
from infrastructure.ai_runtime import (
    AST_ENABLED_LANGUAGES,
    AST_SCHEMA_VERSION,
    DOCUMENT_SCHEMA_VERSION,
    AIRuntimeConfig,
    CapabilityName,
    GoogleAITarget,
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

    target = config.capabilities.embeddings
    return compute_embedding_fingerprint(
        target_kind=target.target_kind,
        resource_name=target.resource_name,
        project_id=config.google_project_id or "",
        location=target.location or config.google_location,
        adapter_family=target.adapter_family,
        observed_dimension=target.embedding_output_dimension,
        document_schema_version=DOCUMENT_SCHEMA_VERSION,
        ast_schema_version=AST_SCHEMA_VERSION,
        ast_enabled_languages=AST_ENABLED_LANGUAGES,
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
    review_status = describe_capability(config, secret_values, "review")
    embeddings_status["reindex_required"] = _has_reindex_required_repos(session, config)
    adc_status = check_adc_status()

    if runtime_error:
        text_status["message"] = runtime_error
        embeddings_status["message"] = runtime_error
        review_status["message"] = runtime_error

    return {
        "mode": "desktop",
        "authentication": {
            "desktop_backend_reachable": True,
            "desktop_user_available": True,
        },
        "ai": {
            "google": {
                "project_id": config.google_project_id if config else None,
                "location": config.google_location if config else None,
                "adc_ready": adc_status.ready,
                "adc_project_id": adc_status.project_id,
                "message": adc_status.message,
            },
            "text_generation": text_status,
            "embeddings": embeddings_status,
            "review": review_status,
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
    registry = GoogleVertexRegistry(config=config) if config.google_project_id else None

    text_status = describe_capability(config, secret_values, "text_generation")
    embeddings_status = describe_capability(config, secret_values, "embeddings")
    review_status = describe_capability(config, secret_values, "review")
    embeddings_status["reindex_required"] = _has_reindex_required_repos(session, config)

    for capability_name, status in (
        ("text_generation", text_status),
        ("embeddings", embeddings_status),
        ("review", review_status),
    ):
        target = getattr(config.capabilities, capability_name)
        if target is None or not status["ready"] or registry is None:
            continue
        try:
            validation = registry.validate_target(
                capability=capability_name,
                target=target,
            )
            status["ready"] = bool(validation["ready"])
            status["message"] = validation.get("message")
            if validation.get("embedding_output_dimension"):
                status["embedding_output_dimension"] = validation[
                    "embedding_output_dimension"
                ]
        except AIError as exc:
            status["ready"] = False
            status["message"] = str(exc)

    return {
        "text_generation": text_status,
        "embeddings": embeddings_status,
        "review": review_status,
    }


def _registry_for_config(config: AIRuntimeConfig) -> GoogleVertexRegistry:
    if not config.google_project_id:
        raise HTTPException(
            status_code=400,
            detail="Google Cloud project ID is required.",
        )
    return GoogleVertexRegistry(config=config)


def _entry_response(entry) -> GoogleModelGardenEntryResponse:
    return GoogleModelGardenEntryResponse(
        id=entry.id,
        resource_name=entry.resource_name,
        display_name=entry.display_name,
        publisher=entry.publisher,
        version=entry.version,
        location=entry.location,
        target_kind=entry.target_kind,
        source=entry.source,
        capabilities=entry.capabilities,
        adapter_family=entry.adapter_family,
        deployable=entry.deployable,
        description=entry.description,
    )


@router.get("/google/model-garden", response_model=GoogleModelGardenListResponse)
async def list_google_model_garden(
    google_project_id: str,
    google_location: str = "us-central1",
):
    config = AIRuntimeConfig(
        schema_version=2,
        google_project_id=google_project_id,
        google_location=google_location,
    )
    try:
        items = _registry_for_config(config).list_model_garden()
    except AIError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return GoogleModelGardenListResponse(items=[_entry_response(item) for item in items])


@router.post(
    "/google/validate-target",
    response_model=GoogleTargetValidationResponse,
)
async def validate_google_target(request: GoogleTargetValidationRequest):
    try:
        validation = _registry_for_config(request.config).validate_target(
            capability=request.capability,
            target=request.target,
        )
    except AIError as exc:
        return GoogleTargetValidationResponse(
            ready=False,
            capability=request.capability,
            target=request.target,
            message=str(exc),
        )

    target = request.target
    embedding_dimension = validation.get("embedding_output_dimension")
    if request.capability == "embeddings" and embedding_dimension:
        target = target.model_copy(
            update={"embedding_output_dimension": embedding_dimension}
        )

    return GoogleTargetValidationResponse(
        ready=True,
        capability=request.capability,
        target=target,
        message=validation.get("message"),
        embedding_output_dimension=embedding_dimension,
    )


@router.post("/google/deploy", response_model=GoogleDeploymentResponse)
async def deploy_google_model(request: GoogleDeploymentRequest):
    if not request.accepted_terms or not request.accepted_billing_notice:
        raise HTTPException(
            status_code=400,
            detail="Model Garden deployment requires terms and billing confirmation.",
        )

    registry = _registry_for_config(request.config)
    deployment = registry.get_deployment_service()
    deploy_request = deployment.construct_deployment_request(
        model_resource_name=request.model_resource_name,
        endpoint_resource_name=request.endpoint_resource_name,
        deployed_model_display_name=request.deployed_model_display_name,
        machine_type=request.machine_type,
        accelerator_type=request.accelerator_type,
        accelerator_count=request.accelerator_count,
        min_replica_count=request.min_replica_count,
        max_replica_count=request.max_replica_count,
    )
    try:
        response = deployment.deploy(deploy_request)
    except AIError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return GoogleDeploymentResponse(
        operation_name=response.get("name"),
        endpoint_resource_name=request.endpoint_resource_name,
        request=deploy_request,
        response=response,
    )


@router.get("/google/operations")
async def get_google_operation(
    google_project_id: str,
    google_location: str,
    operation_name: str,
):
    config = AIRuntimeConfig(
        schema_version=2,
        google_project_id=google_project_id,
        google_location=google_location,
    )
    try:
        return (
            _registry_for_config(config)
            .get_deployment_service()
            .poll_operation(operation_name)
        )
    except AIError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
