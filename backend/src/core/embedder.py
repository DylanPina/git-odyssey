from __future__ import annotations

from abc import ABC, abstractmethod
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
import random
from threading import Lock
from time import perf_counter, sleep
from typing import TYPE_CHECKING, Any, List

from infrastructure.ai_clients import EmbeddingClient, EmbeddingResult
from infrastructure.errors import AIRateLimitError, AIRequestError
from utils.logger import logger

if TYPE_CHECKING:
    from core.repo import Repo


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


@dataclass
class EmbeddingWorkItem:
    obj: Any
    text: str
    field_name: str
    token_count: int
    category: str


@dataclass
class EmbeddingExecutionStats:
    semantic_work_items: int = 0
    ast_work_items: int = 0
    semantic_tokens: int = 0
    ast_tokens: int = 0
    semantic_batches: int = 0
    ast_batches: int = 0
    http_requests: int = 0
    http_seconds: float = 0.0
    rate_limit_retries: int = 0
    rate_limit_failures: int = 0
    rate_limit_sleep_seconds: float = 0.0
    semantic_payload_build_seconds: float = 0.0
    ast_payload_build_seconds: float = 0.0
    total_seconds: float = 0.0
    _lock: Lock = field(default_factory=Lock, repr=False)

    def record_http_request(self, duration_seconds: float) -> None:
        with self._lock:
            self.http_requests += 1
            self.http_seconds += duration_seconds

    def record_rate_limit_retry(self, sleep_seconds: float) -> None:
        with self._lock:
            self.rate_limit_retries += 1
            self.rate_limit_sleep_seconds += sleep_seconds

    def record_rate_limit_failure(self) -> None:
        with self._lock:
            self.rate_limit_failures += 1


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

    def _create_work_item(
        self,
        obj: Any,
        text: str,
        field_name: str,
        *,
        category: str,
    ) -> EmbeddingWorkItem | None:
        payload = self._build_embedding_payload(obj, text, field_name)
        if payload is None:
            return None
        (target_obj, prepared_text, target_field), token_count = payload
        return EmbeddingWorkItem(
            obj=target_obj,
            text=prepared_text,
            field_name=target_field,
            token_count=token_count,
            category=category,
        )

    def _build_repo_work_items(
        self, repo: Repo
    ) -> tuple[list[EmbeddingWorkItem], EmbeddingExecutionStats]:
        stats = EmbeddingExecutionStats()
        work_items: list[EmbeddingWorkItem] = []

        for commit in repo.commits.values():
            if commit.message is not None and commit.semantic_embedding is None:
                changed_files = []
                for file_change in commit.file_changes:
                    file_path = file_change.new_path or file_change.old_path
                    changed_files.append(f"{_format_status(file_change.status)} {file_path}")
                commit_info_parts = [f"Commit Message: {commit.message.strip()}"]
                if changed_files:
                    commit_info_parts.append("Changed Files:\n" + "\n".join(changed_files))
                semantic_started_at = perf_counter()
                work_item = self._create_work_item(
                    commit,
                    "\n\n".join(commit_info_parts),
                    "semantic_embedding",
                    category="semantic",
                )
                stats.semantic_payload_build_seconds += perf_counter() - semantic_started_at
                if work_item is not None:
                    work_items.append(work_item)
                    stats.semantic_work_items += 1
                    stats.semantic_tokens += work_item.token_count

            for file_change in commit.file_changes:
                normalized_hunks: list[str] = []
                for hunk in file_change.hunks:
                    normalized_hunk = getattr(hunk, "_normalized_diff_text", None)
                    if normalized_hunk is None:
                        normalized_hunk = _normalize_diff_text(hunk.content)
                        setattr(hunk, "_normalized_diff_text", normalized_hunk)
                    if normalized_hunk:
                        normalized_hunks.append(normalized_hunk)

                    if hunk.content is None or hunk.semantic_embedding is not None:
                        pass
                    else:
                        semantic_started_at = perf_counter()
                        hunk_item = self._create_work_item(
                            hunk,
                            (
                                "Hunk Diff:\n" f"{normalized_hunk}"
                                if normalized_hunk
                                else hunk.content
                            ),
                            "semantic_embedding",
                            category="semantic",
                        )
                        stats.semantic_payload_build_seconds += (
                            perf_counter() - semantic_started_at
                        )
                        if hunk_item is not None:
                            work_items.append(hunk_item)
                            stats.semantic_work_items += 1
                            stats.semantic_tokens += hunk_item.token_count

                    ast_summary = getattr(hunk, "ast_summary", None)
                    ast_embedding = getattr(hunk, "ast_embedding", None)
                    if ast_summary and ast_embedding is None:
                        ast_started_at = perf_counter()
                        ast_item = self._create_work_item(
                            hunk,
                            ast_summary,
                            "ast_embedding",
                            category="ast",
                        )
                        stats.ast_payload_build_seconds += perf_counter() - ast_started_at
                        if ast_item is not None:
                            work_items.append(ast_item)
                            stats.ast_work_items += 1
                            stats.ast_tokens += ast_item.token_count

                if file_change.semantic_embedding is None:
                    file_path = file_change.new_path or file_change.old_path
                    file_change_parts = [
                        f"File Change: {_format_status(file_change.status)} {file_path}"
                    ]
                    if normalized_hunks:
                        file_change_parts.append("Diff:\n" + "\n\n".join(normalized_hunks))
                    semantic_started_at = perf_counter()
                    file_change_item = self._create_work_item(
                        file_change,
                        "\n\n".join(file_change_parts),
                        "semantic_embedding",
                        category="semantic",
                    )
                    stats.semantic_payload_build_seconds += perf_counter() - semantic_started_at
                    if file_change_item is not None:
                        work_items.append(file_change_item)
                        stats.semantic_work_items += 1
                        stats.semantic_tokens += file_change_item.token_count

                ast_summary = getattr(file_change, "ast_summary", None)
                ast_embedding = getattr(file_change, "ast_embedding", None)
                if ast_summary and ast_embedding is None:
                    ast_started_at = perf_counter()
                    ast_item = self._create_work_item(
                        file_change,
                        ast_summary,
                        "ast_embedding",
                        category="ast",
                    )
                    stats.ast_payload_build_seconds += perf_counter() - ast_started_at
                    if ast_item is not None:
                        work_items.append(ast_item)
                        stats.ast_work_items += 1
                        stats.ast_tokens += ast_item.token_count
        return work_items, stats

    def embed_repo(self, repo: Repo) -> EmbeddingExecutionStats:
        started_at = perf_counter()
        print(
            f"Starting embedding generation for repository with {len(repo.commits)} commits..."
        )
        work_items, stats = self._build_repo_work_items(repo)
        semantic_items = [item for item in work_items if item.category == "semantic"]
        ast_items = [item for item in work_items if item.category == "ast"]
        stats.semantic_batches = len(self._chunk_work_items(semantic_items))
        stats.ast_batches = len(self._chunk_work_items(ast_items))
        self.embed_work_items(work_items, stats=stats)
        stats.total_seconds = perf_counter() - started_at
        if stats.ast_work_items:
            print(f"Successfully embedded {stats.ast_work_items} AST summaries!")
        print(f"Successfully embedded {stats.semantic_work_items} summaries!")
        return stats


class EmbeddingEngine(BaseEmbeddingEngine):
    DEFAULT_MAX_CONCURRENCY = 4
    RATE_LIMIT_MAX_ATTEMPTS = 5
    RATE_LIMIT_INITIAL_DELAY_SECONDS = 0.5
    RATE_LIMIT_BACKOFF_MULTIPLIER = 2.0
    RATE_LIMIT_MAX_SLEEP_SECONDS = 8.0
    RATE_LIMIT_JITTER_MAX_SECONDS = 0.25

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
        self.max_concurrency = self.DEFAULT_MAX_CONCURRENCY
        self.provider_type = provider_type
        self.base_url = base_url
        self.profile_fingerprint = profile_fingerprint

    @staticmethod
    def _describe_request_error(exc: AIRequestError) -> str:
        return str(exc)

    def _record_dimension(self, response: EmbeddingResult) -> None:
        if response.dimensions is not None:
            self.observed_dimension = response.dimensions

    def _compute_rate_limit_delay(
        self,
        *,
        attempt_number: int,
        retry_after_seconds: float | None,
    ) -> float:
        backoff_seconds = self.RATE_LIMIT_INITIAL_DELAY_SECONDS * (
            self.RATE_LIMIT_BACKOFF_MULTIPLIER ** max(0, attempt_number - 1)
        )
        jitter_seconds = random.uniform(0.0, self.RATE_LIMIT_JITTER_MAX_SECONDS)
        target_delay = backoff_seconds + jitter_seconds
        if retry_after_seconds is not None:
            target_delay = max(target_delay, retry_after_seconds)
        return min(self.RATE_LIMIT_MAX_SLEEP_SECONDS, target_delay)

    def _execute_with_rate_limit_retry(
        self,
        request_fn,
        *,
        request_size: int,
        stats: EmbeddingExecutionStats | None = None,
    ) -> EmbeddingResult:
        last_error: AIRateLimitError | None = None
        for attempt_number in range(1, self.RATE_LIMIT_MAX_ATTEMPTS + 1):
            started_at = perf_counter()
            try:
                response = request_fn()
            except AIRateLimitError as exc:
                if stats is not None:
                    stats.record_http_request(perf_counter() - started_at)
                last_error = exc
                if attempt_number >= self.RATE_LIMIT_MAX_ATTEMPTS:
                    if stats is not None:
                        stats.record_rate_limit_failure()
                    raise AIRateLimitError(
                        (
                            "Embedding request exceeded provider rate limits after "
                            f"{self.RATE_LIMIT_MAX_ATTEMPTS} attempts."
                        ),
                        provider_label=exc.provider_label,
                        status_code=exc.status_code,
                        retry_after_seconds=exc.retry_after_seconds,
                    ) from exc

                delay_seconds = self._compute_rate_limit_delay(
                    attempt_number=attempt_number,
                    retry_after_seconds=exc.retry_after_seconds,
                )
                if stats is not None:
                    stats.record_rate_limit_retry(delay_seconds)
                logger.warning(
                    "Embedding request for provider %s hit a rate limit on attempt %s/%s; "
                    "sleeping %.3fs before retrying %s input(s).",
                    exc.provider_label,
                    attempt_number,
                    self.RATE_LIMIT_MAX_ATTEMPTS,
                    delay_seconds,
                    request_size,
                )
                sleep(delay_seconds)
                continue

            if stats is not None:
                stats.record_http_request(perf_counter() - started_at)
            return response

        if last_error is not None:
            if stats is not None:
                stats.record_rate_limit_failure()
            raise AIRateLimitError(
                (
                    "Embedding request exceeded provider rate limits after "
                    f"{self.RATE_LIMIT_MAX_ATTEMPTS} attempts."
                ),
                provider_label=last_error.provider_label,
                status_code=last_error.status_code,
                retry_after_seconds=last_error.retry_after_seconds,
            ) from last_error

        raise AIRequestError("Embedding request failed before a response was received.")

    def _request_embeddings(
        self,
        inputs: list[str],
        *,
        stats: EmbeddingExecutionStats | None = None,
    ) -> EmbeddingResult:
        response = self._execute_with_rate_limit_retry(
            lambda: self.client.embed(model=self.model, inputs=inputs),
            request_size=len(inputs),
            stats=stats,
        )
        self._record_dimension(response)
        return response

    def _request_embedding(
        self,
        text: str,
        *,
        stats: EmbeddingExecutionStats | None = None,
    ) -> EmbeddingResult:
        response = self._execute_with_rate_limit_retry(
            lambda: self.client.embed(model=self.model, inputs=[text]),
            request_size=1,
            stats=stats,
        )
        self._record_dimension(response)
        return response

    def prepare_text_for_embedding(self, text: str) -> str:
        if not text or self.max_input_tokens < 1:
            return text

        max_chars = self.max_input_tokens * self.token_chars
        if len(text) <= max_chars:
            return text

        return text[:max_chars]

    def _chunk_work_items(
        self,
        work_items: list[EmbeddingWorkItem],
    ) -> list[list[EmbeddingWorkItem]]:
        batches: list[list[EmbeddingWorkItem]] = []
        current_batch: list[EmbeddingWorkItem] = []
        current_tokens = 0

        for work_item in work_items:
            item_tokens = work_item.token_count
            if current_batch and current_tokens + item_tokens > self.token_limit:
                batches.append(current_batch)
                current_batch = []
                current_tokens = 0

            current_batch.append(work_item)
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

    def _get_single_embedding_with_truncation(
        self,
        text: str,
        *,
        stats: EmbeddingExecutionStats | None = None,
    ) -> list[float]:
        candidate = text
        last_error: AIRequestError | None = None

        while candidate and candidate.strip():
            try:
                response = self._request_embedding(candidate, stats=stats)
                if candidate != text:
                    logger.warning(
                        "Truncated oversized embedding input from %s to %s characters.",
                        len(text),
                        len(candidate),
                    )
                return response.embeddings[0]
            except AIRateLimitError:
                raise
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

    def _get_batch_embeddings_with_fallback(
        self,
        texts: list[str],
        *,
        stats: EmbeddingExecutionStats | None = None,
    ) -> list[list[float]]:
        if not texts:
            return []

        if len(texts) == 1:
            return [self._get_single_embedding_with_truncation(texts[0], stats=stats)]

        try:
            response = self._request_embeddings(texts, stats=stats)
            return response.embeddings
        except AIRateLimitError:
            raise
        except AIRequestError as exc:
            midpoint = len(texts) // 2
            logger.warning(
                "Embedding batch of %s items was rejected; retrying in smaller chunks. %s",
                len(texts),
                self._describe_request_error(exc),
            )
            return self._get_batch_embeddings_with_fallback(
                texts[:midpoint], stats=stats
            ) + self._get_batch_embeddings_with_fallback(texts[midpoint:], stats=stats)

    def _embed_batch_texts(
        self,
        texts: list[str],
        *,
        stats: EmbeddingExecutionStats | None = None,
    ) -> list[list[float]]:
        if not texts:
            return []
        if len(texts) == 1:
            return [self._get_single_embedding_with_truncation(texts[0], stats=stats)]
        try:
            response = self._request_embeddings(texts, stats=stats)
            return response.embeddings
        except AIRateLimitError:
            raise
        except AIRequestError as exc:
            midpoint = len(texts) // 2
            logger.warning(
                "Embedding batch of %s items was rejected; retrying in smaller chunks. %s",
                len(texts),
                self._describe_request_error(exc),
            )
            return self._embed_batch_texts(texts[:midpoint], stats=stats) + self._embed_batch_texts(
                texts[midpoint:], stats=stats
            )

    def embed_work_items(
        self,
        work_items: list[EmbeddingWorkItem],
        *,
        stats: EmbeddingExecutionStats | None = None,
    ) -> None:
        if not work_items:
            return
        batches = self._chunk_work_items(work_items)
        if len(batches) == 1:
            embeddings = self._embed_batch_texts(
                [item.text for item in batches[0]],
                stats=stats,
            )
            for item, embedding in zip(batches[0], embeddings):
                setattr(item.obj, item.field_name, embedding)
            return

        results: dict[int, list[list[float]]] = {}
        with ThreadPoolExecutor(max_workers=min(self.max_concurrency, len(batches))) as executor:
            future_map = {
                executor.submit(
                    self._embed_batch_texts,
                    [item.text for item in batch],
                    stats=stats,
                ): index
                for index, batch in enumerate(batches)
            }
            for future in as_completed(future_map):
                results[future_map[future]] = future.result()

        for batch_index, batch in enumerate(batches):
            for item, embedding in zip(batch, results[batch_index]):
                setattr(item.obj, item.field_name, embedding)

    def embed_batch(self, repo_objects: List[Any]) -> None:
        work_items: list[EmbeddingWorkItem] = []
        for obj, text, field_name in repo_objects:
            work_item = self._create_work_item(obj, text, field_name, category="semantic")
            if work_item is not None:
                work_items.append(work_item)
        self.embed_work_items(work_items)

    def embed_query(self, query: str) -> List[float]:
        if not query:
            return []
        response = self._request_embedding(query)
        return response.embeddings[0]

    def get_batch_embeddings(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []

        prepared_texts = [self.prepare_text_for_embedding(text) for text in texts]
        embeddings: list[list[float]] = [None] * len(prepared_texts)
        batches = self._chunk_texts(prepared_texts)
        indexed_batches: list[tuple[int, list[str]]] = []
        cursor = 0
        for batch in batches:
            indexed_batches.append((cursor, batch))
            cursor += len(batch)
        with ThreadPoolExecutor(
            max_workers=min(self.max_concurrency, len(indexed_batches) or 1)
        ) as executor:
            future_map = {
                executor.submit(self._get_batch_embeddings_with_fallback, batch): start_index
                for start_index, batch in indexed_batches
            }
            for future in as_completed(future_map):
                start_index = future_map[future]
                result = future.result()
                embeddings[start_index : start_index + len(result)] = result
        return embeddings
