import asyncio
import unittest
from unittest.mock import Mock

from api.dependencies import get_current_user
from api.routers.desktop import desktop_health
from data.data_model import User
from infrastructure.settings import Settings
from sqlalchemy.exc import IntegrityError


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

    def test_desktop_health_reports_openai_only_credentials(self) -> None:
        settings = build_settings(openai_api_key="sk-test")

        payload = asyncio.run(desktop_health(settings=settings))

        self.assertEqual(
            payload["credentials"],
            {
                "has_openai_api_key": True,
            },
        )
        self.assertNotIn("github_id", payload["desktop_user"])

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
