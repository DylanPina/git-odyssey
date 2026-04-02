"""Database schema management utilities."""

from sqlalchemy import text

import infrastructure.db as db
from data.schema import Base


def ensure_pgvector_extension() -> None:
    """Create and verify the pgvector extension for the active database."""
    if db.engine is None:
        raise RuntimeError("Database engine not initialized. Call init_db() first.")

    with db.engine.begin() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        vector_enabled = connection.execute(
            text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
        ).scalar()

    if vector_enabled != 1:
        raise RuntimeError(
            "pgvector extension is required but could not be enabled."
        )


def init_schema():
    """Create all database tables."""
    if db.engine is None:
        raise RuntimeError("Database engine not initialized. Call init_db() first.")
    ensure_pgvector_extension()
    Base.metadata.create_all(bind=db.engine)


def drop_schema():
    """Drop all database tables."""
    if db.engine is None:
        raise RuntimeError("Database engine not initialized. Call init_db() first.")
    Base.metadata.drop_all(bind=db.engine)
