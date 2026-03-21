import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from core.embedder import EmbeddingEngine
from infrastructure.ai_clients import EmbeddingResult
from infrastructure.errors import AIRequestError


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

    def embed_batch(self, repo_objects):
        self.batches.append([text for _, text, _ in repo_objects])
        for batch_index, (obj, _, field_name) in enumerate(repo_objects):
            setattr(obj, field_name, [float(len(self.batches)), float(batch_index)])


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
        embedder = RecordingEmbeddingEngine()
        first_hunk = SimpleNamespace(content="1234", semantic_embedding=None)
        second_hunk = SimpleNamespace(content="5678", semantic_embedding=None)
        file_change = SimpleNamespace(hunks=[first_hunk, second_hunk])
        commit = SimpleNamespace(
            author="Casey",
            message="alpha",
            semantic_embedding=None,
            file_changes=[file_change],
        )
        repo = SimpleNamespace(commits={"abc123": commit})

        embedder.embed_repo(repo)

        self.assertEqual(len(embedder.batches), 2)
        self.assertEqual(len(embedder.batches[0]), 1)
        self.assertEqual(len(embedder.batches[1]), 2)
        self.assertIsNotNone(commit.semantic_embedding)
        self.assertIsNotNone(first_hunk.semantic_embedding)
        self.assertIsNotNone(second_hunk.semantic_embedding)

    def test_embed_repo_uses_pre_truncated_text_for_batch_sizing(self) -> None:
        embedder = RecordingEmbeddingEngine(token_limit=6, max_input_tokens=4)
        first_hunk = SimpleNamespace(content="12345678", semantic_embedding=None)
        second_hunk = SimpleNamespace(content="abcd", semantic_embedding=None)
        file_change = SimpleNamespace(hunks=[first_hunk, second_hunk])
        commit = SimpleNamespace(
            author="Casey",
            message=None,
            semantic_embedding=None,
            file_changes=[file_change],
        )
        repo = SimpleNamespace(commits={"abc123": commit})

        embedder.embed_repo(repo)

        self.assertEqual(embedder.batches, [["1234"], ["abcd"]])
        self.assertIsNotNone(first_hunk.semantic_embedding)
        self.assertIsNotNone(second_hunk.semantic_embedding)

    def test_engine_captures_observed_dimension(self) -> None:
        client = Mock()
        client.embed.return_value = build_embedding_result([1.0, 2.0, 3.0])
        embedder = EmbeddingEngine(client=client)

        embedder.embed_query("dimension check")

        self.assertEqual(embedder.observed_dimension, 3)


if __name__ == "__main__":
    unittest.main()
