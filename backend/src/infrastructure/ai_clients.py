import json
from dataclasses import dataclass
from typing import Any, Callable, Protocol

import httpx

from infrastructure.ai_runtime import AIRuntimeConfig, ProviderProfileConfig
from infrastructure.errors import (
    AIAuthenticationError,
    AIConfigurationError,
    AIConnectionError,
    AIModelError,
    AIRequestError,
    AIUnsupportedCapabilityError,
)


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

    def post_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.profile.base_url}{path}"

        try:
            response = self.client.post(url, headers=self._headers(), json=payload)
        except httpx.HTTPError as exc:
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

        if response.status_code >= 400:
            self._raise_response_error(path, response.status_code, body)

        if not isinstance(body, dict):
            raise AIRequestError(
                f"Provider '{self.profile.label}' returned a non-JSON response."
            )

        return body

    def _raise_response_error(
        self, path: str, status_code: int, body: Any
    ) -> None:
        message = _extract_error_message(
            body,
            f"Provider '{self.profile.label}' returned status {status_code}.",
        )

        if status_code in {401, 403}:
            raise AIAuthenticationError(message)
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
