import unittest
from threading import Event, Lock, Timer
from types import SimpleNamespace
from unittest.mock import Mock, patch

from core.embedder import EmbeddingEngine
from infrastructure.ai_clients import EmbeddingResult
from infrastructure.errors import AIRateLimitError, AIRequestError


def build_embedding_result(*vectors: list[float]) -> EmbeddingResult:
    embeddings = list(vectors)
    dimensions = len(embeddings[0]) if embeddings else None
    return EmbeddingResult(embeddings=embeddings, dimensions=dimensions)


class RecordingEmbeddingEngine(EmbeddingEngine):
    def __init__(
        self,
        token_limit: int = 10,
        max_input_tokens: int = 5000,
    ) -> None:
        super().__init__(
            client=Mock(),
            model="text-embedding-3-small",
            token_limit=token_limit,
            max_input_tokens=max_input_tokens,
        )
        self.token_chars = 1
        self.batches = []

    def _embed_batch_texts(self, texts, *, stats=None):
        self.batches.append(list(texts))
        batch_index = float(len(self.batches))
        return [[batch_index, float(index)] for index, _ in enumerate(texts)]


class TrackingEmbeddingClient:
    def __init__(self) -> None:
        self.active = 0
        self.max_active = 0
        self.lock = Lock()
        self.reached_target = Event()
        self.release = Event()

    def embed(self, *, model: str, inputs: list[str]) -> EmbeddingResult:
        with self.lock:
            self.active += 1
            self.max_active = max(self.max_active, self.active)
            if self.active >= 2:
                self.reached_target.set()
        self.release.wait(timeout=1.0)
        with self.lock:
            self.active -= 1
        return build_embedding_result(*([[1.0, 0.0]] * len(inputs)))


class SequenceEmbeddingClient:
    def __init__(self, side_effects):
        self.side_effects = list(side_effects)
        self.calls: list[list[str]] = []

    def embed(self, *, model: str, inputs: list[str]) -> EmbeddingResult:
        self.calls.append(list(inputs))
        effect = self.side_effects.pop(0)
        if isinstance(effect, Exception):
            raise effect
        return effect


class EmbeddingEngineTests(unittest.TestCase):
    def test_embed_query_returns_single_vector(self) -> None:
        client = Mock()
        client.embed.return_value = build_embedding_result([0.1, 0.2, 0.3])
        embedder = EmbeddingEngine(client=client)

        result = embedder.embed_query("auth changes")

        self.assertEqual(result, [0.1, 0.2, 0.3])
        client.embed.assert_called_once_with(
            model="text-embedding-3-small",
            inputs=["auth changes"],
        )

    def test_get_batch_embeddings_returns_all_vectors(self) -> None:
        client = Mock()
        client.embed.return_value = build_embedding_result([1.0, 0.0], [0.0, 1.0])
        embedder = EmbeddingEngine(client=client)

        result = embedder.get_batch_embeddings(["first", "second"])

        self.assertEqual(result, [[1.0, 0.0], [0.0, 1.0]])
        client.embed.assert_called_once_with(
            model="text-embedding-3-small",
            inputs=["first", "second"],
        )

    def test_get_batch_embeddings_skips_empty_requests(self) -> None:
        client = Mock()
        embedder = EmbeddingEngine(client=client)

        result = embedder.get_batch_embeddings([])

        self.assertEqual(result, [])
        client.embed.assert_not_called()

    def test_embed_batch_retries_request_errors_in_smaller_chunks(self) -> None:
        client = Mock()
        client.embed.side_effect = [
            AIRequestError("bad request"),
            build_embedding_result([1.0, 0.0]),
            build_embedding_result([0.0, 1.0]),
        ]
        embedder = EmbeddingEngine(client=client)
        first = SimpleNamespace(semantic_embedding=None)
        second = SimpleNamespace(semantic_embedding=None)

        embedder.embed_batch(
            [
                (first, "first payload", "semantic_embedding"),
                (second, "second payload", "semantic_embedding"),
            ]
        )

        self.assertEqual(first.semantic_embedding, [1.0, 0.0])
        self.assertEqual(second.semantic_embedding, [0.0, 1.0])
        self.assertEqual(
            [call.kwargs["inputs"] for call in client.embed.call_args_list],
            [["first payload", "second payload"], ["first payload"], ["second payload"]],
        )

    def test_embed_batch_retries_same_payload_on_rate_limit(self) -> None:
        client = SequenceEmbeddingClient(
            [
                AIRateLimitError(
                    "Rate limit exceeded",
                    provider_label="Provider 1",
                    retry_after_seconds=0.0,
                ),
                build_embedding_result([1.0, 0.0], [0.0, 1.0]),
            ]
        )
        embedder = EmbeddingEngine(client=client)
        first = SimpleNamespace(semantic_embedding=None)
        second = SimpleNamespace(semantic_embedding=None)
        stats = None

        with patch("core.embedder.sleep") as mock_sleep, patch(
            "core.embedder.random.uniform", return_value=0.0
        ):
            stats = embedder.embed_repo(
                SimpleNamespace(
                    commits={
                        "abc123": SimpleNamespace(
                            author="Casey",
                            message="alpha",
                            semantic_embedding=None,
                            file_changes=[
                                SimpleNamespace(
                                    hunks=[],
                                    old_path="src/a.ts",
                                    new_path="src/a.ts",
                                    status=SimpleNamespace(value="modified"),
                                    semantic_embedding=None,
                                ),
                                SimpleNamespace(
                                    hunks=[],
                                    old_path="src/b.ts",
                                    new_path="src/b.ts",
                                    status=SimpleNamespace(value="modified"),
                                    semantic_embedding=None,
                                ),
                            ],
                        )
                    }
                )
            )

        self.assertIsNotNone(stats)
        self.assertEqual(client.calls[0], client.calls[1])
        self.assertEqual(stats.rate_limit_retries, 1)
        self.assertEqual(stats.rate_limit_failures, 0)
        self.assertEqual(stats.rate_limit_sleep_seconds, 0.5)
        mock_sleep.assert_called_once_with(0.5)

    def test_embed_batch_chunks_requests_before_hitting_limit(self) -> None:
        client = Mock()
        client.embed.side_effect = [
            build_embedding_result([1.0, 0.0], [0.0, 1.0]),
            build_embedding_result([0.5, 0.5]),
        ]
        embedder = EmbeddingEngine(client=client, token_limit=10, max_input_tokens=10)
        embedder.token_chars = 1
        first = SimpleNamespace(semantic_embedding=None)
        second = SimpleNamespace(semantic_embedding=None)
        third = SimpleNamespace(semantic_embedding=None)

        embedder.embed_batch(
            [
                (first, "aaaaaa", "semantic_embedding"),
                (second, "bbbb", "semantic_embedding"),
                (third, "cccc", "semantic_embedding"),
            ]
        )

        self.assertEqual(first.semantic_embedding, [1.0, 0.0])
        self.assertEqual(second.semantic_embedding, [0.0, 1.0])
        self.assertEqual(third.semantic_embedding, [0.5, 0.5])
        self.assertEqual(
            [call.kwargs["inputs"] for call in client.embed.call_args_list],
            [["aaaaaa", "bbbb"], ["cccc"]],
        )

    def test_embed_batch_pre_truncates_oversized_input_before_request(self) -> None:
        client = Mock()
        client.embed.return_value = build_embedding_result([0.5, 0.5])
        embedder = EmbeddingEngine(client=client, max_input_tokens=4)
        embedder.token_chars = 1
        repo_object = SimpleNamespace(semantic_embedding=None)

        embedder.embed_batch([(repo_object, "abcdefgh", "semantic_embedding")])

        self.assertEqual(repo_object.semantic_embedding, [0.5, 0.5])
        client.embed.assert_called_once_with(
            model="text-embedding-3-small",
            inputs=["abcd"],
        )

    def test_embed_batch_truncates_single_item_until_request_succeeds(self) -> None:
        client = Mock()
        client.embed.side_effect = [
            AIRequestError("too long"),
            AIRequestError("still too long"),
            build_embedding_result([0.5, 0.5]),
        ]
        embedder = EmbeddingEngine(client=client)
        repo_object = SimpleNamespace(semantic_embedding=None)

        embedder.embed_batch([(repo_object, "abcdefgh", "semantic_embedding")])

        self.assertEqual(repo_object.semantic_embedding, [0.5, 0.5])
        self.assertEqual(
            [call.kwargs["inputs"] for call in client.embed.call_args_list],
            [["abcdefgh"], ["abcd"], ["ab"]],
        )

    def test_embed_batch_does_not_split_on_rate_limit(self) -> None:
        client = SequenceEmbeddingClient(
            [
                AIRateLimitError(
                    "Rate limit exceeded",
                    provider_label="Provider 1",
                    retry_after_seconds=0.0,
                ),
                build_embedding_result([1.0, 0.0], [0.0, 1.0]),
            ]
        )
        embedder = EmbeddingEngine(client=client)
        first = SimpleNamespace(semantic_embedding=None)
        second = SimpleNamespace(semantic_embedding=None)

        with patch("core.embedder.sleep"), patch(
            "core.embedder.random.uniform", return_value=0.0
        ):
            embedder.embed_batch(
                [
                    (first, "first payload", "semantic_embedding"),
                    (second, "second payload", "semantic_embedding"),
                ]
            )

        self.assertEqual(
            client.calls,
            [["first payload", "second payload"], ["first payload", "second payload"]],
        )

    def test_single_item_rate_limit_retries_same_text_without_truncating(self) -> None:
        client = SequenceEmbeddingClient(
            [
                AIRateLimitError(
                    "Rate limit exceeded",
                    provider_label="Provider 1",
                    retry_after_seconds=0.0,
                ),
                build_embedding_result([0.5, 0.5]),
            ]
        )
        embedder = EmbeddingEngine(client=client)
        repo_object = SimpleNamespace(semantic_embedding=None)

        with patch("core.embedder.sleep"), patch(
            "core.embedder.random.uniform", return_value=0.0
        ):
            embedder.embed_batch([(repo_object, "abcdefgh", "semantic_embedding")])

        self.assertEqual(client.calls, [["abcdefgh"], ["abcdefgh"]])
        self.assertEqual(repo_object.semantic_embedding, [0.5, 0.5])

    def test_rate_limit_exhaustion_raises_clear_error(self) -> None:
        client = SequenceEmbeddingClient(
            [
                AIRateLimitError(
                    "Rate limit exceeded",
                    provider_label="Provider 1",
                    retry_after_seconds=0.0,
                )
                for _ in range(EmbeddingEngine.RATE_LIMIT_MAX_ATTEMPTS)
            ]
        )
        embedder = EmbeddingEngine(client=client)
        repo_object = SimpleNamespace(semantic_embedding=None)

        with patch("core.embedder.sleep"), patch(
            "core.embedder.random.uniform", return_value=0.0
        ):
            with self.assertRaises(AIRateLimitError) as context:
                embedder.embed_batch([(repo_object, "abcdefgh", "semantic_embedding")])

        self.assertIn("exceeded provider rate limits", str(context.exception))

    def test_get_batch_embeddings_tracks_rate_limit_stats(self) -> None:
        client = SequenceEmbeddingClient(
            [
                AIRateLimitError(
                    "Rate limit exceeded",
                    provider_label="Provider 1",
                    retry_after_seconds=2.0,
                ),
                build_embedding_result([1.0, 0.0], [0.0, 1.0]),
            ]
        )
        embedder = EmbeddingEngine(client=client, token_limit=100, max_input_tokens=100)
        stats = embedder._build_repo_work_items(SimpleNamespace(commits={}))[1]

        with patch("core.embedder.sleep") as mock_sleep, patch(
            "core.embedder.random.uniform", return_value=0.0
        ):
            result = embedder._embed_batch_texts(["first", "second"], stats=stats)

        self.assertEqual(result, [[1.0, 0.0], [0.0, 1.0]])
        self.assertEqual(stats.rate_limit_retries, 1)
        self.assertEqual(stats.rate_limit_failures, 0)
        self.assertEqual(stats.rate_limit_sleep_seconds, 2.0)
        mock_sleep.assert_called_once_with(2.0)

    def test_get_batch_embeddings_chunks_requests_and_preserves_order(self) -> None:
        client = Mock()
        client.embed.side_effect = [
            build_embedding_result([1.0, 0.0], [0.0, 1.0]),
            build_embedding_result([0.5, 0.5]),
        ]
        embedder = EmbeddingEngine(client=client, token_limit=10, max_input_tokens=10)
        embedder.token_chars = 1

        result = embedder.get_batch_embeddings(["aaaaaa", "bbbb", "cccc"])

        self.assertEqual(result, [[1.0, 0.0], [0.0, 1.0], [0.5, 0.5]])
        self.assertEqual(
            [call.kwargs["inputs"] for call in client.embed.call_args_list],
            [["aaaaaa", "bbbb"], ["cccc"]],
        )

    def test_embed_repo_batches_commit_and_hunks_by_token_limit(self) -> None:
        embedder = RecordingEmbeddingEngine(token_limit=100)
        first_hunk = SimpleNamespace(content="1234", semantic_embedding=None)
        second_hunk = SimpleNamespace(content="5678", semantic_embedding=None)
        file_change = SimpleNamespace(
            hunks=[first_hunk, second_hunk],
            old_path="src/search.ts",
            new_path="src/search.ts",
            status=SimpleNamespace(value="modified"),
            semantic_embedding=None,
        )
        commit = SimpleNamespace(
            author="Casey",
            message="alpha",
            semantic_embedding=None,
            file_changes=[file_change],
        )
        repo = SimpleNamespace(commits={"abc123": commit})

        embedder.embed_repo(repo)

        self.assertEqual(len(embedder.batches), 2)
        self.assertEqual(sum(len(batch) for batch in embedder.batches), 4)
        self.assertIsNotNone(commit.semantic_embedding)
        self.assertIsNotNone(file_change.semantic_embedding)
        self.assertIsNotNone(first_hunk.semantic_embedding)
        self.assertIsNotNone(second_hunk.semantic_embedding)

    def test_embed_repo_uses_pre_truncated_text_for_batch_sizing(self) -> None:
        embedder = RecordingEmbeddingEngine(token_limit=6, max_input_tokens=4)
        first_hunk = SimpleNamespace(content="12345678", semantic_embedding=None)
        second_hunk = SimpleNamespace(content="abcd", semantic_embedding=None)
        file_change = SimpleNamespace(
            hunks=[first_hunk, second_hunk],
            old_path="src/a.ts",
            new_path="src/a.ts",
            status=SimpleNamespace(value="modified"),
            semantic_embedding=None,
        )
        commit = SimpleNamespace(
            author="Casey",
            message=None,
            semantic_embedding=None,
            file_changes=[file_change],
        )
        repo = SimpleNamespace(commits={"abc123": commit})

        embedder.embed_repo(repo)

        flattened_batches = [text for batch in embedder.batches for text in batch]
        self.assertTrue(flattened_batches)
        self.assertTrue(all(len(text) <= 4 for text in flattened_batches))
        self.assertIsNotNone(file_change.semantic_embedding)
        self.assertIsNotNone(first_hunk.semantic_embedding)
        self.assertIsNotNone(second_hunk.semantic_embedding)

    def test_embed_repo_builds_search_docs_without_using_summaries(self) -> None:
        embedder = RecordingEmbeddingEngine(token_limit=1000)
        hunk = SimpleNamespace(
            content="- const oldToken = false;\n+ const authToken = true;\n",
            semantic_embedding=None,
            summary="should not be used",
        )
        file_change = SimpleNamespace(
            hunks=[hunk],
            old_path="src/auth.ts",
            new_path="src/auth.ts",
            status=SimpleNamespace(value="modified"),
            semantic_embedding=None,
            summary="ignored file summary",
        )
        commit = SimpleNamespace(
            author="Casey",
            message="Refine authentication flow",
            semantic_embedding=None,
            file_changes=[file_change],
            summary="ignored commit summary",
        )
        repo = SimpleNamespace(commits={"abc123": commit})

        embedder.embed_repo(repo)

        flattened_batches = [text for batch in embedder.batches for text in batch]
        self.assertTrue(
            any("Commit Message: Refine authentication flow" in text for text in flattened_batches)
        )
        self.assertTrue(
            any("File Change: modified src/auth.ts" in text for text in flattened_batches)
        )
        self.assertTrue(
            any("Hunk Diff:" in text and "authToken = true;" in text for text in flattened_batches)
        )
        self.assertFalse(any("ignored" in text for text in flattened_batches))

    def test_engine_captures_observed_dimension(self) -> None:
        client = Mock()
        client.embed.return_value = build_embedding_result([1.0, 2.0, 3.0])
        embedder = EmbeddingEngine(client=client)

        embedder.embed_query("dimension check")

        self.assertEqual(embedder.observed_dimension, 3)

    def test_embed_repo_populates_ast_embeddings_separately_from_search_docs(self) -> None:
        embedder = RecordingEmbeddingEngine(token_limit=1000)
        hunk = SimpleNamespace(
            content="+ return handler(token)\n",
            semantic_embedding=None,
            ast_summary="Language: python\nPath: backend/src/service.py\nSymbol: Service.handle\nKind: method\nChanges: added call handler",
            ast_embedding=None,
        )
        file_change = SimpleNamespace(
            hunks=[hunk],
            old_path="backend/src/service.py",
            new_path="backend/src/service.py",
            status=SimpleNamespace(value="modified"),
            semantic_embedding=None,
            ast_summary="Language: python\nPath: backend/src/service.py\nTop Symbols: Service.handle",
            ast_embedding=None,
        )
        commit = SimpleNamespace(
            author="Casey",
            message="Refine service logic",
            semantic_embedding=None,
            file_changes=[file_change],
        )
        repo = SimpleNamespace(commits={"abc123": commit})

        embedder.embed_repo(repo)

        flattened_batches = [text for batch in embedder.batches for text in batch]
        self.assertIsNotNone(file_change.ast_embedding)
        self.assertIsNotNone(hunk.ast_embedding)
        self.assertTrue(any("Top Symbols: Service.handle" in text for text in flattened_batches))
        self.assertTrue(any("Symbol: Service.handle" in text for text in flattened_batches))

    def test_embed_repo_builds_ast_work_items_even_when_semantic_is_already_present(self) -> None:
        embedder = RecordingEmbeddingEngine(token_limit=1000)
        hunk = SimpleNamespace(
            content="+ return handler(token)\n",
            semantic_embedding=[0.1, 0.2],
            ast_summary="Language: python\nPath: backend/src/service.py\nSymbol: Service.handle\nKind: method",
            ast_embedding=None,
        )
        file_change = SimpleNamespace(
            hunks=[hunk],
            old_path="backend/src/service.py",
            new_path="backend/src/service.py",
            status=SimpleNamespace(value="modified"),
            semantic_embedding=[0.1, 0.2],
            ast_summary="Language: python\nPath: backend/src/service.py\nTop Symbols: Service.handle",
            ast_embedding=None,
        )
        commit = SimpleNamespace(
            author="Casey",
            message="Refine service logic",
            semantic_embedding=[0.1, 0.2],
            file_changes=[file_change],
        )

        stats = embedder.embed_repo(SimpleNamespace(commits={"abc123": commit}))

        self.assertEqual(stats.semantic_work_items, 0)
        self.assertEqual(stats.ast_work_items, 2)
        self.assertIsNotNone(file_change.ast_embedding)
        self.assertIsNotNone(hunk.ast_embedding)

    def test_get_batch_embeddings_respects_configured_concurrency_cap(self) -> None:
        client = TrackingEmbeddingClient()
        embedder = EmbeddingEngine(
            client=client,
            token_limit=1,
            max_input_tokens=10,
        )
        embedder.token_chars = 10
        releaser = Timer(0.05, client.release.set)
        releaser.start()

        result = embedder.get_batch_embeddings(["a", "b", "c", "d"])

        self.assertEqual(len(result), 4)
        self.assertTrue(client.reached_target.is_set())
        self.assertLessEqual(client.max_active, 4)


if __name__ == "__main__":
    unittest.main()
