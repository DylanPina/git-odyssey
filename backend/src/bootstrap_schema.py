import infrastructure.db as db
from infrastructure.db import close_db, init_db
from infrastructure.migrations import run_migrations
from infrastructure.schema import ensure_pgvector_extension, init_schema
from infrastructure.settings import Settings
from utils.logger import logger


def main() -> None:
    settings = Settings()
    init_db(settings.database_url, settings.database_sslmode)

    try:
        ensure_pgvector_extension()
        init_schema()
        run_migrations(settings)
        logger.info("Database schema bootstrapped successfully.")
    finally:
        close_db()


if __name__ == "__main__":
    main()
