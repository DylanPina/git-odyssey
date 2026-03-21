from dataclasses import dataclass
from typing import Callable

from sqlalchemy import text

import infrastructure.db as db
from infrastructure.ai_runtime import (
    DEFAULT_EMBEDDING_MODEL,
    OPENAI_DEFAULT_BASE_URL,
    compute_embedding_fingerprint,
    load_ai_runtime_config,
)
from infrastructure.errors import AIConfigurationError
from infrastructure.settings import Settings
from utils.logger import logger


@dataclass(frozen=True)
class Migration:
    version: str
    run: Callable


def _ensure_schema_migrations_table(connection) -> None:
    connection.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
    )


def _detect_legacy_dimension(connection) -> int | None:
    for table_name in ("commits", "file_changes", "diff_hunks"):
        row = connection.execute(
            text(
                f"""
                SELECT embedding
                FROM {table_name}
                WHERE embedding IS NOT NULL
                LIMIT 1
                """
            )
        ).first()
        if row is None or row[0] is None:
            continue
        try:
            return len(row[0])
        except TypeError:
            continue
    return None


def _upsert_legacy_embedding_profile(
    connection,
    *,
    model_id: str,
    observed_dimension: int,
) -> int:
    fingerprint = compute_embedding_fingerprint(
        provider_type="openai",
        base_url=OPENAI_DEFAULT_BASE_URL,
        model_id=model_id,
    )
    return connection.execute(
        text(
            """
            INSERT INTO embedding_profiles (
                fingerprint,
                provider_type,
                base_url,
                model_id,
                observed_dimension
            )
            VALUES (
                :fingerprint,
                'openai',
                :base_url,
                :model_id,
                :observed_dimension
            )
            ON CONFLICT (fingerprint)
            DO UPDATE SET
                observed_dimension = COALESCE(
                    embedding_profiles.observed_dimension,
                    EXCLUDED.observed_dimension
                ),
                updated_at = NOW()
            RETURNING id
            """
        ),
        {
            "fingerprint": fingerprint,
            "base_url": OPENAI_DEFAULT_BASE_URL,
            "model_id": model_id,
            "observed_dimension": observed_dimension,
        },
    ).scalar_one()


def _resolve_legacy_embedding_model(settings: Settings) -> str:
    try:
        config = load_ai_runtime_config(settings)
    except AIConfigurationError:
        return DEFAULT_EMBEDDING_MODEL

    binding = config.capabilities.embeddings
    if binding is None:
        return DEFAULT_EMBEDDING_MODEL

    profile = config.get_profile(binding.provider_profile_id)
    if profile.provider_type != "openai":
        return DEFAULT_EMBEDDING_MODEL

    return binding.model_id or DEFAULT_EMBEDDING_MODEL


def _backfill_legacy_embeddings(connection, settings: Settings) -> None:
    observed_dimension = _detect_legacy_dimension(connection)
    if observed_dimension is None:
        return

    legacy_profile_id = _upsert_legacy_embedding_profile(
        connection,
        model_id=_resolve_legacy_embedding_model(settings),
        observed_dimension=observed_dimension,
    )

    connection.execute(
        text(
            """
            UPDATE commits
            SET semantic_embedding = embedding
            WHERE semantic_embedding IS NULL
              AND embedding IS NOT NULL
            """
        )
    )
    connection.execute(
        text(
            """
            UPDATE file_changes
            SET semantic_embedding = embedding
            WHERE semantic_embedding IS NULL
              AND embedding IS NOT NULL
            """
        )
    )
    connection.execute(
        text(
            """
            UPDATE diff_hunks
            SET semantic_embedding = embedding
            WHERE semantic_embedding IS NULL
              AND embedding IS NOT NULL
            """
        )
    )
    connection.execute(
        text(
            """
            UPDATE repos
            SET embedding_profile_id = :legacy_profile_id,
                reindex_required = FALSE
            WHERE embedding_profile_id IS NULL
              AND EXISTS (
                  SELECT 1
                  FROM commits
                  WHERE commits.repo_path = repos.path
                    AND (
                        commits.semantic_embedding IS NOT NULL
                        OR commits.embedding IS NOT NULL
                    )
              )
            """
        ),
        {"legacy_profile_id": legacy_profile_id},
    )


def _ai_runtime_schema_migration(connection, settings: Settings) -> None:
    connection.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS embedding_profiles (
                id SERIAL PRIMARY KEY,
                fingerprint VARCHAR(64) NOT NULL UNIQUE,
                provider_type VARCHAR(64) NOT NULL,
                base_url TEXT NOT NULL,
                model_id TEXT NOT NULL,
                observed_dimension INTEGER,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE repos
            ADD COLUMN IF NOT EXISTS embedding_profile_id INTEGER REFERENCES embedding_profiles(id)
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE repos
            ADD COLUMN IF NOT EXISTS reindex_required BOOLEAN NOT NULL DEFAULT FALSE
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE commits
            ADD COLUMN IF NOT EXISTS semantic_embedding vector
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE file_changes
            ADD COLUMN IF NOT EXISTS semantic_embedding vector
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE diff_hunks
            ADD COLUMN IF NOT EXISTS semantic_embedding vector
            """
        )
    )
    connection.execute(
        text(
            """
            CREATE INDEX IF NOT EXISTS idx_embedding_profiles_fingerprint
            ON embedding_profiles (fingerprint)
            """
        )
    )
    _backfill_legacy_embeddings(connection, settings)


MIGRATIONS = [
    Migration(
        version="20260321_ai_runtime_embeddings",
        run=_ai_runtime_schema_migration,
    )
]


def run_migrations(settings: Settings) -> None:
    if db.engine is None:
        raise RuntimeError("Database engine not initialized. Call init_db() first.")

    with db.engine.begin() as connection:
        _ensure_schema_migrations_table(connection)
        applied_versions = set(
            connection.execute(text("SELECT version FROM schema_migrations")).scalars()
        )

        for migration in MIGRATIONS:
            if migration.version in applied_versions:
                continue

            logger.info("Applying schema migration %s", migration.version)
            migration.run(connection, settings)
            connection.execute(
                text(
                    """
                    INSERT INTO schema_migrations (version)
                    VALUES (:version)
                    """
                ),
                {"version": migration.version},
            )
