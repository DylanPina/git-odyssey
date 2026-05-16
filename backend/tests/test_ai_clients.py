import json
import unittest
from unittest.mock import Mock

import httpx

from infrastructure.ai_clients import (
    GoogleDeploymentService,
    GoogleModelGardenCatalog,
    GoogleVertexEmbeddingClient,
    GoogleVertexRegistry,
    GoogleVertexRestTransport,
    GoogleVertexTextClient,
)
from infrastructure.ai_runtime import AIRuntimeConfig, CapabilityBindings, GoogleAITarget
from infrastructure.errors import (
    AIAuthenticationError,
    AIModelError,
    AIRequestError,
    AIUnsupportedCapabilityError,
)


def build_config() -> AIRuntimeConfig:
    return AIRuntimeConfig(
        schema_version=2,
        google_project_id="git-odyssey-test",
        google_location="us-central1",
        capabilities=CapabilityBindings(),
    )


def build_text_target(**overrides: object) -> GoogleAITarget:
    payload = {
        "target_kind": "managed_model",
        "resource_name": "publishers/google/models/gemini-2.5-flash",
        "display_name": "Gemini 2.5 Flash",
        "publisher": "google",
        "version": "2.5",
        "location": "us-central1",
        "capabilities": ["text_generation", "review"],
        "adapter_family": "gemini",
        "source": "managed_api_model",
    }
    payload.update(overrides)
    return GoogleAITarget(**payload)


def build_embedding_target(**overrides: object) -> GoogleAITarget:
    payload = {
        "target_kind": "managed_model",
        "resource_name": "publishers/google/models/text-embedding-005",
        "display_name": "Text Embedding 005",
        "publisher": "google",
        "version": "005",
        "location": "us-central1",
        "capabilities": ["embeddings"],
        "adapter_family": "text_embedding",
        "source": "managed_api_model",
    }
    payload.update(overrides)
    return GoogleAITarget(**payload)


def build_response(status_code: int, payload: dict) -> httpx.Response:
    request = httpx.Request("POST", "https://us-central1-aiplatform.googleapis.com/v1/test")
    return httpx.Response(status_code, request=request, json=payload)


class GoogleVertexTransportTests(unittest.TestCase):
    def test_resolve_resource_expands_publisher_models(self) -> None:
        transport = GoogleVertexRestTransport(
            config=build_config(),
            client_factory=lambda: Mock(),
            token_provider=lambda: "token",
        )

        self.assertEqual(
            transport.resolve_resource(build_text_target()),
            "projects/git-odyssey-test/locations/us-central1/"
            "publishers/google/models/gemini-2.5-flash",
        )

    def test_request_json_maps_vertex_auth_and_model_errors(self) -> None:
        mock_client = Mock()
        mock_client.request.return_value = build_response(
            403,
            {"error": {"message": "ADC denied"}},
        )
        transport = GoogleVertexRestTransport(
            config=build_config(),
            client_factory=lambda: mock_client,
            token_provider=lambda: "bad-token",
        )

        with self.assertRaises(AIAuthenticationError):
            transport.request_json("GET", "projects/git-odyssey-test/locations/us-central1/endpoints")

        mock_client.request.return_value = build_response(
            404,
            {"error": {"message": "Model not found"}},
        )
        with self.assertRaises(AIModelError):
            transport.request_json("POST", "missing:model", json_body={})

    def test_request_json_rejects_non_json_success_payloads(self) -> None:
        request = httpx.Request("GET", "https://us-central1-aiplatform.googleapis.com/v1/test")
        mock_client = Mock()
        mock_client.request.return_value = httpx.Response(200, request=request, text="not-json")
        transport = GoogleVertexRestTransport(
            config=build_config(),
            client_factory=lambda: mock_client,
            token_provider=lambda: "token",
        )

        with self.assertRaises(AIRequestError):
            transport.request_json("GET", "test")


class GoogleVertexTextClientTests(unittest.TestCase):
    def test_managed_gemini_uses_generate_content_with_schema(self) -> None:
        mock_client = Mock()
        mock_client.request.return_value = build_response(
            200,
            {
                "candidates": [
                    {"content": {"parts": [{"text": '{"summary":"ready","findings":[]}'}]}}
                ]
            },
        )
        transport = GoogleVertexRestTransport(
            config=build_config(),
            client_factory=lambda: mock_client,
            token_provider=lambda: "token",
        )
        client = GoogleVertexTextClient(transport)

        result = client.generate(
            target=build_text_target(),
            instructions="Return JSON only.",
            input_text="Probe",
            temperature=0.0,
            response_schema={
                "type": "object",
                "required": ["summary", "findings"],
                "properties": {"summary": {"type": "string"}, "findings": {"type": "array"}},
            },
        )

        self.assertEqual(json.loads(result)["findings"], [])
        kwargs = mock_client.request.call_args.kwargs
        self.assertTrue(mock_client.request.call_args.args[1].endswith(":generateContent"))
        self.assertEqual(kwargs["json"]["systemInstruction"]["parts"][0]["text"], "Return JSON only.")
        self.assertEqual(kwargs["json"]["generationConfig"]["responseMimeType"], "application/json")

    def test_vertex_endpoint_uses_predict_adapter(self) -> None:
        mock_client = Mock()
        mock_client.request.return_value = build_response(
            200,
            {"predictions": [{"generated_text": "READY"}]},
        )
        transport = GoogleVertexRestTransport(
            config=build_config(),
            client_factory=lambda: mock_client,
            token_provider=lambda: "token",
        )
        client = GoogleVertexTextClient(transport)

        result = client.generate(
            target=build_text_target(
                target_kind="vertex_endpoint",
                resource_name="projects/git-odyssey-test/locations/us-central1/endpoints/123",
                display_name="Endpoint 123",
                adapter_family="vertex_predict_text",
            ),
            instructions="Reply READY.",
            input_text="Probe",
            temperature=0.2,
        )

        self.assertEqual(result, "READY")
        self.assertTrue(mock_client.request.call_args.args[1].endswith(":predict"))
        self.assertIn("Reply READY.", mock_client.request.call_args.kwargs["json"]["instances"][0]["prompt"])

    def test_text_client_rejects_unvalidated_targets(self) -> None:
        transport = GoogleVertexRestTransport(
            config=build_config(),
            client_factory=lambda: Mock(),
            token_provider=lambda: "token",
        )
        client = GoogleVertexTextClient(transport)

        with self.assertRaises(AIUnsupportedCapabilityError):
            client.generate(
                target=build_embedding_target(),
                instructions="Reply READY.",
                input_text="Probe",
                temperature=0.0,
            )


class GoogleVertexEmbeddingClientTests(unittest.TestCase):
    def test_embed_returns_vectors_and_dimensions(self) -> None:
        mock_client = Mock()
        mock_client.request.return_value = build_response(
            200,
            {
                "predictions": [
                    {"embeddings": {"values": [0.1, 0.2, 0.3]}},
                    {"embeddings": {"values": [0.4, 0.5, 0.6]}},
                ]
            },
        )
        transport = GoogleVertexRestTransport(
            config=build_config(),
            client_factory=lambda: mock_client,
            token_provider=lambda: "token",
        )
        client = GoogleVertexEmbeddingClient(transport)

        result = client.embed(
            target=build_embedding_target(embedding_output_dimension=3),
            inputs=["first", "second"],
        )

        self.assertEqual(result.embeddings, [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]])
        self.assertEqual(result.dimensions, 3)
        payload = mock_client.request.call_args.kwargs["json"]
        self.assertEqual(payload["instances"][0]["content"], "first")
        self.assertEqual(payload["parameters"]["outputDimensionality"], 3)


class GoogleModelGardenCatalogTests(unittest.TestCase):
    def test_catalog_normalizes_managed_models_and_existing_endpoints(self) -> None:
        mock_client = Mock()
        mock_client.request.side_effect = [
            build_response(
                200,
                {
                    "publisherModels": [
                        {
                            "name": "publishers/google/models/gemini-2.5-flash",
                            "displayName": "Gemini 2.5 Flash",
                            "launchStage": "GA",
                        }
                    ]
                },
            ),
            build_response(200, {"publisherModels": []}),
            build_response(200, {"publisherModels": []}),
            build_response(200, {"publisherModels": []}),
            build_response(200, {"publisherModels": []}),
            build_response(
                200,
                {
                    "endpoints": [
                        {
                            "name": "projects/git-odyssey-test/locations/us-central1/endpoints/123",
                            "displayName": "Chat endpoint",
                            "deployedModels": [{"displayName": "llama instruct"}],
                        }
                    ]
                },
            ),
        ]
        transport = GoogleVertexRestTransport(
            config=build_config(),
            client_factory=lambda: mock_client,
            token_provider=lambda: "token",
        )

        entries = GoogleModelGardenCatalog(transport).list()

        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[0].source, "managed_api_model")
        self.assertIn("text_generation", entries[0].capabilities)
        self.assertEqual(entries[1].target_kind, "vertex_endpoint")
        self.assertEqual(entries[1].source, "vertex_endpoint")
        self.assertIn("review", entries[1].capabilities)


class GoogleDeploymentServiceTests(unittest.TestCase):
    def test_construct_deployment_request_includes_machine_and_accelerator(self) -> None:
        transport = GoogleVertexRestTransport(
            config=build_config(),
            client_factory=lambda: Mock(),
            token_provider=lambda: "token",
        )
        service = GoogleDeploymentService(transport)

        request = service.construct_deployment_request(
            model_resource_name="publishers/google/models/model-1",
            endpoint_resource_name="projects/git-odyssey-test/locations/us-central1/endpoints/123",
            deployed_model_display_name="Model 1",
            machine_type="n1-standard-4",
            accelerator_type="NVIDIA_TESLA_T4",
            accelerator_count=1,
            min_replica_count=1,
            max_replica_count=2,
        )

        dedicated = request["body"]["deployedModel"]["dedicatedResources"]
        self.assertEqual(request["endpoint"], "projects/git-odyssey-test/locations/us-central1/endpoints/123")
        self.assertEqual(dedicated["machineSpec"]["machineType"], "n1-standard-4")
        self.assertEqual(dedicated["machineSpec"]["acceleratorType"], "NVIDIA_TESLA_T4")
        self.assertEqual(dedicated["maxReplicaCount"], 2)


class GoogleVertexRegistryTests(unittest.TestCase):
    def test_validate_review_target_requires_structured_json(self) -> None:
        mock_client = Mock()
        mock_client.request.return_value = build_response(
            200,
            {
                "candidates": [
                    {"content": {"parts": [{"text": '{"summary":"ready","findings":[]}'}]}}
                ]
            },
        )
        registry = GoogleVertexRegistry(
            config=build_config(),
            client_factory=lambda: mock_client,
            token_provider=lambda: "token",
        )

        result = registry.validate_target(capability="review", target=build_text_target())

        self.assertTrue(result["ready"])
        self.assertEqual(result["message"], "Validated successfully.")

    def test_validate_embedding_target_records_observed_dimension(self) -> None:
        mock_client = Mock()
        mock_client.request.return_value = build_response(
            200,
            {"predictions": [{"embeddings": {"values": [0.1, 0.2]}}]},
        )
        registry = GoogleVertexRegistry(
            config=build_config(),
            client_factory=lambda: mock_client,
            token_provider=lambda: "token",
        )

        result = registry.validate_target(
            capability="embeddings",
            target=build_embedding_target(),
        )

        self.assertTrue(result["ready"])
        self.assertEqual(result["embedding_output_dimension"], 2)


if __name__ == "__main__":
    unittest.main()
