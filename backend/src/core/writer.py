from data.data_model import Commit, FileChange, DiffHunk
from data.schema import SQLCommit, SQLFileChange, SQLDiffHunk
from typing import Union, List
from core.embedder import EmbeddingEngine
from sqlalchemy.orm import Session


class Writer:
    def __init__(self, session: Session, embedder: EmbeddingEngine | None):
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

        should_embed = self._should_write_semantic_embeddings(git_object)
        valid_updates = (
            [update for update in updates if update["summary"] is not None]
            if should_embed
            else []
        )
        if valid_updates:
            embeddings = self.embedder.get_batch_embeddings(
                [update["summary"] for update in valid_updates]
            )
        else:
            embeddings = []

        valid_embedding_map = {}
        for update, embedding in zip(valid_updates, embeddings):
            valid_embedding_map[update["id"]] = embedding

        for update in updates:
            db_object = self.session.get(update["type"], update["id"])
            db_object.summary = update["summary"]
            if update["id"] in valid_embedding_map:
                db_object.semantic_embedding = valid_embedding_map[update["id"]]

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

    def _resolve_repo_profile_fingerprint(
        self, git_object: Union[Commit, FileChange, DiffHunk]
    ) -> str | None:
        if isinstance(git_object, Commit):
            db_commit = self.session.get(SQLCommit, git_object.sha)
            repo = db_commit.repo if db_commit is not None else None
            return repo.embedding_profile.fingerprint if repo and repo.embedding_profile else None

        if isinstance(git_object, FileChange):
            db_file_change = self.session.get(SQLFileChange, git_object.id)
            commit = db_file_change.commit if db_file_change is not None else None
            repo = commit.repo if commit is not None else None
            return repo.embedding_profile.fingerprint if repo and repo.embedding_profile else None

        db_hunk = self.session.get(SQLDiffHunk, git_object.id)
        commit = db_hunk.commit if db_hunk is not None else None
        repo = commit.repo if commit is not None else None
        return repo.embedding_profile.fingerprint if repo and repo.embedding_profile else None

    def _should_write_semantic_embeddings(
        self, git_object: Union[Commit, FileChange, DiffHunk]
    ) -> bool:
        if self.embedder is None or not self.embedder.profile_fingerprint:
            return False

        return (
            self._resolve_repo_profile_fingerprint(git_object)
            == self.embedder.profile_fingerprint
        )
