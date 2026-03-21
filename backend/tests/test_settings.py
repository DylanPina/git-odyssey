import os
import unittest
from unittest.mock import patch

from api.dependencies import (
    get_ai_engine,
    get_openai_client,
    get_openai_embedder,
    get_settings,
)
from infrastructure.errors import MissingConfigurationError


BASE_ENV = {
    "DATABASE_URL": "postgresql://user:pass@localhost:5432/gitodyssey",
    "DATABASE_SSLMODE": "disable",
    "OPENAI_API_KEY": "test-openai-key",
}


class SettingsTests(unittest.TestCase):
    def tearDown(self) -> None:
        get_settings.cache_clear()
        get_openai_client.cache_clear()
        get_openai_embedder.cache_clear()
        get_ai_engine.cache_clear()

    def test_settings_load_desktop_defaults(self) -> None:
        with patch.dict(os.environ, BASE_ENV, clear=True):
            settings = get_settings()

        self.assertEqual(
            settings.database_url,
            "postgresql://user:pass@localhost:5432/gitodyssey",
        )
        self.assertEqual(settings.database_sslmode, "disable")
        self.assertEqual(settings.openai_api_key, "test-openai-key")
        self.assertEqual(settings.openai_text_model, "gpt-5.4-mini")
        self.assertEqual(settings.openai_embedding_model, "text-embedding-3-small")
        self.assertEqual(settings.desktop_user_username, "local-user")
        self.assertEqual(settings.desktop_user_email, "local@gitodyssey.app")

    def test_openai_components_use_desktop_models(self) -> None:
        with patch.dict(os.environ, BASE_ENV, clear=True):
            client = get_openai_client()
            ai_engine = get_ai_engine()
            embedder = get_openai_embedder()

        self.assertIs(ai_engine.client, client)
        self.assertIs(embedder.client, client)
        self.assertEqual(ai_engine.model, "gpt-5.4-mini")
        self.assertEqual(embedder.model, "text-embedding-3-small")

    def test_missing_openai_api_key_fails_when_client_is_requested(self) -> None:
        with patch.dict(
            os.environ,
            {
                "DATABASE_URL": "postgresql://user:pass@localhost:5432/gitodyssey",
                "DATABASE_SSLMODE": "disable",
            },
            clear=True,
        ):
            with self.assertRaises(MissingConfigurationError):
                get_openai_client()


if __name__ == "__main__":
    unittest.main()
