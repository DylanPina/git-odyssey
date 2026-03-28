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


def _review_sessions_schema_migration(connection, settings: Settings) -> None:
    connection.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS review_sessions (
                id VARCHAR(64) PRIMARY KEY,
                repo_path TEXT NOT NULL,
                base_ref TEXT NOT NULL,
                head_ref TEXT NOT NULL,
                merge_base_sha VARCHAR(40) NOT NULL,
                base_head_sha VARCHAR(40) NOT NULL,
                head_head_sha VARCHAR(40) NOT NULL,
                stats JSONB NOT NULL,
                file_changes JSONB NOT NULL,
                truncated BOOLEAN NOT NULL DEFAULT FALSE,
                status VARCHAR(32) NOT NULL DEFAULT 'ready',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
    )
    connection.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS review_runs (
                id VARCHAR(64) PRIMARY KEY,
                session_id VARCHAR(64) NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
                engine VARCHAR(64) NOT NULL,
                mode VARCHAR(64) NOT NULL DEFAULT 'native_review',
                status VARCHAR(32) NOT NULL DEFAULT 'pending',
                error_detail TEXT,
                review_thread_id VARCHAR(128),
                worktree_path TEXT,
                codex_home_path TEXT,
                started_at TIMESTAMPTZ,
                completed_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
    )
    connection.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS review_run_events (
                id SERIAL PRIMARY KEY,
                run_id VARCHAR(64) NOT NULL REFERENCES review_runs(id) ON DELETE CASCADE,
                sequence INTEGER NOT NULL,
                event_type VARCHAR(128) NOT NULL,
                payload JSONB NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
    )
    connection.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS review_approvals (
                id VARCHAR(64) PRIMARY KEY,
                run_id VARCHAR(64) NOT NULL REFERENCES review_runs(id) ON DELETE CASCADE,
                method VARCHAR(128) NOT NULL,
                status VARCHAR(32) NOT NULL DEFAULT 'pending',
                summary TEXT,
                thread_id VARCHAR(128),
                turn_id VARCHAR(128),
                item_id VARCHAR(128),
                request_payload JSONB NOT NULL,
                response_payload JSONB,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
    )
    connection.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS review_results (
                id VARCHAR(64) PRIMARY KEY,
                run_id VARCHAR(64) NOT NULL UNIQUE REFERENCES review_runs(id) ON DELETE CASCADE,
                summary TEXT NOT NULL,
                findings JSONB NOT NULL,
                partial BOOLEAN NOT NULL DEFAULT FALSE,
                generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
    )
    connection.execute(
        text(
            """
            CREATE INDEX IF NOT EXISTS idx_review_runs_session_id
            ON review_runs (session_id, created_at DESC)
            """
        )
    )
    connection.execute(
        text(
            """
            CREATE INDEX IF NOT EXISTS idx_review_run_events_run_sequence
            ON review_run_events (run_id, sequence)
            """
        )
    )
    connection.execute(
        text(
            """
            CREATE INDEX IF NOT EXISTS idx_review_approvals_run_id
            ON review_approvals (run_id, created_at)
            """
        )
    )


def _review_sessions_schema_repair_migration(connection, settings: Settings) -> None:
    connection.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS review_sessions (
                id VARCHAR(64) PRIMARY KEY
            )
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_sessions
            ADD COLUMN IF NOT EXISTS repo_path TEXT
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_sessions
            ADD COLUMN IF NOT EXISTS base_ref TEXT
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_sessions
            ADD COLUMN IF NOT EXISTS head_ref TEXT
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_sessions
            ADD COLUMN IF NOT EXISTS merge_base_sha VARCHAR(40)
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_sessions
            ADD COLUMN IF NOT EXISTS base_head_sha VARCHAR(40)
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_sessions
            ADD COLUMN IF NOT EXISTS head_head_sha VARCHAR(40)
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_sessions
            ADD COLUMN IF NOT EXISTS stats JSON
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_sessions
            ADD COLUMN IF NOT EXISTS file_changes JSON
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_sessions
            ADD COLUMN IF NOT EXISTS truncated BOOLEAN DEFAULT FALSE
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_sessions
            ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'ready'
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_sessions
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_sessions
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
            """
        )
    )
    connection.execute(
        text(
            """
            UPDATE review_sessions
            SET truncated = COALESCE(truncated, FALSE),
                status = COALESCE(status, 'ready'),
                created_at = COALESCE(created_at, NOW()),
                updated_at = COALESCE(updated_at, NOW())
            """
        )
    )

    connection.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS review_runs (
                id VARCHAR(64) PRIMARY KEY
            )
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_runs
            ADD COLUMN IF NOT EXISTS session_id VARCHAR(64)
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_runs
            ADD COLUMN IF NOT EXISTS engine VARCHAR(64)
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_runs
            ADD COLUMN IF NOT EXISTS mode VARCHAR(64) DEFAULT 'native_review'
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_runs
            ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'pending'
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_runs
            ADD COLUMN IF NOT EXISTS error_detail TEXT
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_runs
            ADD COLUMN IF NOT EXISTS review_thread_id VARCHAR(128)
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_runs
            ADD COLUMN IF NOT EXISTS worktree_path TEXT
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_runs
            ADD COLUMN IF NOT EXISTS codex_home_path TEXT
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_runs
            ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_runs
            ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_runs
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_runs
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
            """
        )
    )
    connection.execute(
        text(
            """
            UPDATE review_runs
            SET mode = COALESCE(mode, 'native_review'),
                status = COALESCE(status, 'pending'),
                created_at = COALESCE(created_at, NOW()),
                updated_at = COALESCE(updated_at, NOW())
            """
        )
    )

    connection.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS review_run_events (
                id SERIAL PRIMARY KEY,
                run_id VARCHAR(64),
                sequence INTEGER,
                event_type VARCHAR(128),
                payload JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_run_events
            ADD COLUMN IF NOT EXISTS run_id VARCHAR(64)
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_run_events
            ADD COLUMN IF NOT EXISTS sequence INTEGER
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_run_events
            ADD COLUMN IF NOT EXISTS event_type VARCHAR(128)
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_run_events
            ADD COLUMN IF NOT EXISTS payload JSON
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_run_events
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()
            """
        )
    )
    connection.execute(
        text(
            """
            UPDATE review_run_events
            SET created_at = COALESCE(created_at, NOW())
            """
        )
    )

    connection.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS review_approvals (
                id VARCHAR(64) PRIMARY KEY
            )
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_approvals
            ADD COLUMN IF NOT EXISTS run_id VARCHAR(64)
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_approvals
            ADD COLUMN IF NOT EXISTS method VARCHAR(128)
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_approvals
            ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'pending'
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_approvals
            ADD COLUMN IF NOT EXISTS summary TEXT
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_approvals
            ADD COLUMN IF NOT EXISTS thread_id VARCHAR(128)
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_approvals
            ADD COLUMN IF NOT EXISTS turn_id VARCHAR(128)
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_approvals
            ADD COLUMN IF NOT EXISTS item_id VARCHAR(128)
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_approvals
            ADD COLUMN IF NOT EXISTS request_payload JSON
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_approvals
            ADD COLUMN IF NOT EXISTS response_payload JSON
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_approvals
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_approvals
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
            """
        )
    )
    connection.execute(
        text(
            """
            UPDATE review_approvals
            SET status = COALESCE(status, 'pending'),
                created_at = COALESCE(created_at, NOW()),
                updated_at = COALESCE(updated_at, NOW())
            """
        )
    )

    connection.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS review_results (
                id VARCHAR(64) PRIMARY KEY
            )
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_results
            ADD COLUMN IF NOT EXISTS run_id VARCHAR(64)
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_results
            ADD COLUMN IF NOT EXISTS summary TEXT
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_results
            ADD COLUMN IF NOT EXISTS findings JSON
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_results
            ADD COLUMN IF NOT EXISTS partial BOOLEAN DEFAULT FALSE
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_results
            ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ DEFAULT NOW()
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_results
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()
            """
        )
    )
    connection.execute(
        text(
            """
            ALTER TABLE review_results
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
            """
        )
    )
    connection.execute(
        text(
            """
            UPDATE review_results
            SET partial = COALESCE(partial, FALSE),
                generated_at = COALESCE(generated_at, NOW()),
                created_at = COALESCE(created_at, NOW()),
                updated_at = COALESCE(updated_at, NOW())
            """
        )
    )

    connection.execute(
        text(
            """
            CREATE INDEX IF NOT EXISTS idx_review_runs_session_id
            ON review_runs (session_id, created_at DESC)
            """
        )
    )
    connection.execute(
        text(
            """
            CREATE INDEX IF NOT EXISTS idx_review_run_events_run_sequence
            ON review_run_events (run_id, sequence)
            """
        )
    )
    connection.execute(
        text(
            """
            CREATE INDEX IF NOT EXISTS idx_review_approvals_run_id
            ON review_approvals (run_id, created_at)
            """
        )
    )


MIGRATIONS = [
    Migration(
        version="20260321_ai_runtime_embeddings",
        run=_ai_runtime_schema_migration,
    ),
    Migration(
        version="20260328_review_sessions",
        run=_review_sessions_schema_migration,
    ),
    Migration(
        version="20260328_review_sessions_repair",
        run=_review_sessions_schema_repair_migration,
    ),
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
