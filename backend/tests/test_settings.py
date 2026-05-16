import json
import os
import unittest
from unittest.mock import patch

from api.dependencies import (
    get_ai_engine,
    get_ai_runtime_config,
    get_ai_secret_values,
    get_embedding_client,
    get_embedding_engine,
    get_provider_registry,
    get_settings,
    get_text_client,
)
from infrastructure.ai_runtime import (
    AST_ENABLED_LANGUAGES,
    AST_SCHEMA_VERSION,
    DOCUMENT_SCHEMA_VERSION,
    compute_embedding_fingerprint,
)
from infrastructure.errors import AIConfigurationError, MissingConfigurationError


def build_legacy_openai_runtime_config() -> str:
    return json.dumps(
        {
            "schema_version": 1,
            "profiles": [
                {
                    "id": "openai-default",
                    "provider_type": "openai",
                    "label": "OpenAI",
                    "base_url": "https://api.openai.com",
                    "auth_mode": "bearer",
                    "api_key_secret_ref": "provider:openai-default:api-key",
                    "supports_text_generation": True,
                    "supports_embeddings": True,
                }
            ],
            "capabilities": {
                "text_generation": {
                    "provider_profile_id": "openai-default",
                    "model_id": "gpt-5.4-mini",
                    "temperature": 0.2,
                },
                "embeddings": {
                    "provider_profile_id": "openai-default",
                    "model_id": "text-embedding-3-small",
                },
            },
        }
    )


def build_google_runtime_config() -> str:
    return json.dumps(
        {
            "schema_version": 2,
            "google_project_id": "git-odyssey-test",
            "google_location": "us-central1",
            "capabilities": {
                "text_generation": {
                    "target_kind": "managed_model",
                    "resource_name": "publishers/google/models/gemini-2.5-flash",
                    "display_name": "Gemini 2.5 Flash",
                    "publisher": "google",
                    "version": "2.5",
                    "location": "us-central1",
                    "capabilities": ["text_generation"],
                    "adapter_family": "gemini",
                    "source": "managed_api_model",
                },
                "embeddings": {
                    "target_kind": "managed_model",
                    "resource_name": "publishers/google/models/text-embedding-005",
                    "display_name": "Text Embedding 005",
                    "publisher": "google",
                    "version": "005",
                    "location": "us-central1",
                    "capabilities": ["embeddings"],
                    "adapter_family": "text_embedding",
                    "embedding_output_dimension": 768,
                    "source": "managed_api_model",
                },
                "review": {
                    "target_kind": "managed_model",
                    "resource_name": "publishers/google/models/gemini-2.5-pro",
                    "display_name": "Gemini 2.5 Pro",
                    "publisher": "google",
                    "version": "2.5",
                    "location": "us-central1",
                    "capabilities": ["review"],
                    "adapter_family": "gemini",
                    "source": "managed_api_model",
                },
            },
        }
    )


BASE_ENV = {
    "DATABASE_URL": "postgresql://user:pass@localhost:5432/gitodyssey",
    "DATABASE_SSLMODE": "disable",
    "AI_RUNTIME_CONFIG_JSON": build_legacy_openai_runtime_config(),
    "AI_SECRET_VALUES_JSON": json.dumps(
        {"provider:openai-default:api-key": "test-openai-key"}
    ),
}


GOOGLE_ENV = {
    **BASE_ENV,
    "AI_RUNTIME_CONFIG_JSON": build_google_runtime_config(),
    "AI_SECRET_VALUES_JSON": "{}",
}


class SettingsTests(unittest.TestCase):
    def tearDown(self) -> None:
        get_settings.cache_clear()
        get_ai_runtime_config.cache_clear()
        get_ai_secret_values.cache_clear()
        get_provider_registry.cache_clear()
        get_text_client.cache_clear()
        get_embedding_client.cache_clear()
        get_embedding_engine.cache_clear()
        get_ai_engine.cache_clear()

    def test_settings_migrates_legacy_openai_runtime_to_empty_google_setup(self) -> None:
        with patch.dict(os.environ, BASE_ENV, clear=True):
            settings = get_settings()
            runtime = get_ai_runtime_config()
            secret_values = get_ai_secret_values()

        self.assertEqual(
            settings.database_url,
            "postgresql://user:pass@localhost:5432/gitodyssey",
        )
        self.assertEqual(settings.database_sslmode, "disable")
        self.assertEqual(settings.ai_runtime_config_json, BASE_ENV["AI_RUNTIME_CONFIG_JSON"])
        self.assertEqual(settings.ai_secret_values_json, BASE_ENV["AI_SECRET_VALUES_JSON"])
        self.assertEqual(settings.ingest_flush_size, 100)
        self.assertEqual(settings.desktop_user_username, "local-user")
        self.assertEqual(settings.desktop_user_email, "local@gitodyssey.app")
        self.assertEqual(runtime.schema_version, 2)
        self.assertIsNone(runtime.google_project_id)
        self.assertEqual(runtime.google_location, "us-central1")
        self.assertIsNone(runtime.capabilities.text_generation)
        self.assertIsNone(runtime.capabilities.embeddings)
        self.assertIsNone(runtime.capabilities.review)
        self.assertEqual(
            secret_values["provider:openai-default:api-key"],
            "test-openai-key",
        )

    def test_ai_components_use_google_runtime_targets(self) -> None:
        with patch.dict(os.environ, GOOGLE_ENV, clear=True):
            ai_engine = get_ai_engine()
            embedder = get_embedding_engine()

        self.assertEqual(
            ai_engine.target.resource_name,
            "publishers/google/models/gemini-2.5-flash",
        )
        self.assertIsNotNone(embedder)
        assert embedder is not None
        self.assertEqual(
            embedder.target.resource_name,
            "publishers/google/models/text-embedding-005",
        )
        self.assertEqual(embedder.max_concurrency, 4)
        self.assertEqual(embedder.google_project_id, "git-odyssey-test")

    def test_missing_ai_runtime_config_fails_when_text_client_is_requested(self) -> None:
        with patch.dict(
            os.environ,
            {
                "DATABASE_URL": "postgresql://user:pass@localhost:5432/gitodyssey",
                "DATABASE_SSLMODE": "disable",
            },
            clear=True,
        ):
            with self.assertRaises(MissingConfigurationError):
                get_text_client()

    def test_missing_google_project_fails_when_text_client_is_requested(self) -> None:
        payload = json.loads(build_google_runtime_config())
        payload["google_project_id"] = None
        with patch.dict(
            os.environ,
            {
                **BASE_ENV,
                "AI_RUNTIME_CONFIG_JSON": json.dumps(payload),
                "AI_SECRET_VALUES_JSON": "{}",
            },
            clear=True,
        ):
            with self.assertRaises(AIConfigurationError):
                get_text_client()

    def test_embedding_fingerprint_changes_when_ast_versions_change(self) -> None:
        current = compute_embedding_fingerprint(
            target_kind="managed_model",
            resource_name="publishers/google/models/text-embedding-005",
            project_id="git-odyssey-test",
            location="us-central1",
            adapter_family="text_embedding",
            observed_dimension=768,
            document_schema_version=DOCUMENT_SCHEMA_VERSION,
            ast_schema_version=AST_SCHEMA_VERSION,
            ast_enabled_languages=AST_ENABLED_LANGUAGES,
        )
        old_ast_version = compute_embedding_fingerprint(
            target_kind="managed_model",
            resource_name="publishers/google/models/text-embedding-005",
            project_id="git-odyssey-test",
            location="us-central1",
            adapter_family="text_embedding",
            observed_dimension=768,
            document_schema_version=DOCUMENT_SCHEMA_VERSION,
            ast_schema_version=0,
            ast_enabled_languages=(),
        )

        self.assertNotEqual(current, old_ast_version)


if __name__ == "__main__":
    unittest.main()
