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
from infrastructure.errors import AIConfigurationError
from infrastructure.errors import MissingConfigurationError


def build_runtime_config() -> str:
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


BASE_ENV = {
    "DATABASE_URL": "postgresql://user:pass@localhost:5432/gitodyssey",
    "DATABASE_SSLMODE": "disable",
    "AI_RUNTIME_CONFIG_JSON": build_runtime_config(),
    "AI_SECRET_VALUES_JSON": json.dumps(
        {"provider:openai-default:api-key": "test-openai-key"}
    ),
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

    def test_settings_load_desktop_defaults(self) -> None:
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
        self.assertEqual(settings.desktop_user_username, "local-user")
        self.assertEqual(settings.desktop_user_email, "local@gitodyssey.app")
        self.assertEqual(runtime.capabilities.text_generation.model_id, "gpt-5.4-mini")
        self.assertEqual(runtime.capabilities.embeddings.model_id, "text-embedding-3-small")
        self.assertEqual(
            secret_values["provider:openai-default:api-key"],
            "test-openai-key",
        )

    def test_ai_components_use_structured_runtime_defaults(self) -> None:
        with patch.dict(os.environ, BASE_ENV, clear=True):
            ai_engine = get_ai_engine()
            embedder = get_embedding_engine()

        self.assertEqual(ai_engine.model, "gpt-5.4-mini")
        self.assertIsNotNone(embedder)
        self.assertEqual(embedder.model, "text-embedding-3-small")

    def test_missing_ai_runtime_config_fails_when_text_client_is_requested(self) -> None:
        with patch.dict(
            os.environ,
            {
                "DATABASE_URL": "postgresql://user:pass@localhost:5432/gitodyssey",
                "DATABASE_SSLMODE": "disable",
            },
            clear=True,
        ):
            with self.assertRaises(AIConfigurationError):
                get_text_client()

    def test_missing_provider_secret_fails_when_text_client_is_requested(self) -> None:
        with patch.dict(
            os.environ,
            {
                "DATABASE_URL": "postgresql://user:pass@localhost:5432/gitodyssey",
                "DATABASE_SSLMODE": "disable",
                "AI_RUNTIME_CONFIG_JSON": build_runtime_config(),
            },
            clear=True,
        ):
            with self.assertRaises(MissingConfigurationError):
                get_text_client()


if __name__ == "__main__":
    unittest.main()
