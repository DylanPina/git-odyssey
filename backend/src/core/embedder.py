from abc import ABC, abstractmethod
from typing import Any, List

from core.repo import Repo
from infrastructure.ai_clients import EmbeddingClient, EmbeddingResult
from infrastructure.errors import AIRequestError
from utils.logger import logger


def _normalize_diff_text(value: str | None) -> str:
    if not value:
        return ""

    normalized_lines: list[str] = []
    for raw_line in value.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if not raw_line:
            continue

        prefix = raw_line[0] if raw_line[:1] in {"+", "-", " "} else ""
        body = raw_line[1:] if prefix else raw_line
        compact_body = " ".join(body.split())
        if compact_body:
            normalized_lines.append(f"{prefix}{compact_body}")

    return "\n".join(normalized_lines)


def _format_status(value: Any) -> str:
    raw_value = getattr(value, "value", value)
    if raw_value is None:
        return "modified"
    return str(raw_value).replace("_", " ").lower()


class BaseEmbeddingEngine(ABC):
    """Abstract base class for embedding implementations."""

    def __init__(self, model: str, token_limit: int):
        self.model = model
        self.token_limit = token_limit
        self.token_chars = 3
        self.observed_dimension: int | None = None

    def estimate_tokens(self, text: str) -> int:
        if not text:
            return 0
        return max(1, len(text) // self.token_chars)

    def prepare_text_for_embedding(self, text: str) -> str:
        return text

    def _build_embedding_payload(
        self,
        obj: Any,
        text: str,
        field_name: str,
    ) -> tuple[tuple[Any, str, str], int] | None:
        prepared_text = self.prepare_text_for_embedding(text)
        if not prepared_text or not prepared_text.strip():
            return None

        return (obj, prepared_text, field_name), self.estimate_tokens(prepared_text)

    @abstractmethod
    def embed_batch(self, repo_objects: List[Any]) -> None:
        """Embed a batch of repo objects."""

    @abstractmethod
    def embed_query(self, query: str) -> List[float]:
        """Embed a single query string."""

    @abstractmethod
    def get_batch_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Get batch embeddings for a list of texts."""

    def embed_repo(self, repo: Repo) -> None:
        """Generate semantic embeddings for commit, file, and hunk search docs."""
        print(
            f"Starting embedding generation for repository with {len(repo.commits)} commits..."
        )
        repo_objects: list[tuple[Any, str, str]] = []
        total_repo_objects = 0
        num_tokens = 0

        for commit in repo.commits.values():
            if commit.message is not None and commit.semantic_embedding is None:
                changed_files = []
                for file_change in commit.file_changes:
                    file_path = file_change.new_path or file_change.old_path
                    changed_files.append(
                        f"{_format_status(file_change.status)} {file_path}"
                    )
                commit_info_parts = [f"Commit Message: {commit.message.strip()}"]
                if changed_files:
                    commit_info_parts.append(
                        "Changed Files:\n" + "\n".join(changed_files)
                    )
                commit_info = "\n\n".join(commit_info_parts)
                commit_payload = self._build_embedding_payload(
                    commit, commit_info, "semantic_embedding"
                )
                if commit_payload is not None:
                    repo_object, commit_tokens = commit_payload
                    if repo_objects and commit_tokens + num_tokens > self.token_limit:
                        print(
                            f"Reached token limit of {self.token_limit} with {num_tokens} tokens. Embedding {len(repo_objects)} objects."
                        )
                        self.embed_batch(repo_objects)
                        total_repo_objects += len(repo_objects)
                        repo_objects = []
                        num_tokens = 0
                    repo_objects.append(repo_object)
                    num_tokens += commit_tokens

            for file_change in commit.file_changes:
                if file_change.semantic_embedding is None:
                    file_path = file_change.new_path or file_change.old_path
                    normalized_hunks = [
                        _normalize_diff_text(hunk.content)
                        for hunk in file_change.hunks
                        if hunk.content
                    ]
                    file_change_parts = [
                        f"File Change: {_format_status(file_change.status)} {file_path}"
                    ]
                    if normalized_hunks:
                        file_change_parts.append(
                            "Diff:\n" + "\n\n".join(normalized_hunks)
                        )
                    file_change_payload = self._build_embedding_payload(
                        file_change,
                        "\n\n".join(file_change_parts),
                        "semantic_embedding",
                    )
                    if file_change_payload is not None:
                        repo_object, file_change_tokens = file_change_payload
                        if (
                            repo_objects
                            and file_change_tokens + num_tokens > self.token_limit
                        ):
                            print(
                                f"Reached token limit of {self.token_limit} with {num_tokens} tokens. Embedding {len(repo_objects)} objects."
                            )
                            self.embed_batch(repo_objects)
                            total_repo_objects += len(repo_objects)
                            repo_objects = []
                            num_tokens = 0
                        repo_objects.append(repo_object)
                        num_tokens += file_change_tokens

                for hunk in file_change.hunks:
                    if hunk.content is None or hunk.semantic_embedding is not None:
                        continue

                    normalized_hunk = _normalize_diff_text(hunk.content)
                    hunk_payload = self._build_embedding_payload(
                        hunk,
                        (
                            "Hunk Diff:\n"
                            f"{normalized_hunk}"
                            if normalized_hunk
                            else hunk.content
                        ),
                        "semantic_embedding",
                    )
                    if hunk_payload is None:
                        continue

                    repo_object, content_tokens = hunk_payload
                    if repo_objects and content_tokens + num_tokens > self.token_limit:
                        print(
                            f"Reached token limit of {self.token_limit} with {num_tokens} tokens. Embedding {len(repo_objects)} objects."
                        )
                        self.embed_batch(repo_objects)
                        total_repo_objects += len(repo_objects)
                        repo_objects = []
                        num_tokens = 0
                    repo_objects.append(repo_object)
                    num_tokens += content_tokens

        if repo_objects:
            self.embed_batch(repo_objects)
            total_repo_objects += len(repo_objects)

        print(f"Successfully embedded {total_repo_objects} summaries!")


class EmbeddingEngine(BaseEmbeddingEngine):
    def __init__(
        self,
        client: EmbeddingClient,
        model: str = "text-embedding-3-small",
        token_limit: int = 5000,
        max_input_tokens: int = 4500,
        provider_type: str = "openai",
        base_url: str = "https://api.openai.com",
        profile_fingerprint: str | None = None,
    ):
        super().__init__(model=model, token_limit=token_limit)
        self.client = client
        self.max_input_tokens = max_input_tokens
        self.provider_type = provider_type
        self.base_url = base_url
        self.profile_fingerprint = profile_fingerprint

    @staticmethod
    def _describe_request_error(exc: AIRequestError) -> str:
        return str(exc)

    def _record_dimension(self, response: EmbeddingResult) -> None:
        if response.dimensions is not None:
            self.observed_dimension = response.dimensions

    def _request_embeddings(self, inputs: list[str]) -> EmbeddingResult:
        response = self.client.embed(model=self.model, inputs=inputs)
        self._record_dimension(response)
        return response

    def _request_embedding(self, text: str) -> EmbeddingResult:
        response = self.client.embed(model=self.model, inputs=[text])
        self._record_dimension(response)
        return response

    def prepare_text_for_embedding(self, text: str) -> str:
        if not text or self.max_input_tokens < 1:
            return text

        max_chars = self.max_input_tokens * self.token_chars
        if len(text) <= max_chars:
            return text

        return text[:max_chars]

    def _chunk_repo_objects(
        self,
        repo_objects: list[tuple[Any, str, str]],
    ) -> list[list[tuple[Any, str, str]]]:
        batches: list[list[tuple[Any, str, str]]] = []
        current_batch: list[tuple[Any, str, str]] = []
        current_tokens = 0

        for repo_object in repo_objects:
            item_tokens = self.estimate_tokens(repo_object[1])
            if current_batch and current_tokens + item_tokens > self.token_limit:
                batches.append(current_batch)
                current_batch = []
                current_tokens = 0

            current_batch.append(repo_object)
            current_tokens += item_tokens

        if current_batch:
            batches.append(current_batch)

        return batches

    def _chunk_texts(self, texts: list[str]) -> list[list[str]]:
        batches: list[list[str]] = []
        current_batch: list[str] = []
        current_tokens = 0

        for text in texts:
            item_tokens = self.estimate_tokens(text)
            if current_batch and current_tokens + item_tokens > self.token_limit:
                batches.append(current_batch)
                current_batch = []
                current_tokens = 0

            current_batch.append(text)
            current_tokens += item_tokens

        if current_batch:
            batches.append(current_batch)

        return batches

    def _get_single_embedding_with_truncation(self, text: str) -> list[float]:
        candidate = text
        last_error: AIRequestError | None = None

        while candidate and candidate.strip():
            try:
                response = self._request_embedding(candidate)
                if candidate != text:
                    logger.warning(
                        "Truncated oversized embedding input from %s to %s characters.",
                        len(text),
                        len(candidate),
                    )
                return response.embeddings[0]
            except AIRequestError as exc:
                last_error = exc
                next_length = len(candidate) // 2
                if next_length < 1 or next_length == len(candidate):
                    break
                candidate = candidate[:next_length]

        if last_error is not None:
            logger.error(
                "Embedding request failed after truncating from %s to %s characters: %s",
                len(text),
                len(candidate),
                self._describe_request_error(last_error),
            )
            raise last_error

        raise ValueError("Embedding input was empty after truncation.")

    def _get_batch_embeddings_with_fallback(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        if len(texts) == 1:
            return [self._get_single_embedding_with_truncation(texts[0])]

        try:
            response = self._request_embeddings(texts)
            return response.embeddings
        except AIRequestError as exc:
            midpoint = len(texts) // 2
            logger.warning(
                "Embedding batch of %s items was rejected; retrying in smaller chunks. %s",
                len(texts),
                self._describe_request_error(exc),
            )
            return self._get_batch_embeddings_with_fallback(
                texts[:midpoint]
            ) + self._get_batch_embeddings_with_fallback(texts[midpoint:])

    def _embed_single_with_truncation(self, repo_object: tuple[Any, str, str]) -> None:
        obj, text, field_name = repo_object
        setattr(obj, field_name, self._get_single_embedding_with_truncation(text))

    def _embed_batch_with_fallback(
        self,
        repo_objects: list[tuple[Any, str, str]],
        exc: AIRequestError,
    ) -> None:
        if not repo_objects:
            return

        if len(repo_objects) == 1:
            self._embed_single_with_truncation(repo_objects[0])
            return

        midpoint = len(repo_objects) // 2
        logger.warning(
            "Embedding batch of %s items was rejected; retrying in smaller chunks. %s",
            len(repo_objects),
            self._describe_request_error(exc),
        )
        self.embed_batch(repo_objects[:midpoint])
        self.embed_batch(repo_objects[midpoint:])

    def embed_batch(self, repo_objects: List[Any]) -> None:
        sanitized_repo_objects = []
        for obj, text, field_name in repo_objects:
            prepared_text = self.prepare_text_for_embedding(text)
            if prepared_text and prepared_text.strip():
                sanitized_repo_objects.append((obj, prepared_text, field_name))
        if not sanitized_repo_objects:
            return

        for batch in self._chunk_repo_objects(sanitized_repo_objects):
            if len(batch) == 1:
                self._embed_single_with_truncation(batch[0])
                continue

            try:
                response = self._request_embeddings([text for _, text, _ in batch])
            except AIRequestError as exc:
                self._embed_batch_with_fallback(batch, exc)
                continue

            for (obj, _, field_name), embedding in zip(batch, response.embeddings):
                setattr(obj, field_name, embedding)

    def embed_query(self, query: str) -> List[float]:
        if not query:
            return []
        response = self._request_embedding(query)
        return response.embeddings[0]

    def get_batch_embeddings(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []

        prepared_texts = [self.prepare_text_for_embedding(text) for text in texts]
        embeddings: list[list[float]] = []

        for batch in self._chunk_texts(prepared_texts):
            embeddings.extend(self._get_batch_embeddings_with_fallback(batch))

        return embeddings
