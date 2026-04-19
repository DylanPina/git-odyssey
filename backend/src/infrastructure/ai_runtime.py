import hashlib
import json
import ipaddress
from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, ValidationError, model_validator

from infrastructure.errors import AIConfigurationError

ProviderType = Literal["openai", "openai_compatible"]
AuthMode = Literal["bearer", "none"]

SCHEMA_VERSION = 1
OPENAI_DEFAULT_BASE_URL = "https://api.openai.com"
DEFAULT_TEXT_MODEL = "gpt-5.4-mini"
DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
DOCUMENT_SCHEMA_VERSION = 2
AST_SCHEMA_VERSION = 1
AST_ENABLED_LANGUAGES = ("python", "typescript", "tsx")


def normalize_base_url(base_url: str | None, provider_type: ProviderType) -> str:
    candidate = (base_url or "").strip()
    if provider_type == "openai":
        candidate = OPENAI_DEFAULT_BASE_URL
    if not candidate:
        return candidate
    return candidate.rstrip("/")


def _is_private_http_host(hostname: str | None) -> bool:
    if not hostname:
        return False

    hostname = hostname.strip().lower()
    if hostname in {"localhost", "127.0.0.1", "::1", "0.0.0.0"}:
        return True

    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        return False

    return (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_reserved
    )


def validate_provider_base_url(base_url: str, provider_type: ProviderType) -> str:
    normalized = normalize_base_url(base_url, provider_type)
    if not normalized:
        raise AIConfigurationError("Provider base URL is required.")

    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"}:
        raise AIConfigurationError(
            f"Unsupported provider URL scheme '{parsed.scheme or 'missing'}'."
        )

    if parsed.scheme == "http" and not _is_private_http_host(parsed.hostname):
        raise AIConfigurationError(
            "HTTP is allowed only for localhost or private-LAN AI endpoints."
        )

    if not parsed.netloc:
        raise AIConfigurationError("Provider base URL must include a host.")

    return normalized


ReasoningEffort = Literal["minimal", "low", "medium", "high", "xhigh"]


class ProviderProfileConfig(BaseModel):
    id: str
    provider_type: ProviderType
    label: str
    base_url: str | None = None
    auth_mode: AuthMode = "bearer"
    api_key_secret_ref: str | None = None
    supports_text_generation: bool = True
    supports_embeddings: bool = True

    @model_validator(mode="after")
    def validate_profile(self) -> "ProviderProfileConfig":
        self.base_url = normalize_base_url(self.base_url, self.provider_type)
        if not self.id.strip():
            raise AIConfigurationError("Provider profile ids must not be empty.")
        if not self.label.strip():
            raise AIConfigurationError("Provider profile labels must not be empty.")
        if not (self.supports_text_generation or self.supports_embeddings):
            raise AIConfigurationError(
                f"Provider profile '{self.id}' must support at least one capability."
            )

        if self.provider_type == "openai":
            self.base_url = OPENAI_DEFAULT_BASE_URL
            if self.auth_mode != "bearer":
                raise AIConfigurationError(
                    "The built-in OpenAI profile must use bearer authentication."
                )
            if not self.api_key_secret_ref:
                raise AIConfigurationError(
                    "The built-in OpenAI profile requires an API key secret reference."
                )
        else:
            if not self.base_url:
                raise AIConfigurationError(
                    f"Provider profile '{self.id}' requires a base URL."
                )
            self.base_url = validate_provider_base_url(
                self.base_url, self.provider_type
            )
            if self.auth_mode != "none" and not self.api_key_secret_ref:
                raise AIConfigurationError(
                    f"Provider profile '{self.id}' requires an API key unless auth_mode is 'none'."
                )

        return self


class TextGenerationBinding(BaseModel):
    provider_profile_id: str
    model_id: str
    temperature: float = 0.2
    reasoning_effort: ReasoningEffort | None = None


class EmbeddingsBinding(BaseModel):
    provider_profile_id: str
    model_id: str


class CapabilityBindings(BaseModel):
    text_generation: TextGenerationBinding
    embeddings: EmbeddingsBinding | None = None


class AIRuntimeConfig(BaseModel):
    schema_version: int = SCHEMA_VERSION
    profiles: list[ProviderProfileConfig] = Field(default_factory=list)
    capabilities: CapabilityBindings

    @model_validator(mode="after")
    def validate_runtime(self) -> "AIRuntimeConfig":
        if self.schema_version != SCHEMA_VERSION:
            raise AIConfigurationError(
                f"Unsupported AI runtime schema version {self.schema_version}."
            )

        profiles_by_id = {profile.id: profile for profile in self.profiles}
        if len(profiles_by_id) != len(self.profiles):
            raise AIConfigurationError("Provider profile ids must be unique.")

        if not self.capabilities.text_generation:
            raise AIConfigurationError("text_generation capability is required.")

        text_profile = profiles_by_id.get(
            self.capabilities.text_generation.provider_profile_id
        )
        if text_profile is None:
            raise AIConfigurationError(
                "text_generation references a missing provider profile."
            )
        if not text_profile.supports_text_generation:
            raise AIConfigurationError(
                f"Provider profile '{text_profile.id}' does not support text generation."
            )

        if self.capabilities.embeddings is not None:
            embedding_profile = profiles_by_id.get(
                self.capabilities.embeddings.provider_profile_id
            )
            if embedding_profile is None:
                raise AIConfigurationError(
                    "embeddings references a missing provider profile."
                )
            if not embedding_profile.supports_embeddings:
                raise AIConfigurationError(
                    f"Provider profile '{embedding_profile.id}' does not support embeddings."
                )

        return self

    def get_profile(self, profile_id: str) -> ProviderProfileConfig:
        for profile in self.profiles:
            if profile.id == profile_id:
                return profile
        raise AIConfigurationError(f"Unknown provider profile '{profile_id}'.")

def load_ai_runtime_config(settings: Any) -> AIRuntimeConfig:
    raw = getattr(settings, "ai_runtime_config_json", None)
    if not raw:
        raise AIConfigurationError("AI runtime config is missing.")

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AIConfigurationError(
            f"AI runtime config is not valid JSON: {exc.msg}"
        ) from exc

    try:
        return AIRuntimeConfig.model_validate(payload)
    except ValidationError as exc:
        raise AIConfigurationError(f"AI runtime config is invalid: {exc}") from exc


def load_ai_secret_values(settings: Any) -> dict[str, str]:
    secret_values: dict[str, str] = {}
    raw = getattr(settings, "ai_secret_values_json", None)
    if raw:
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise AIConfigurationError(
                f"AI secret values are not valid JSON: {exc.msg}"
            ) from exc
        if not isinstance(payload, dict):
            raise AIConfigurationError("AI secret values JSON must be an object.")
        for key, value in payload.items():
            if isinstance(key, str) and isinstance(value, str) and value:
                secret_values[key] = value

    return secret_values


def compute_embedding_fingerprint(
    provider_type: str,
    base_url: str,
    model_id: str,
    *,
    document_schema_version: int = DOCUMENT_SCHEMA_VERSION,
    ast_schema_version: int = AST_SCHEMA_VERSION,
    ast_enabled_languages: tuple[str, ...] = AST_ENABLED_LANGUAGES,
) -> str:
    payload = json.dumps(
        {
            "provider_type": provider_type,
            "base_url": normalize_base_url(base_url, provider_type),
            "model_id": model_id,
            "document_schema_version": document_schema_version,
            "ast_schema_version": ast_schema_version,
            "ast_enabled_languages": list(ast_enabled_languages),
        },
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def describe_capability(
    config: AIRuntimeConfig | None,
    secret_values: dict[str, str],
    capability_name: Literal["text_generation", "embeddings"],
) -> dict[str, Any]:
    if config is None:
        return {
            "configured": False,
            "ready": False,
            "provider_type": None,
            "model_id": None,
            "base_url": None,
            "auth_mode": None,
            "secret_present": False,
            "message": "AI runtime configuration is unavailable.",
        }

    binding = getattr(config.capabilities, capability_name)
    if binding is None:
        return {
            "configured": False,
            "ready": False,
            "provider_type": None,
            "model_id": None,
            "base_url": None,
            "auth_mode": None,
            "secret_present": False,
            "message": (
                "Semantic search is disabled."
                if capability_name == "embeddings"
                else "Text generation is not configured."
            ),
        }

    profile = config.get_profile(binding.provider_profile_id)
    secret_present = (
        profile.auth_mode == "none"
        or bool(secret_values.get(profile.api_key_secret_ref or ""))
    )
    return {
        "configured": True,
        "ready": secret_present,
        "provider_type": profile.provider_type,
        "model_id": binding.model_id,
        "base_url": profile.base_url,
        "auth_mode": profile.auth_mode,
        "secret_present": secret_present,
        "message": None
        if secret_present
        else f"Provider profile '{profile.label}' is missing its API key.",
    }
