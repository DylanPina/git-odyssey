import hashlib
import json
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError, model_validator

from infrastructure.errors import AIConfigurationError

SCHEMA_VERSION = 2
DEFAULT_GOOGLE_LOCATION = "us-central1"
DOCUMENT_SCHEMA_VERSION = 2
AST_SCHEMA_VERSION = 1
AST_ENABLED_LANGUAGES = ("python", "typescript", "tsx")

TargetKind = Literal["managed_model", "vertex_endpoint"]
CapabilityName = Literal["text_generation", "embeddings", "review"]
ModelSource = Literal[
    "managed_api_model",
    "deployable_google_model",
    "deployable_partner_model",
    "vertex_endpoint",
    "manual_resource_name",
]


class GoogleAITarget(BaseModel):
    target_kind: TargetKind
    resource_name: str
    display_name: str
    publisher: str | None = None
    version: str | None = None
    location: str | None = None
    capabilities: list[CapabilityName] = Field(default_factory=list)
    adapter_family: str | None = None
    embedding_output_dimension: int | None = None
    source: ModelSource | None = None

    @model_validator(mode="after")
    def validate_target(self) -> "GoogleAITarget":
        self.resource_name = self.resource_name.strip()
        self.display_name = self.display_name.strip() or self.resource_name
        self.publisher = (self.publisher or "").strip() or None
        self.version = (self.version or "").strip() or None
        self.location = (self.location or "").strip() or None
        self.adapter_family = (self.adapter_family or "").strip() or None

        if not self.resource_name:
            raise AIConfigurationError("Google AI target resource_name is required.")
        if self.target_kind == "managed_model" and "endpoints/" in self.resource_name:
            raise AIConfigurationError(
                "Managed model targets must use a publisher model resource name."
            )
        if self.target_kind == "vertex_endpoint" and "endpoints/" not in self.resource_name:
            raise AIConfigurationError(
                "Endpoint targets must use a full endpoint resource name."
            )
        if self.embedding_output_dimension is not None and self.embedding_output_dimension < 1:
            raise AIConfigurationError(
                "embedding_output_dimension must be a positive integer."
            )
        return self

    def with_location(self, fallback_location: str) -> "GoogleAITarget":
        if self.location:
            return self
        return self.model_copy(update={"location": fallback_location})

    def supports(self, capability_name: CapabilityName) -> bool:
        return capability_name in set(self.capabilities)


class CapabilityBindings(BaseModel):
    text_generation: GoogleAITarget | None = None
    embeddings: GoogleAITarget | None = None
    review: GoogleAITarget | None = None


class AIRuntimeConfig(BaseModel):
    schema_version: int = SCHEMA_VERSION
    google_project_id: str | None = None
    google_location: str = DEFAULT_GOOGLE_LOCATION
    capabilities: CapabilityBindings = Field(default_factory=CapabilityBindings)

    @model_validator(mode="after")
    def validate_runtime(self) -> "AIRuntimeConfig":
        if self.schema_version != SCHEMA_VERSION:
            raise AIConfigurationError(
                f"Unsupported AI runtime schema version {self.schema_version}."
            )

        self.google_project_id = (self.google_project_id or "").strip() or None
        self.google_location = (self.google_location or "").strip() or DEFAULT_GOOGLE_LOCATION

        for capability_name in ("text_generation", "embeddings", "review"):
            target = getattr(self.capabilities, capability_name)
            if target is None:
                continue
            if not self.google_project_id:
                raise AIConfigurationError(
                    "Google Cloud project ID is required before saving model targets."
                )
            target = target.with_location(self.google_location)
            if not target.supports(capability_name):
                raise AIConfigurationError(
                    f"Target '{target.display_name}' does not declare support for {capability_name}."
                )
            setattr(self.capabilities, capability_name, target)

        return self


def build_empty_google_ai_runtime_config(
    *,
    project_id: str | None = None,
    location: str | None = None,
) -> AIRuntimeConfig:
    return AIRuntimeConfig(
        schema_version=SCHEMA_VERSION,
        google_project_id=(project_id or "").strip() or None,
        google_location=(location or DEFAULT_GOOGLE_LOCATION).strip()
        or DEFAULT_GOOGLE_LOCATION,
        capabilities=CapabilityBindings(),
    )


def _looks_like_legacy_openai_config(payload: dict[str, Any]) -> bool:
    if payload.get("schema_version") == 1:
        return True
    return "profiles" in payload or "provider_profile_id" in json.dumps(payload)


def migrate_ai_runtime_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return build_empty_google_ai_runtime_config().model_dump(mode="json")

    if _looks_like_legacy_openai_config(payload):
        return build_empty_google_ai_runtime_config(
            project_id=payload.get("google_project_id"),
            location=payload.get("google_location"),
        ).model_dump(mode="json")

    if not payload:
        return build_empty_google_ai_runtime_config().model_dump(mode="json")

    return payload


def load_ai_runtime_config(settings: Any) -> AIRuntimeConfig:
    raw = getattr(settings, "ai_runtime_config_json", None)
    if not raw:
        return build_empty_google_ai_runtime_config()

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AIConfigurationError(
            f"AI runtime config is not valid JSON: {exc.msg}"
        ) from exc

    try:
        return AIRuntimeConfig.model_validate(migrate_ai_runtime_payload(payload))
    except ValidationError as exc:
        raise AIConfigurationError(f"AI runtime config is invalid: {exc}") from exc


def load_ai_secret_values(settings: Any) -> dict[str, str]:
    raw = getattr(settings, "ai_secret_values_json", None)
    if not raw:
        return {}

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AIConfigurationError(
            f"AI secret values are not valid JSON: {exc.msg}"
        ) from exc

    if not isinstance(payload, dict):
        raise AIConfigurationError("AI secret values JSON must be an object.")

    return {
        key: value
        for key, value in payload.items()
        if isinstance(key, str) and isinstance(value, str) and value
    }


def compute_embedding_fingerprint(
    *,
    target_kind: str,
    resource_name: str,
    project_id: str,
    location: str,
    adapter_family: str | None,
    observed_dimension: int | None,
    document_schema_version: int = DOCUMENT_SCHEMA_VERSION,
    ast_schema_version: int = AST_SCHEMA_VERSION,
    ast_enabled_languages: tuple[str, ...] = AST_ENABLED_LANGUAGES,
) -> str:
    payload = json.dumps(
        {
            "target_kind": target_kind,
            "resource_name": resource_name.strip(),
            "project_id": project_id.strip(),
            "location": location.strip(),
            "adapter_family": (adapter_family or "").strip() or None,
            "observed_embedding_dimension": observed_dimension,
            "document_schema_version": document_schema_version,
            "ast_schema_version": ast_schema_version,
            "ast_enabled_languages": list(ast_enabled_languages),
        },
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def describe_capability(
    config: AIRuntimeConfig | None,
    _secret_values: dict[str, str],
    capability_name: CapabilityName,
) -> dict[str, Any]:
    if config is None:
        return {
            "configured": False,
            "ready": False,
            "target_kind": None,
            "resource_name": None,
            "display_name": None,
            "publisher": None,
            "version": None,
            "location": None,
            "adapter_family": None,
            "embedding_output_dimension": None,
            "message": "Google AI runtime configuration is unavailable.",
        }

    target = getattr(config.capabilities, capability_name)
    if target is None:
        return {
            "configured": False,
            "ready": False,
            "target_kind": None,
            "resource_name": None,
            "display_name": None,
            "publisher": None,
            "version": None,
            "location": config.google_location,
            "adapter_family": None,
            "embedding_output_dimension": None,
            "message": (
                "Semantic search is disabled."
                if capability_name == "embeddings"
                else "No Google AI target is configured for this capability."
            ),
        }

    has_project = bool(config.google_project_id)
    has_location = bool(target.location or config.google_location)
    ready = has_project and has_location
    return {
        "configured": True,
        "ready": ready,
        "target_kind": target.target_kind,
        "resource_name": target.resource_name,
        "display_name": target.display_name,
        "publisher": target.publisher,
        "version": target.version,
        "location": target.location or config.google_location,
        "adapter_family": target.adapter_family,
        "embedding_output_dimension": target.embedding_output_dimension,
        "message": None
        if ready
        else "Google Cloud project ID and Google AI location are required.",
    }
