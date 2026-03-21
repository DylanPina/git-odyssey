import unittest
from types import SimpleNamespace
from unittest.mock import Mock

import httpx
from openai import BadRequestError

from core.embedder import OpenAIEmbedder


def build_bad_request_error(message: str = "bad request") -> BadRequestError:
    request = httpx.Request("POST", "https://api.openai.com/v1/embeddings")
    response = httpx.Response(400, request=request)
    return BadRequestError(message, response=response, body={"error": {"message": message}})


class RecordingOpenAIEmbedder(OpenAIEmbedder):
    def __init__(
        self,
        token_limit: int = 10,
        max_input_tokens: int = 5000,
    ) -> None:
        super().__init__(
            client=Mock(),
            model="text-embedding-3-small",
            token_limit=token_limit,
            embedding_dim=3,
            max_input_tokens=max_input_tokens,
        )
        self.token_chars = 1
        self.batches = []

    def embed_batch(self, repo_objects):
        self.batches.append([text for _, text, _ in repo_objects])
        for batch_index, (obj, _, field_name) in enumerate(repo_objects):
            setattr(obj, field_name, [float(len(self.batches)), float(batch_index)])


class OpenAIEmbedderTests(unittest.TestCase):
    def test_embed_query_returns_single_vector(self) -> None:
        client = Mock()
        client.embeddings.create.return_value = SimpleNamespace(
            data=[SimpleNamespace(embedding=[0.1, 0.2, 0.3])]
        )
        embedder = OpenAIEmbedder(client=client)

        result = embedder.embed_query("auth changes")

        self.assertEqual(result, [0.1, 0.2, 0.3])
        client.embeddings.create.assert_called_once_with(
            model="text-embedding-3-small",
            input="auth changes",
        )

    def test_get_batch_embeddings_returns_all_vectors(self) -> None:
        client = Mock()
        client.embeddings.create.return_value = SimpleNamespace(
            data=[
                SimpleNamespace(embedding=[1.0, 0.0]),
                SimpleNamespace(embedding=[0.0, 1.0]),
            ]
        )
        embedder = OpenAIEmbedder(client=client)

        result = embedder.get_batch_embeddings(["first", "second"])

        self.assertEqual(result, [[1.0, 0.0], [0.0, 1.0]])
        client.embeddings.create.assert_called_once_with(
            model="text-embedding-3-small",
            input=["first", "second"],
        )

    def test_get_batch_embeddings_skips_empty_requests(self) -> None:
        client = Mock()
        embedder = OpenAIEmbedder(client=client)

        result = embedder.get_batch_embeddings([])

        self.assertEqual(result, [])
        client.embeddings.create.assert_not_called()

    def test_embed_batch_retries_bad_request_in_smaller_chunks(self) -> None:
        client = Mock()
        client.embeddings.create.side_effect = [
            build_bad_request_error(),
            SimpleNamespace(data=[SimpleNamespace(embedding=[1.0, 0.0])]),
            SimpleNamespace(data=[SimpleNamespace(embedding=[0.0, 1.0])]),
        ]
        embedder = OpenAIEmbedder(client=client)
        first = SimpleNamespace(embedding=None)
        second = SimpleNamespace(embedding=None)

        embedder.embed_batch(
            [(first, "first payload", "embedding"), (second, "second payload", "embedding")]
        )

        self.assertEqual(first.embedding, [1.0, 0.0])
        self.assertEqual(second.embedding, [0.0, 1.0])
        self.assertEqual(
            [call.kwargs["input"] for call in client.embeddings.create.call_args_list],
            [["first payload", "second payload"], "first payload", "second payload"],
        )

    def test_embed_batch_chunks_requests_before_hitting_limit(self) -> None:
        client = Mock()
        client.embeddings.create.side_effect = [
            SimpleNamespace(
                data=[
                    SimpleNamespace(embedding=[1.0, 0.0]),
                    SimpleNamespace(embedding=[0.0, 1.0]),
                ]
            ),
            SimpleNamespace(data=[SimpleNamespace(embedding=[0.5, 0.5])]),
        ]
        embedder = OpenAIEmbedder(client=client, token_limit=10, max_input_tokens=10)
        embedder.token_chars = 1
        first = SimpleNamespace(embedding=None)
        second = SimpleNamespace(embedding=None)
        third = SimpleNamespace(embedding=None)

        embedder.embed_batch(
            [
                (first, "aaaaaa", "embedding"),
                (second, "bbbb", "embedding"),
                (third, "cccc", "embedding"),
            ]
        )

        self.assertEqual(first.embedding, [1.0, 0.0])
        self.assertEqual(second.embedding, [0.0, 1.0])
        self.assertEqual(third.embedding, [0.5, 0.5])
        self.assertEqual(
            [call.kwargs["input"] for call in client.embeddings.create.call_args_list],
            [["aaaaaa", "bbbb"], "cccc"],
        )

    def test_embed_batch_pre_truncates_oversized_input_before_request(self) -> None:
        client = Mock()
        client.embeddings.create.return_value = SimpleNamespace(
            data=[SimpleNamespace(embedding=[0.5, 0.5])]
        )
        embedder = OpenAIEmbedder(client=client, max_input_tokens=4)
        embedder.token_chars = 1
        repo_object = SimpleNamespace(embedding=None)

        embedder.embed_batch([(repo_object, "abcdefgh", "embedding")])

        self.assertEqual(repo_object.embedding, [0.5, 0.5])
        client.embeddings.create.assert_called_once_with(
            model="text-embedding-3-small",
            input="abcd",
        )

    def test_embed_batch_truncates_single_item_until_openai_accepts_it(self) -> None:
        client = Mock()
        client.embeddings.create.side_effect = [
            build_bad_request_error("too long"),
            build_bad_request_error("still too long"),
            SimpleNamespace(data=[SimpleNamespace(embedding=[0.5, 0.5])]),
        ]
        embedder = OpenAIEmbedder(client=client)
        repo_object = SimpleNamespace(embedding=None)

        embedder.embed_batch([(repo_object, "abcdefgh", "embedding")])

        self.assertEqual(repo_object.embedding, [0.5, 0.5])
        self.assertEqual(
            [call.kwargs["input"] for call in client.embeddings.create.call_args_list],
            ["abcdefgh", "abcd", "ab"],
        )

    def test_get_batch_embeddings_chunks_requests_and_preserves_order(self) -> None:
        client = Mock()
        client.embeddings.create.side_effect = [
            SimpleNamespace(
                data=[
                    SimpleNamespace(embedding=[1.0, 0.0]),
                    SimpleNamespace(embedding=[0.0, 1.0]),
                ]
            ),
            SimpleNamespace(data=[SimpleNamespace(embedding=[0.5, 0.5])]),
        ]
        embedder = OpenAIEmbedder(client=client, token_limit=10, max_input_tokens=10)
        embedder.token_chars = 1

        result = embedder.get_batch_embeddings(["aaaaaa", "bbbb", "cccc"])

        self.assertEqual(result, [[1.0, 0.0], [0.0, 1.0], [0.5, 0.5]])
        self.assertEqual(
            [call.kwargs["input"] for call in client.embeddings.create.call_args_list],
            [["aaaaaa", "bbbb"], "cccc"],
        )

    def test_embed_repo_batches_commit_and_hunks_by_token_limit(self) -> None:
        embedder = RecordingOpenAIEmbedder()
        first_hunk = SimpleNamespace(content="1234", embedding=None)
        second_hunk = SimpleNamespace(content="5678", embedding=None)
        file_change = SimpleNamespace(hunks=[first_hunk, second_hunk])
        commit = SimpleNamespace(
            author="Casey",
            message="alpha",
            embedding=None,
            file_changes=[file_change],
        )
        repo = SimpleNamespace(commits={"abc123": commit})

        embedder.embed_repo(repo)

        self.assertEqual(len(embedder.batches), 2)
        self.assertEqual(len(embedder.batches[0]), 1)
        self.assertEqual(len(embedder.batches[1]), 2)
        self.assertIsNotNone(commit.embedding)
        self.assertIsNotNone(first_hunk.embedding)
        self.assertIsNotNone(second_hunk.embedding)

    def test_embed_repo_uses_pre_truncated_text_for_batch_sizing(self) -> None:
        embedder = RecordingOpenAIEmbedder(token_limit=6, max_input_tokens=4)
        first_hunk = SimpleNamespace(content="12345678", embedding=None)
        second_hunk = SimpleNamespace(content="abcd", embedding=None)
        file_change = SimpleNamespace(hunks=[first_hunk, second_hunk])
        commit = SimpleNamespace(
            author="Casey",
            message=None,
            embedding=None,
            file_changes=[file_change],
        )
        repo = SimpleNamespace(commits={"abc123": commit})

        embedder.embed_repo(repo)

        self.assertEqual(embedder.batches, [["1234"], ["abcd"]])
        self.assertIsNotNone(first_hunk.embedding)
        self.assertIsNotNone(second_hunk.embedding)


if __name__ == "__main__":
    unittest.main()
