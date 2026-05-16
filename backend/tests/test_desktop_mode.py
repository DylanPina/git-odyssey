import asyncio
import json
import unittest
from unittest.mock import Mock

from api.dependencies import get_current_user
from api.routers.desktop import desktop_health
from data.data_model import User
from infrastructure.settings import Settings
from sqlalchemy.exc import IntegrityError


DEFAULT = object()


def build_google_runtime_config(
    embeddings_binding=DEFAULT,
) -> str:
    embeddings_target = {
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
    }
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
                "embeddings": (
                    embeddings_target
                    if embeddings_binding is DEFAULT
                    else embeddings_binding
                ),
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


def build_settings(**overrides) -> Settings:
    return Settings(
        database_url="postgresql://user:pass@localhost:5432/gitodyssey",
        database_sslmode="disable",
        **overrides,
    )


class DesktopModeDependencyTests(unittest.TestCase):
    def test_get_current_user_returns_local_pseudo_user(self) -> None:
        settings = build_settings(
            desktop_user_id=7,
            desktop_user_username="desktop-user",
            desktop_user_email="desktop@example.com",
        )
        session = Mock()
        session.query.return_value.filter.return_value.first.return_value = None
        db_adapter = Mock()
        expected_user = User(
            id=7,
            username="desktop-user",
            email="desktop@example.com",
            api_credits_remaining=100,
        )
        db_adapter.parse_sql_user.return_value = expected_user

        user = get_current_user(
            session=session,
            settings=settings,
            db_adapter=db_adapter,
        )

        self.assertEqual(user, expected_user)
        session.add.assert_called_once()
        session.commit.assert_called_once()
        session.refresh.assert_called_once()
        db_adapter.parse_sql_user.assert_called_once()

    def test_desktop_health_reports_capability_status(self) -> None:
        settings = build_settings(
            ai_runtime_config_json=build_google_runtime_config(),
            ai_secret_values_json="{}",
        )
        session = Mock()
        (
            session.query.return_value.outerjoin.return_value.filter.return_value.first.return_value
        ) = None

        payload = asyncio.run(desktop_health(session=session, settings=settings))

        self.assertTrue(payload["authentication"]["desktop_backend_reachable"])
        self.assertTrue(payload["ai"]["text_generation"]["configured"])
        self.assertTrue(payload["ai"]["text_generation"]["ready"])
        self.assertEqual(
            payload["ai"]["text_generation"]["resource_name"],
            "publishers/google/models/gemini-2.5-flash",
        )
        self.assertTrue(payload["ai"]["review"]["ready"])
        self.assertEqual(payload["ai"]["google"]["project_id"], "git-odyssey-test")
        self.assertFalse(payload["ai"]["embeddings"]["reindex_required"])

    def test_desktop_health_flags_reindex_for_mismatched_embedding_profile(self) -> None:
        settings = build_settings(
            ai_runtime_config_json=build_google_runtime_config(),
            ai_secret_values_json="{}",
        )
        session = Mock()
        (
            session.query.return_value.outerjoin.return_value.filter.return_value.first.return_value
        ) = object()

        payload = asyncio.run(desktop_health(session=session, settings=settings))

        self.assertTrue(payload["ai"]["embeddings"]["reindex_required"])

    def test_desktop_health_skips_reindex_query_when_embeddings_disabled(self) -> None:
        settings = build_settings(
            ai_runtime_config_json=build_google_runtime_config(embeddings_binding=None),
            ai_secret_values_json="{}",
        )
        session = Mock()

        payload = asyncio.run(desktop_health(session=session, settings=settings))

        self.assertFalse(payload["ai"]["embeddings"]["reindex_required"])
        session.query.assert_not_called()

    def test_get_current_user_recovers_from_duplicate_insert_race(self) -> None:
        settings = build_settings(
            desktop_user_id=7,
            desktop_user_username="desktop-user",
            desktop_user_email="desktop@example.com",
        )
        session = Mock()
        query_result = session.query.return_value
        filter_result = query_result.filter.return_value
        existing_sql_user = Mock()
        filter_result.first.side_effect = [None, existing_sql_user]
        session.commit.side_effect = IntegrityError("insert", {}, Exception("duplicate"))
        db_adapter = Mock()
        expected_user = User(
            id=7,
            username="desktop-user",
            email="desktop@example.com",
            api_credits_remaining=100,
        )
        db_adapter.parse_sql_user.return_value = expected_user

        user = get_current_user(
            session=session,
            settings=settings,
            db_adapter=db_adapter,
        )

        self.assertEqual(user, expected_user)
        session.rollback.assert_called_once()
        self.assertEqual(filter_result.first.call_count, 2)


if __name__ == "__main__":
    unittest.main()
