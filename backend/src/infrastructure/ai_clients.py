from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import json
from dataclasses import dataclass
import time
from typing import Any, Callable, Protocol
from urllib.parse import urlparse

import httpx

from infrastructure.ai_runtime import AIRuntimeConfig, ProviderProfileConfig
from infrastructure.errors import (
    AIAuthenticationError,
    AIConfigurationError,
    AIConnectionError,
    AIModelError,
    AIRateLimitError,
    AIRequestError,
    AIUnsupportedCapabilityError,
)
from utils.logger import logger
from utils.utils import redact_url_credentials


@dataclass
class EmbeddingResult:
    embeddings: list[list[float]]
    dimensions: int | None


class ResponsesTextClient(Protocol):
    def generate(
        self,
        *,
        model: str,
        instructions: str,
        input_text: str,
        temperature: float,
    ) -> str:
        """Generate text using the provider's Responses-compatible endpoint."""


class EmbeddingClient(Protocol):
    def embed(self, *, model: str, inputs: list[str]) -> EmbeddingResult:
        """Create embeddings using the provider's embeddings endpoint."""


class ProviderRegistry(Protocol):
    def get_profile(self, profile_id: str) -> ProviderProfileConfig:
        """Return the configured provider profile for the given id."""

    def get_text_client(self, profile_id: str) -> ResponsesTextClient:
        """Return a Responses-compatible text client."""

    def get_embedding_client(self, profile_id: str) -> EmbeddingClient:
        """Return an embeddings client."""

    def get_secret_value(self, profile: ProviderProfileConfig) -> str | None:
        """Return the resolved secret value for the provided profile."""


def _extract_error_message(payload: Any, fallback: str) -> str:
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            if isinstance(message, str) and message.strip():
                return message.strip()
        message = payload.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()
    return fallback


def _is_model_error(status_code: int, message: str) -> bool:
    if status_code not in {400, 404, 422}:
        return False
    lowered = message.lower()
    return "model" in lowered or "engine" in lowered


def _parse_sse_payload(body_text: str) -> dict[str, Any] | None:
    if not body_text.strip():
        return None

    events: list[str] = []
    current_event: list[str] = []

    for raw_line in body_text.splitlines():
        line = raw_line.strip()
        if not line:
            if current_event:
                events.append("\n".join(current_event))
                current_event = []
            continue
        if line.startswith(":"):
            continue
        if line.startswith("data:"):
            current_event.append(line[5:].strip())

    if current_event:
        events.append("\n".join(current_event))

    last_payload: dict[str, Any] | None = None
    for event in events:
        if not event or event == "[DONE]":
            continue
        try:
            parsed = json.loads(event)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            last_payload = parsed

    return last_payload


def _parse_retry_after(headers: httpx.Headers) -> float | None:
    raw_value = headers.get("retry-after")
    if not raw_value:
        return None

    stripped = raw_value.strip()
    if not stripped:
        return None

    try:
        return max(0.0, float(stripped))
    except ValueError:
        pass

    try:
        parsed = parsedate_to_datetime(stripped)
    except (TypeError, ValueError, IndexError, OverflowError):
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return max(0.0, (parsed - datetime.now(timezone.utc)).total_seconds())


def _summarize_payload(payload: dict[str, Any]) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    if "model" in payload:
        summary["model"] = payload.get("model")
    if "temperature" in payload:
        summary["temperature"] = payload.get("temperature")

    instructions = payload.get("instructions")
    if isinstance(instructions, str):
        summary["instructions_chars"] = len(instructions)

    input_value = payload.get("input")
    if isinstance(input_value, str):
        summary["input_items"] = 1
        summary["input_chars"] = len(input_value)
    elif isinstance(input_value, list):
        summary["input_items"] = len(input_value)
        summary["input_chars"] = sum(
            len(item) for item in input_value if isinstance(item, str)
        )

    return summary


def _summarize_response(path: str, body: Any) -> dict[str, Any]:
    summary: dict[str, Any] = {"endpoint": path}

    if not isinstance(body, dict):
        summary["body_type"] = type(body).__name__
        return summary

    if path == "/v1/responses":
        output_text = body.get("output_text")
        if isinstance(output_text, str):
            summary["output_chars"] = len(output_text)
        else:
            summary["output_items"] = len(body.get("output", []) or [])
    elif path == "/v1/embeddings":
        data = body.get("data", []) or []
        if isinstance(data, list):
            summary["embedding_count"] = len(data)
            first_item = data[0] if data else None
            first_embedding = (
                first_item.get("embedding") if isinstance(first_item, dict) else None
            )
            if isinstance(first_embedding, list):
                summary["embedding_dimensions"] = len(first_embedding)

    return summary


class OpenAIWireTransport:
    def __init__(
        self,
        profile: ProviderProfileConfig,
        api_key: str | None = None,
        client_factory: Callable[[], httpx.Client] | None = None,
    ) -> None:
        self.profile = profile
        self.api_key = api_key
        self.client = (
            client_factory()
            if client_factory is not None
            else httpx.Client(timeout=httpx.Timeout(30.0))
        )

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.profile.auth_mode == "bearer":
            if not self.api_key:
                raise AIConfigurationError(
                    f"Provider profile '{self.profile.id}' is missing an API key."
                )
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _log_request(self, path: str, payload: dict[str, Any]) -> None:
        url = self._resolve_url(path)
        logger.info(
            "AI request provider=%s type=%s url=%s endpoint=%s payload=%s",
            self.profile.label,
            self.profile.provider_type,
            redact_url_credentials(url),
            path,
            _summarize_payload(payload),
        )

    def _log_response(
        self,
        path: str,
        *,
        status_code: int,
        elapsed_ms: float,
        body: Any,
    ) -> None:
        logger.info(
            "AI response provider=%s endpoint=%s status=%s elapsed_ms=%.1f summary=%s",
            self.profile.label,
            path,
            status_code,
            elapsed_ms,
            _summarize_response(path, body),
        )

    def _resolve_url(self, path: str) -> str:
        base_url = self.profile.base_url or ""
        if self.profile.provider_type != "openai_compatible":
            return f"{base_url}{path}"

        parsed = urlparse(base_url)
        base_path = parsed.path.rstrip("/")
        if base_path:
            return base_url
        return f"{base_url}{path}"

    def post_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        url = self._resolve_url(path)
        self._log_request(path, payload)
        started_at = time.monotonic()

        try:
            response = self.client.post(url, headers=self._headers(), json=payload)
        except httpx.HTTPError as exc:
            elapsed_ms = (time.monotonic() - started_at) * 1000
            logger.exception(
                "AI request failed provider=%s endpoint=%s elapsed_ms=%.1f",
                self.profile.label,
                path,
                elapsed_ms,
            )
            raise AIConnectionError(
                f"Failed to reach provider '{self.profile.label}' at {self.profile.base_url}: {exc}"
            ) from exc

        body: Any = None
        if response.content:
            try:
                body = response.json()
            except ValueError:
                content_type = response.headers.get("content-type", "")
                if "text/event-stream" in content_type.lower():
                    body = _parse_sse_payload(response.text)
                else:
                    body = None

        elapsed_ms = (time.monotonic() - started_at) * 1000
        self._log_response(
            path,
            status_code=response.status_code,
            elapsed_ms=elapsed_ms,
            body=body,
        )

        if response.status_code >= 400:
            self._raise_response_error(
                path,
                response.status_code,
                body,
                response.headers,
            )

        if not isinstance(body, dict):
            raise AIRequestError(
                f"Provider '{self.profile.label}' returned a non-JSON response."
            )

        return body

    def _raise_response_error(
        self,
        path: str,
        status_code: int,
        body: Any,
        headers: httpx.Headers | None = None,
    ) -> None:
        message = _extract_error_message(
            body,
            f"Provider '{self.profile.label}' returned status {status_code}.",
        )

        if status_code in {401, 403}:
            raise AIAuthenticationError(message)
        if status_code == 429:
            raise AIRateLimitError(
                message,
                provider_label=self.profile.label,
                status_code=status_code,
                retry_after_seconds=_parse_retry_after(headers or httpx.Headers()),
            )
        if _is_model_error(status_code, message):
            raise AIModelError(message)
        if status_code == 404 and path in {"/v1/responses", "/v1/embeddings"}:
            raise AIUnsupportedCapabilityError(message)
        raise AIRequestError(message)


class OpenAIWireResponsesClient:
    def __init__(self, transport: OpenAIWireTransport) -> None:
        self.transport = transport

    def generate(
        self,
        *,
        model: str,
        instructions: str,
        input_text: str,
        temperature: float,
    ) -> str:
        payload = {
            "model": model,
            "instructions": instructions,
            "input": input_text,
            "temperature": temperature,
            "store": False,
        }
        response = self.transport.post_json("/v1/responses", payload)

        output_text = response.get("output_text")
        if isinstance(output_text, str) and output_text.strip():
            return output_text.strip()

        for item in response.get("output", []) or []:
            if not isinstance(item, dict) or item.get("type") != "message":
                continue
            for content in item.get("content", []) or []:
                if not isinstance(content, dict) or content.get("type") != "output_text":
                    continue
                text = content.get("text")
                if isinstance(text, str) and text.strip():
                    return text.strip()
                if isinstance(text, dict):
                    value = text.get("value")
                    if isinstance(value, str) and value.strip():
                        return value.strip()

        raise AIRequestError("Responses API output did not include text content.")


class OpenAIWireEmbeddingClient:
    def __init__(self, transport: OpenAIWireTransport) -> None:
        self.transport = transport

    def embed(self, *, model: str, inputs: list[str]) -> EmbeddingResult:
        if not inputs:
            return EmbeddingResult(embeddings=[], dimensions=None)

        payload = {
            "model": model,
            "input": inputs[0] if len(inputs) == 1 else inputs,
        }
        response = self.transport.post_json("/v1/embeddings", payload)

        embeddings: list[list[float]] = []
        for item in response.get("data", []) or []:
            if not isinstance(item, dict):
                continue
            embedding = item.get("embedding")
            if isinstance(embedding, list):
                embeddings.append([float(value) for value in embedding])

        if inputs and not embeddings:
            raise AIRequestError("Embeddings API response did not include vectors.")

        dimensions = len(embeddings[0]) if embeddings else None
        return EmbeddingResult(embeddings=embeddings, dimensions=dimensions)


class HTTPProviderRegistry:
    def __init__(
        self,
        config: AIRuntimeConfig,
        secret_values: dict[str, str],
        client_factory: Callable[[], httpx.Client] | None = None,
    ) -> None:
        self.config = config
        self.secret_values = secret_values
        self.client_factory = client_factory
        self._transports: dict[str, OpenAIWireTransport] = {}
        self._text_clients: dict[str, OpenAIWireResponsesClient] = {}
        self._embedding_clients: dict[str, OpenAIWireEmbeddingClient] = {}

    def get_profile(self, profile_id: str) -> ProviderProfileConfig:
        return self.config.get_profile(profile_id)

    def get_secret_value(self, profile: ProviderProfileConfig) -> str | None:
        if not profile.api_key_secret_ref:
            return None
        return self.secret_values.get(profile.api_key_secret_ref)

    def _get_transport(self, profile_id: str) -> OpenAIWireTransport:
        if profile_id in self._transports:
            return self._transports[profile_id]

        profile = self.get_profile(profile_id)
        transport = OpenAIWireTransport(
            profile=profile,
            api_key=self.get_secret_value(profile),
            client_factory=self.client_factory,
        )
        self._transports[profile_id] = transport
        return transport

    def get_text_client(self, profile_id: str) -> ResponsesTextClient:
        profile = self.get_profile(profile_id)
        if not profile.supports_text_generation:
            raise AIUnsupportedCapabilityError(
                f"Provider profile '{profile.id}' does not support text generation."
            )
        if profile_id not in self._text_clients:
            self._text_clients[profile_id] = OpenAIWireResponsesClient(
                self._get_transport(profile_id)
            )
        return self._text_clients[profile_id]

    def get_embedding_client(self, profile_id: str) -> EmbeddingClient:
        profile = self.get_profile(profile_id)
        if not profile.supports_embeddings:
            raise AIUnsupportedCapabilityError(
                f"Provider profile '{profile.id}' does not support embeddings."
            )
        if profile_id not in self._embedding_clients:
            self._embedding_clients[profile_id] = OpenAIWireEmbeddingClient(
                self._get_transport(profile_id)
            )
        return self._embedding_clients[profile_id]
