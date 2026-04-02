from datetime import datetime, timedelta, timezone
import json
import unittest
from unittest.mock import Mock

import httpx

from infrastructure.ai_clients import (
    OpenAIWireEmbeddingClient,
    OpenAIWireResponsesClient,
    OpenAIWireTransport,
)
from infrastructure.ai_runtime import ProviderProfileConfig
from infrastructure.errors import (
    AIAuthenticationError,
    AIModelError,
    AIRateLimitError,
    AIUnsupportedCapabilityError,
)


def build_profile(
    provider_type: str = "openai",
    auth_mode: str = "bearer",
    base_url: str = "https://api.openai.com",
) -> ProviderProfileConfig:
    return ProviderProfileConfig(
        id="provider-1",
        provider_type=provider_type,
        label="Provider 1",
        base_url=base_url,
        auth_mode=auth_mode,
        api_key_secret_ref="provider:provider-1:api-key" if auth_mode == "bearer" else None,
        supports_text_generation=True,
        supports_embeddings=True,
    )


def build_response(status_code: int, payload: dict) -> httpx.Response:
    request = httpx.Request("POST", "https://api.example.test")
    return httpx.Response(status_code, request=request, json=payload)


def build_response_with_headers(
    status_code: int, payload: dict, headers: dict[str, str]
) -> httpx.Response:
    request = httpx.Request("POST", "https://api.example.test")
    return httpx.Response(status_code, request=request, json=payload, headers=headers)


def build_sse_response(status_code: int, payload: dict) -> httpx.Response:
    request = httpx.Request("POST", "https://api.example.test")
    body = f"data: {json.dumps(payload)}\n\n"
    return httpx.Response(
        status_code,
        request=request,
        text=body,
        headers={"content-type": "text/event-stream;charset=utf-8"},
    )


class OpenAIWireResponsesClientTests(unittest.TestCase):
    def test_generate_uses_store_false_and_prefers_output_text(self) -> None:
        mock_client = Mock()
        mock_client.post.return_value = build_response(
            200,
            {
                "id": "resp_123",
                "output_text": "  Hello from Responses.  ",
                "output": [],
            },
        )
        transport = OpenAIWireTransport(
            profile=build_profile(),
            api_key="sk-test",
            client_factory=lambda: mock_client,
        )
        client = OpenAIWireResponsesClient(transport)

        result = client.generate(
            model="gpt-5.4-mini",
            instructions="Summarize this.",
            input_text="Repo context",
            temperature=0.2,
        )

        self.assertEqual(result, "Hello from Responses.")
        mock_client.post.assert_called_once()
        kwargs = mock_client.post.call_args.kwargs
        self.assertEqual(kwargs["json"]["model"], "gpt-5.4-mini")
        self.assertEqual(kwargs["json"]["instructions"], "Summarize this.")
        self.assertEqual(kwargs["json"]["input"], "Repo context")
        self.assertEqual(kwargs["json"]["temperature"], 0.2)
        self.assertFalse(kwargs["json"]["store"])

    def test_generate_falls_back_to_typed_output(self) -> None:
        mock_client = Mock()
        mock_client.post.return_value = build_response(
            200,
            {
                "output_text": "",
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": "  Typed fallback text.  ",
                            }
                        ],
                    }
                ],
            },
        )
        transport = OpenAIWireTransport(
            profile=build_profile(),
            api_key="sk-test",
            client_factory=lambda: mock_client,
        )
        client = OpenAIWireResponsesClient(transport)

        result = client.generate(
            model="gpt-5.4-mini",
            instructions="Summarize this.",
            input_text="Repo context",
            temperature=0.2,
        )

        self.assertEqual(result, "Typed fallback text.")

    def test_generate_accepts_completed_sse_response_payloads(self) -> None:
        mock_client = Mock()
        mock_client.post.return_value = build_sse_response(
            200,
            {
                "id": "resp_123",
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": "READY",
                            }
                        ],
                    }
                ],
            },
        )
        transport = OpenAIWireTransport(
            profile=build_profile(
                provider_type="openai_compatible",
                base_url="http://127.0.0.1:11434",
            ),
            api_key="sk-test",
            client_factory=lambda: mock_client,
        )
        client = OpenAIWireResponsesClient(transport)

        result = client.generate(
            model="gpt-5.4",
            instructions="Reply READY.",
            input_text="READY",
            temperature=0.2,
        )

        self.assertEqual(result, "READY")

    def test_transport_maps_authentication_errors(self) -> None:
        mock_client = Mock()
        mock_client.post.return_value = build_response(
            401,
            {"error": {"message": "Invalid API key"}},
        )
        transport = OpenAIWireTransport(
            profile=build_profile(),
            api_key="bad-key",
            client_factory=lambda: mock_client,
        )

        with self.assertRaises(AIAuthenticationError):
            transport.post_json("/v1/responses", {"model": "gpt-5.4-mini"})

    def test_transport_maps_model_errors(self) -> None:
        mock_client = Mock()
        mock_client.post.return_value = build_response(
            404,
            {"error": {"message": "Model not found"}},
        )
        transport = OpenAIWireTransport(
            profile=build_profile(),
            api_key="sk-test",
            client_factory=lambda: mock_client,
        )

        with self.assertRaises(AIModelError):
            transport.post_json("/v1/responses", {"model": "missing-model"})

    def test_transport_maps_missing_responses_endpoint_to_unsupported_capability(self) -> None:
        mock_client = Mock()
        mock_client.post.return_value = build_response(
            404,
            {"error": {"message": "Unknown path /v1/responses"}},
        )
        transport = OpenAIWireTransport(
            profile=build_profile(provider_type="openai_compatible", base_url="http://127.0.0.1:8080"),
            api_key="sk-test",
            client_factory=lambda: mock_client,
        )

        with self.assertRaises(AIUnsupportedCapabilityError):
            transport.post_json("/v1/responses", {"model": "compatible-model"})

    def test_transport_maps_rate_limit_errors_with_numeric_retry_after(self) -> None:
        mock_client = Mock()
        mock_client.post.return_value = build_response_with_headers(
            429,
            {"error": {"message": "Rate limit exceeded"}},
            {"retry-after": "3"},
        )
        transport = OpenAIWireTransport(
            profile=build_profile(),
            api_key="sk-test",
            client_factory=lambda: mock_client,
        )

        with self.assertRaises(AIRateLimitError) as context:
            transport.post_json("/v1/embeddings", {"model": "text-embedding-3-small"})

        self.assertEqual(context.exception.provider_label, "Provider 1")
        self.assertEqual(context.exception.status_code, 429)
        self.assertEqual(context.exception.retry_after_seconds, 3.0)

    def test_transport_maps_rate_limit_errors_with_http_date_retry_after(self) -> None:
        retry_after = (datetime.now(timezone.utc) + timedelta(seconds=4)).strftime(
            "%a, %d %b %Y %H:%M:%S GMT"
        )
        mock_client = Mock()
        mock_client.post.return_value = build_response_with_headers(
            429,
            {"error": {"message": "Rate limit exceeded"}},
            {"retry-after": retry_after},
        )
        transport = OpenAIWireTransport(
            profile=build_profile(),
            api_key="sk-test",
            client_factory=lambda: mock_client,
        )

        with self.assertRaises(AIRateLimitError) as context:
            transport.post_json("/v1/embeddings", {"model": "text-embedding-3-small"})

        self.assertIsNotNone(context.exception.retry_after_seconds)
        self.assertGreaterEqual(context.exception.retry_after_seconds, 0.0)

    def test_transport_maps_rate_limit_errors_without_retry_after(self) -> None:
        mock_client = Mock()
        mock_client.post.return_value = build_response(
            429,
            {"error": {"message": "Rate limit exceeded"}},
        )
        transport = OpenAIWireTransport(
            profile=build_profile(),
            api_key="sk-test",
            client_factory=lambda: mock_client,
        )

        with self.assertRaises(AIRateLimitError) as context:
            transport.post_json("/v1/embeddings", {"model": "text-embedding-3-small"})

        self.assertIsNone(context.exception.retry_after_seconds)

    def test_transport_ignores_invalid_retry_after_headers(self) -> None:
        mock_client = Mock()
        mock_client.post.return_value = build_response_with_headers(
            429,
            {"error": {"message": "Rate limit exceeded"}},
            {"retry-after": "not-a-date"},
        )
        transport = OpenAIWireTransport(
            profile=build_profile(),
            api_key="sk-test",
            client_factory=lambda: mock_client,
        )

        with self.assertRaises(AIRateLimitError) as context:
            transport.post_json("/v1/embeddings", {"model": "text-embedding-3-small"})

        self.assertIsNone(context.exception.retry_after_seconds)


class OpenAIWireEmbeddingClientTests(unittest.TestCase):
    def test_embed_returns_vectors_and_dimensions(self) -> None:
        mock_client = Mock()
        mock_client.post.return_value = build_response(
            200,
            {
                "data": [
                    {"embedding": [0.1, 0.2, 0.3]},
                    {"embedding": [0.4, 0.5, 0.6]},
                ]
            },
        )
        transport = OpenAIWireTransport(
            profile=build_profile(),
            api_key="sk-test",
            client_factory=lambda: mock_client,
        )
        client = OpenAIWireEmbeddingClient(transport)

        result = client.embed(
            model="text-embedding-3-small",
            inputs=["first", "second"],
        )

        self.assertEqual(result.embeddings, [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]])
        self.assertEqual(result.dimensions, 3)
        self.assertEqual(mock_client.post.call_args.kwargs["json"]["input"], ["first", "second"])


if __name__ == "__main__":
    unittest.main()
