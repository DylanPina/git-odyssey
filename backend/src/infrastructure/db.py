# from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker TODO: Use async version
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

engine = None
SessionLocal = None


def init_db(database_url: str):
    global engine, SessionLocal
    engine = create_engine(
        database_url,
        echo=False,
        poolclass=NullPool,
        connect_args={"sslmode": "require"},
    )
    SessionLocal = sessionmaker(
        bind=engine, expire_on_commit=False, autoflush=False, autocommit=False
    )


def close_db():
    engine.dispose()
