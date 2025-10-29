import os, asyncio, tempfile
from utils.utils import delete_dir_if_exists
from core.repo import Repo
from core.embedder import OpenAIEmbedder
from utils.logger import logger
from api.api_model import IngestRequest
from sqlalchemy.orm import Session
from services.github_service import get_installation_access_token
from data.schema import SQLUser  # TODO: Implement SQLUser model


class IngestService:
    def __init__(self, session: Session):
        self.session = session
        self.embedder = OpenAIEmbedder()

    # TODO: Make async (this is bottleneck) - store ingestion jobs and use Celery or Arq
    def ingest_repo(self, request: IngestRequest, user_id: str):
        user = self.session.query(SQLUser).filter(SQLUser.id == user_id).first()
        if not user or not user.installation_id:
            raise Exception(
                f"Cannot ingest: User {user_id} not found or has no installation ID"
            )

        try:
            # TODO: Remove asyncio once ingest_repo is async
            token = asyncio.run(get_installation_access_token(user.installation_id))
        except Exception as e:
            raise Exception(f"Cannot get installation access token: {e}")

        repo_url = f"https://x-access-token:{token}@{repo_url}"

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
            sql_repo = repo.to_sql()
            sql_repo.user_id = user_id
            self.session.add(sql_repo)
            self.session.commit()

            logger.info(f"SQL models created. Removing repo...")
