from sqlalchemy import text

import infrastructure.db as db
from infrastructure.db import close_db, init_db
from infrastructure.schema import init_schema
from infrastructure.settings import Settings
from utils.logger import logger


def main() -> None:
    settings = Settings()
    init_db(settings.database_url, settings.database_sslmode)

    try:
        with db.engine.begin() as connection:
            connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        init_schema()
        logger.info("Database schema bootstrapped successfully.")
    finally:
        close_db()


if __name__ == "__main__":
    main()
