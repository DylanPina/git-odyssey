from __future__ import annotations

from dataclasses import dataclass
import time
from typing import Any, Callable, Protocol

import httpx

from infrastructure.ai_runtime import (
    AIRuntimeConfig,
    CapabilityName,
    GoogleAITarget,
)
from infrastructure.errors import (
    AIAuthenticationError,
    AIConfigurationError,
    AIConnectionError,
    AIModelError,
    AIRequestError,
    AIUnsupportedCapabilityError,
)
from utils.logger import logger

GOOGLE_AUTH_SCOPE = "https://www.googleapis.com/auth/cloud-platform"
DEFAULT_PUBLISHERS = ("google", "meta", "mistralai", "anthropic", "cohere")


@dataclass
class EmbeddingResult:
    embeddings: list[list[float]]
    dimensions: int | None


@dataclass
class GoogleADCStatus:
    ready: bool
    project_id: str | None
    message: str | None = None


@dataclass
class ModelGardenEntry:
    id: str
    resource_name: str
    display_name: str
    publisher: str | None
    version: str | None
    location: str
    target_kind: str
    source: str
    capabilities: list[str]
    adapter_family: str | None = None
    deployable: bool = False
    description: str | None = None

    def as_target(self, capability: CapabilityName) -> GoogleAITarget:
        capabilities = list(dict.fromkeys([*self.capabilities, capability]))
        return GoogleAITarget(
            target_kind="vertex_endpoint"
            if self.target_kind == "vertex_endpoint"
            else "managed_model",
            resource_name=self.resource_name,
            display_name=self.display_name,
            publisher=self.publisher,
            version=self.version,
            location=self.location,
            capabilities=capabilities,
            adapter_family=self.adapter_family,
            source=self.source,
        )


class TextGenerationClient(Protocol):
    def generate(
        self,
        *,
        target: GoogleAITarget,
        instructions: str,
        input_text: str,
        temperature: float,
        response_schema: dict[str, Any] | None = None,
    ) -> str:
        """Generate text with a validated Google AI target."""


class EmbeddingClient(Protocol):
    def embed(self, *, target: GoogleAITarget, inputs: list[str]) -> EmbeddingResult:
        """Create embeddings with a validated Google AI target."""


class GoogleAIRegistry(Protocol):
    config: AIRuntimeConfig

    def get_text_client(self) -> TextGenerationClient:
        """Return a Google text-generation client."""

    def get_embedding_client(self) -> EmbeddingClient:
        """Return a Google embedding client."""

    def list_model_garden(self) -> list[ModelGardenEntry]:
        """Return normalized Model Garden and endpoint entries."""

    def validate_target(
        self, *, capability: CapabilityName, target: GoogleAITarget
    ) -> dict[str, Any]:
        """Run GitOdyssey's probe for a capability."""


def check_adc_status() -> GoogleADCStatus:
    try:
        import google.auth
        from google.auth.transport.requests import Request
    except ImportError:
        return GoogleADCStatus(
            ready=False,
            project_id=None,
            message="Install google-auth to use Google Cloud ADC.",
        )

    try:
        credentials, project_id = google.auth.default(scopes=[GOOGLE_AUTH_SCOPE])
        credentials.refresh(Request())
    except Exception as exc:  # pragma: no cover - exercised with mocked auth in tests
        return GoogleADCStatus(
            ready=False,
            project_id=None,
            message=f"Google ADC is not ready: {exc}",
        )

    return GoogleADCStatus(ready=True, project_id=project_id, message=None)


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


def _infer_capabilities(resource_name: str, display_name: str) -> tuple[list[str], str | None]:
    haystack = f"{resource_name} {display_name}".lower()
    capabilities: list[str] = []
    adapter_family: str | None = None

    if "embedding" in haystack or "embed" in haystack:
        capabilities.append("embeddings")
        adapter_family = "text_embedding"

    if "gemini" in haystack:
        capabilities.extend(["text_generation", "review"])
        adapter_family = adapter_family or "gemini"

    if any(token in haystack for token in ("claude", "llama", "mistral", "command")):
        capabilities.extend(["text_generation", "review"])
        adapter_family = adapter_family or "vertex_predict_text"

    return list(dict.fromkeys(capabilities)), adapter_family


def _extract_prediction_text(payload: Any) -> str | None:
    if isinstance(payload, str):
        return payload.strip() or None
    if not isinstance(payload, dict):
        return None

    for key in ("content", "text", "output", "generated_text"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    candidates = payload.get("candidates")
    if isinstance(candidates, list):
        for candidate in candidates:
            text = _extract_prediction_text(candidate)
            if text:
                return text

    content = payload.get("content")
    if isinstance(content, dict):
        parts = content.get("parts")
        if isinstance(parts, list):
            texts = [
                part.get("text")
                for part in parts
                if isinstance(part, dict) and isinstance(part.get("text"), str)
            ]
            joined = "".join(texts).strip()
            if joined:
                return joined

    predictions = payload.get("predictions")
    if isinstance(predictions, list):
        for prediction in predictions:
            text = _extract_prediction_text(prediction)
            if text:
                return text

    return None


def _extract_embedding_values(payload: Any) -> list[float] | None:
    if isinstance(payload, list) and all(isinstance(value, (int, float)) for value in payload):
        return [float(value) for value in payload]

    if not isinstance(payload, dict):
        return None

    embedding = payload.get("embedding")
    if isinstance(embedding, dict):
        values = embedding.get("values")
        if isinstance(values, list):
            return [float(value) for value in values]
    if isinstance(embedding, list):
        return [float(value) for value in embedding]

    embeddings = payload.get("embeddings")
    if isinstance(embeddings, dict):
        values = embeddings.get("values")
        if isinstance(values, list):
            return [float(value) for value in values]
    if isinstance(embeddings, list):
        return _extract_embedding_values(embeddings)

    values = payload.get("values")
    if isinstance(values, list) and all(isinstance(value, (int, float)) for value in values):
        return [float(value) for value in values]

    return None


class GoogleVertexRestTransport:
    def __init__(
        self,
        config: AIRuntimeConfig,
        client_factory: Callable[[], httpx.Client] | None = None,
        token_provider: Callable[[], str] | None = None,
    ) -> None:
        if not config.google_project_id:
            raise AIConfigurationError("Google Cloud project ID is required.")
        self.config = config
        self.client = (
            client_factory()
            if client_factory is not None
            else httpx.Client(timeout=httpx.Timeout(60.0))
        )
        self.token_provider = token_provider or self._load_adc_token

    def _load_adc_token(self) -> str:
        try:
            import google.auth
            from google.auth.transport.requests import Request
        except ImportError as exc:
            raise AIConfigurationError(
                "Install google-auth to use Google Cloud ADC."
            ) from exc

        try:
            credentials, _project_id = google.auth.default(scopes=[GOOGLE_AUTH_SCOPE])
            credentials.refresh(Request())
        except Exception as exc:  # pragma: no cover - exercised with mocked auth in tests
            raise AIAuthenticationError(f"Google ADC is not ready: {exc}") from exc

        token = getattr(credentials, "token", None)
        if not token:
            raise AIAuthenticationError("Google ADC did not return an access token.")
        return str(token)

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token_provider()}",
            "Content-Type": "application/json",
        }

    def _api_base(self, location: str | None = None) -> str:
        resolved_location = location or self.config.google_location
        return f"https://{resolved_location}-aiplatform.googleapis.com/v1"

    def resolve_resource(self, target: GoogleAITarget) -> str:
        location = target.location or self.config.google_location
        resource_name = target.resource_name.strip().lstrip("/")
        if resource_name.startswith("projects/"):
            return resource_name
        if resource_name.startswith("publishers/"):
            return (
                f"projects/{self.config.google_project_id}/locations/{location}/"
                f"{resource_name}"
            )
        if resource_name.startswith("endpoints/"):
            return (
                f"projects/{self.config.google_project_id}/locations/{location}/"
                f"{resource_name}"
            )
        if "/models/" not in resource_name:
            publisher = target.publisher or "google"
            return (
                f"projects/{self.config.google_project_id}/locations/{location}/"
                f"publishers/{publisher}/models/{resource_name}"
            )
        return (
            f"projects/{self.config.google_project_id}/locations/{location}/"
            f"{resource_name}"
        )

    def request_json(
        self,
        method: str,
        path_or_resource: str,
        *,
        location: str | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        url = (
            path_or_resource
            if path_or_resource.startswith("https://")
            else f"{self._api_base(location)}"
            f"/{path_or_resource.strip('/')}"
        )
        started_at = time.monotonic()
        try:
            response = self.client.request(
                method,
                url,
                headers=self._headers(),
                json=json_body,
            )
        except httpx.HTTPError as exc:
            raise AIConnectionError(f"Failed to reach Google AI at {url}: {exc}") from exc

        elapsed_ms = (time.monotonic() - started_at) * 1000
        logger.info(
            "Vertex AI request method=%s url=%s status=%s elapsed_ms=%.1f",
            method,
            url,
            response.status_code,
            elapsed_ms,
        )

        body: Any = None
        if response.content:
            try:
                body = response.json()
            except ValueError as exc:
                raise AIRequestError("Google AI returned a non-JSON response.") from exc

        if response.status_code >= 400:
            message = _extract_error_message(
                body,
                f"Google AI returned status {response.status_code}.",
            )
            if response.status_code in {401, 403}:
                raise AIAuthenticationError(message)
            if response.status_code in {400, 404, 422}:
                raise AIModelError(message)
            raise AIRequestError(message)

        if not isinstance(body, dict):
            return {}
        return body


class GoogleVertexTextClient:
    def __init__(self, transport: GoogleVertexRestTransport) -> None:
        self.transport = transport

    def generate(
        self,
        *,
        target: GoogleAITarget,
        instructions: str,
        input_text: str,
        temperature: float,
        response_schema: dict[str, Any] | None = None,
    ) -> str:
        if "text_generation" not in target.capabilities and "review" not in target.capabilities:
            raise AIUnsupportedCapabilityError(
                f"Target '{target.display_name}' is not validated for text generation."
            )

        adapter_family = target.adapter_family or (
            "gemini" if target.target_kind == "managed_model" else "vertex_predict_text"
        )
        if adapter_family == "gemini" and target.target_kind == "managed_model":
            return self._generate_content(
                target=target,
                instructions=instructions,
                input_text=input_text,
                temperature=temperature,
                response_schema=response_schema,
            )

        return self._predict_text(
            target=target,
            instructions=instructions,
            input_text=input_text,
            temperature=temperature,
        )

    def _generate_content(
        self,
        *,
        target: GoogleAITarget,
        instructions: str,
        input_text: str,
        temperature: float,
        response_schema: dict[str, Any] | None,
    ) -> str:
        resource = self.transport.resolve_resource(target)
        generation_config: dict[str, Any] = {"temperature": temperature}
        if response_schema is not None:
            generation_config["responseMimeType"] = "application/json"
            generation_config["responseSchema"] = response_schema
        payload = {
            "systemInstruction": {"parts": [{"text": instructions}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": input_text}],
                }
            ],
            "generationConfig": generation_config,
        }
        response = self.transport.request_json(
            "POST",
            f"{resource}:generateContent",
            location=target.location,
            json_body=payload,
        )
        text = _extract_prediction_text(response)
        if text:
            return text
        raise AIRequestError("Google AI generateContent output did not include text.")

    def _predict_text(
        self,
        *,
        target: GoogleAITarget,
        instructions: str,
        input_text: str,
        temperature: float,
    ) -> str:
        resource = self.transport.resolve_resource(target)
        prompt = f"{instructions.strip()}\n\n{input_text.strip()}".strip()
        payload = {
            "instances": [{"prompt": prompt}],
            "parameters": {"temperature": temperature},
        }
        response = self.transport.request_json(
            "POST",
            f"{resource}:predict",
            location=target.location,
            json_body=payload,
        )
        text = _extract_prediction_text(response)
        if text:
            return text
        raise AIRequestError("Google AI prediction output did not include text.")


class GoogleVertexEmbeddingClient:
    def __init__(self, transport: GoogleVertexRestTransport) -> None:
        self.transport = transport

    def embed(self, *, target: GoogleAITarget, inputs: list[str]) -> EmbeddingResult:
        if not inputs:
            return EmbeddingResult(embeddings=[], dimensions=None)
        if "embeddings" not in target.capabilities:
            raise AIUnsupportedCapabilityError(
                f"Target '{target.display_name}' is not validated for embeddings."
            )

        resource = self.transport.resolve_resource(target)
        instances = [
            {
                "content": value,
                "task_type": "RETRIEVAL_DOCUMENT",
            }
            for value in inputs
        ]
        payload: dict[str, Any] = {"instances": instances}
        if target.embedding_output_dimension:
            payload["parameters"] = {
                "outputDimensionality": target.embedding_output_dimension
            }
        response = self.transport.request_json(
            "POST",
            f"{resource}:predict",
            location=target.location,
            json_body=payload,
        )
        predictions = response.get("predictions")
        if not isinstance(predictions, list):
            raise AIRequestError("Google AI embedding response did not include predictions.")

        embeddings: list[list[float]] = []
        for prediction in predictions:
            values = _extract_embedding_values(prediction)
            if values is not None:
                embeddings.append(values)

        if not embeddings:
            raise AIRequestError("Google AI embedding response did not include vectors.")
        return EmbeddingResult(
            embeddings=embeddings,
            dimensions=len(embeddings[0]) if embeddings else None,
        )


class GoogleModelGardenCatalog:
    def __init__(self, transport: GoogleVertexRestTransport) -> None:
        self.transport = transport

    def list(self) -> list[ModelGardenEntry]:
        entries: list[ModelGardenEntry] = []
        entries.extend(self._list_managed_models())
        entries.extend(self._list_endpoints())

        unique: dict[str, ModelGardenEntry] = {}
        for entry in entries:
            unique[entry.resource_name] = entry
        return list(unique.values())

    def _list_managed_models(self) -> list[ModelGardenEntry]:
        entries: list[ModelGardenEntry] = []
        for publisher in DEFAULT_PUBLISHERS:
            try:
                payload = self.transport.request_json(
                    "GET",
                    (
                        f"projects/{self.transport.config.google_project_id}/"
                        f"locations/{self.transport.config.google_location}/"
                        f"publishers/{publisher}/models"
                    ),
                )
            except AIRequestError:
                continue

            for item in payload.get("publisherModels", []) or payload.get("models", []) or []:
                if not isinstance(item, dict):
                    continue
                name = str(item.get("name") or "")
                model_id = name.split("/")[-1] if name else str(item.get("id") or "")
                display_name = str(
                    item.get("displayName")
                    or item.get("display_name")
                    or model_id
                    or "Model Garden model"
                )
                capabilities, adapter_family = _infer_capabilities(name, display_name)
                launch_stage = str(item.get("launchStage") or item.get("launch_stage") or "")
                deployable = bool(item.get("deployable") or item.get("supportedActions"))
                source = (
                    "managed_api_model"
                    if publisher == "google" and adapter_family in {"gemini", "text_embedding"}
                    else "deployable_google_model"
                    if publisher == "google"
                    else "deployable_partner_model"
                )
                if not name and model_id:
                    name = f"publishers/{publisher}/models/{model_id}"
                entries.append(
                    ModelGardenEntry(
                        id=model_id or name,
                        resource_name=name,
                        display_name=display_name,
                        publisher=publisher,
                        version=launch_stage or None,
                        location=self.transport.config.google_location,
                        target_kind="managed_model",
                        source=source,
                        capabilities=capabilities,
                        adapter_family=adapter_family,
                        deployable=deployable,
                        description=item.get("description"),
                    )
                )
        return entries

    def _list_endpoints(self) -> list[ModelGardenEntry]:
        payload = self.transport.request_json(
            "GET",
            (
                f"projects/{self.transport.config.google_project_id}/"
                f"locations/{self.transport.config.google_location}/endpoints"
            ),
        )
        entries: list[ModelGardenEntry] = []
        for endpoint in payload.get("endpoints", []) or []:
            if not isinstance(endpoint, dict):
                continue
            resource_name = str(endpoint.get("name") or "")
            display_name = str(endpoint.get("displayName") or resource_name.split("/")[-1])
            deployed_models = endpoint.get("deployedModels") or []
            deployed_model_names = " ".join(
                str(model.get("displayName") or model.get("model") or "")
                for model in deployed_models
                if isinstance(model, dict)
            )
            capabilities, adapter_family = _infer_capabilities(
                resource_name,
                f"{display_name} {deployed_model_names}",
            )
            if not capabilities:
                capabilities = ["text_generation", "review"]
                adapter_family = "vertex_predict_text"
            entries.append(
                ModelGardenEntry(
                    id=resource_name.split("/")[-1],
                    resource_name=resource_name,
                    display_name=display_name,
                    publisher=None,
                    version=None,
                    location=self.transport.config.google_location,
                    target_kind="vertex_endpoint",
                    source="vertex_endpoint",
                    capabilities=capabilities,
                    adapter_family=adapter_family,
                    deployable=False,
                    description=None,
                )
            )
        return entries


class GoogleDeploymentService:
    def __init__(self, transport: GoogleVertexRestTransport) -> None:
        self.transport = transport

    def construct_deployment_request(
        self,
        *,
        model_resource_name: str,
        endpoint_resource_name: str,
        deployed_model_display_name: str,
        machine_type: str,
        accelerator_type: str | None = None,
        accelerator_count: int | None = None,
        min_replica_count: int = 1,
        max_replica_count: int = 1,
    ) -> dict[str, Any]:
        machine_spec: dict[str, Any] = {"machineType": machine_type}
        if accelerator_type:
            machine_spec["acceleratorType"] = accelerator_type
            machine_spec["acceleratorCount"] = accelerator_count or 1

        return {
            "endpoint": endpoint_resource_name,
            "body": {
                "deployedModel": {
                    "model": model_resource_name,
                    "displayName": deployed_model_display_name,
                    "dedicatedResources": {
                        "machineSpec": machine_spec,
                        "minReplicaCount": min_replica_count,
                        "maxReplicaCount": max_replica_count,
                    },
                },
                "trafficSplit": {"0": 100},
            },
        }

    def deploy(self, request: dict[str, Any]) -> dict[str, Any]:
        endpoint = str(request["endpoint"])
        return self.transport.request_json(
            "POST",
            f"{endpoint}:deployModel",
            json_body=request["body"],
        )

    def poll_operation(self, operation_name: str) -> dict[str, Any]:
        return self.transport.request_json("GET", operation_name)


class GoogleVertexRegistry:
    def __init__(
        self,
        config: AIRuntimeConfig,
        client_factory: Callable[[], httpx.Client] | None = None,
        token_provider: Callable[[], str] | None = None,
    ) -> None:
        self.config = config
        self.transport = GoogleVertexRestTransport(
            config=config,
            client_factory=client_factory,
            token_provider=token_provider,
        )
        self._text_client: GoogleVertexTextClient | None = None
        self._embedding_client: GoogleVertexEmbeddingClient | None = None
        self._catalog: GoogleModelGardenCatalog | None = None
        self._deployment: GoogleDeploymentService | None = None

    def get_text_client(self) -> TextGenerationClient:
        if self._text_client is None:
            self._text_client = GoogleVertexTextClient(self.transport)
        return self._text_client

    def get_embedding_client(self) -> EmbeddingClient:
        if self._embedding_client is None:
            self._embedding_client = GoogleVertexEmbeddingClient(self.transport)
        return self._embedding_client

    def get_deployment_service(self) -> GoogleDeploymentService:
        if self._deployment is None:
            self._deployment = GoogleDeploymentService(self.transport)
        return self._deployment

    def list_model_garden(self) -> list[ModelGardenEntry]:
        if self._catalog is None:
            self._catalog = GoogleModelGardenCatalog(self.transport)
        return self._catalog.list()

    def validate_target(
        self, *, capability: CapabilityName, target: GoogleAITarget
    ) -> dict[str, Any]:
        target = target.with_location(self.config.google_location)
        if capability in {"text_generation", "review"}:
            instructions = (
                "You are GitOdyssey's structured review validator. "
                "Return JSON only."
                if capability == "review"
                else "You are GitOdyssey's AI endpoint validator."
            )
            input_text = (
                (
                    'Return {"summary":"ready","findings":[]} as valid JSON. '
                    "Do not add markdown."
                )
                if capability == "review"
                else "Reply with READY."
            )
            response_schema = (
                {
                    "type": "object",
                    "required": ["summary", "findings"],
                    "properties": {
                        "summary": {"type": "string"},
                        "findings": {"type": "array"},
                    },
                }
                if capability == "review"
                else None
            )
            output = self.get_text_client().generate(
                target=target,
                instructions=instructions,
                input_text=input_text,
                temperature=0.0,
                response_schema=response_schema,
            )
            if capability == "review":
                import json

                parsed = json.loads(output)
                if not isinstance(parsed.get("findings"), list):
                    raise AIRequestError("Review validation JSON did not include findings.")
            return {
                "ready": True,
                "message": "Validated successfully.",
            }

        result = self.get_embedding_client().embed(
            target=target,
            inputs=["GitOdyssey semantic search readiness probe"],
        )
        if result.dimensions is None:
            raise AIRequestError("Embedding validation did not observe vector dimensions.")
        return {
            "ready": True,
            "message": f"Validated successfully (dimension {result.dimensions}).",
            "embedding_output_dimension": result.dimensions,
        }
