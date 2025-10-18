import os
from utils.utils import delete_dir_if_exists
from core.repo import Repo
from data.database import Database
from core.embedder import Embedder


class IngestService:
    def __init__(self):
        self.db = Database()
        self.embedder = Embedder()

    def ingest_repo(self, request):
        repo_path = os.path.join(os.path.dirname(
            __file__), "..", "api", "repo.git")
        delete_dir_if_exists(repo_path)

        repo = Repo(
            url=request.url,
            context_lines=request.context_lines,
            max_commits=request.max_commits,
        )
        # self.embedder.embed_repo(repo)

        self.db.create(repo.to_sql())
        repo.rm()
