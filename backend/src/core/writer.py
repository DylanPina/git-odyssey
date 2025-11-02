from data.data_model import Commit, FileChange, DiffHunk
from data.schema import SQLCommit, SQLFileChange, SQLDiffHunk
from typing import Union, List, Tuple
from core.embedder import OpenAIEmbedder
from sqlalchemy.orm import Session


class Writer:
    def __init__(self, session: Session, embedder: OpenAIEmbedder):
        self.session = session
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
        # Filter out None summaries before creating embeddings
        valid_updates = [update for update in updates if update["summary"] is not None]
        if valid_updates:
            embeddings = self.embedder.get_batch_embeddings(
                [update["summary"] for update in valid_updates]
            )
        else:
            embeddings = []

        # Create a mapping of valid updates to their embeddings
        valid_embedding_map = {}
        for update, embedding in zip(valid_updates, embeddings):
            valid_embedding_map[update["id"]] = embedding

        for update in updates:
            db_object = self.session.get(update["type"], update["id"])
            db_object.summary = update["summary"]
            # Only set embedding if we have one for this update
            if update["id"] in valid_embedding_map:
                db_object.embedding = valid_embedding_map[update["id"]]
            self.session.commit()
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
