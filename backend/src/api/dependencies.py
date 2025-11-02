from typing import Generator
from sqlalchemy.orm import Session
import infrastructure.db as db
from infrastructure.settings import Settings
from functools import lru_cache


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


async def get_session() -> Generator[Session, None, None]:
    with db.SessionLocal() as session:
        yield session
