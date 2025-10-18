from data.database import Database
from core.embedder import Embedder
from data.data_model import Commit, FileChange, DiffHunk
from data.schema import SQLCommit, SQLFileChange, SQLDiffHunk
from typing import Union, List, Tuple


class Writer:
    def __init__(self, db: Database, embedder: Embedder):
        self.db = db
        self.embedder = embedder

    def update_summaries(self, git_object: Union[Commit, FileChange, DiffHunk]):
        """
        Recursively update the summaries of a git object and its children. Embed new summaries to satisfy
        lazy loading.
        """
        print(f"Saving summaries for {type(git_object).__name__}...")
        updates = []
        self._recursive_collect_updates(git_object, updates)

        # **Update git object embeddings with embeddings of summaries (better than commit message or hunk patch)**
        embeddings = self.embedder.get_batch_embeddings(
            [update["summary"] for update in updates]
        )

        with self.db.get_session() as session:
            for update, embedding in zip(updates, embeddings):
                update["embedding"] = embedding
                db_object = session.get(update["type"], update["id"])
                db_object.summary = update["summary"]
                db_object.embedding = embedding
            session.commit()
        print(f"Summaries saved for {type(git_object).__name__}...")

    def _recursive_collect_updates(
        self,
        git_object: Union[Commit, FileChange, DiffHunk],
        updates: List[dict],
    ):
        """
        Recursively traverse pydantic git objects and collect updates.
        """
        if isinstance(git_object, Commit):
            updates.append(
                {
                    "type": SQLCommit,
                    "id": git_object.sha,
                    "summary": git_object.summary,
                },
            )
            for file_change in git_object.file_changes:
                self._recursive_collect_updates(file_change, updates)
        elif isinstance(git_object, FileChange):
            updates.append(
                {
                    "type": SQLFileChange,
                    "id": git_object.id,
                    "summary": git_object.summary,
                },
            )
            for hunk in git_object.hunks:
                self._recursive_collect_updates(hunk, updates)
        elif isinstance(git_object, DiffHunk):
            updates.append(
                {
                    "type": SQLDiffHunk,
                    "id": git_object.id,
                    "summary": git_object.summary,
                },
            )
