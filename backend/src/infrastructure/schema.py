"""Database schema management utilities."""

import infrastructure.db as db
from data.schema import Base


def init_schema():
    """Create all database tables."""
    if db.engine is None:
        raise RuntimeError("Database engine not initialized. Call init_db() first.")
    Base.metadata.create_all(bind=db.engine)


def drop_schema():
    """Drop all database tables."""
    if db.engine is None:
        raise RuntimeError("Database engine not initialized. Call init_db() first.")
    Base.metadata.drop_all(bind=db.engine)
