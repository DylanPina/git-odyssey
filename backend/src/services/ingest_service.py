import os, tempfile
from core.repo import Repo
from core.embedder import OpenAIEmbedder
from utils.logger import logger
from api.api_model import IngestRequest
from sqlalchemy.orm import Session
from data.schema import SQLUser
import traceback
from infrastructure.settings import Settings


class IngestService:
    def __init__(self, session: Session, embedder: OpenAIEmbedder, settings: Settings):
        self.session = session
        self.embedder = embedder
        self.settings = settings

    # TODO: Make async (this is bottleneck) - store ingestion jobs and use Celery or Arq
    async def ingest_repo(
        self, request: IngestRequest, user_id: str, installation_token: str
    ):
        user = self.session.query(SQLUser).filter(SQLUser.id == user_id).first()
        if not user:
            raise Exception(f"Cannot ingest: User {user_id} not found")

        safe_url = request.url.removeprefix("https://")
        repo_url = f"https://x-access-token:{installation_token}@{safe_url}"
        print("Repo URL: ", repo_url)
        with tempfile.TemporaryDirectory() as temp_repo_path:
            logger.info(f"Cloning repo into {temp_repo_path}")
            repo = Repo(
                url=repo_url,
                local_path=temp_repo_path,
                context_lines=request.context_lines,
                max_commits=request.max_commits,
            )

            logger.info(f"Cloning complete. Embedding repo...")
            self.embedder.embed_repo(repo)

            logger.info(f"Embedding complete. Creating SQL models...")
            repo.url = (
                request.url
            )  # Store the original URL in the SQL model (remove the token)
            sql_repo = repo.to_sql()
            sql_repo.user_id = user_id
            logger.info("Adding sql_repo to session...")
            self.session.add(sql_repo)

            try:
                logger.info("Flushing to database (will reveal constraint issues)...")
                self.session.flush()  # flush to send SQL to DB and surface errors early
                logger.info("Flush OK; committing...")
                self.session.commit()
                logger.info("Commit successful!")
            except Exception as e:
                logger.error("DB write failed: %s", e)
                logger.error(traceback.format_exc())
                try:
                    self.session.rollback()
                except Exception:
                    logger.exception("Rollback failed")
                raise  # re-raise so the HTTP 500 still happens (or handle as you prefer)

            logger.info(f"SQL models created. Removing repo...")
