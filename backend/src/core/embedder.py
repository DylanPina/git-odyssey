from google import genai
from google.genai import types
from langchain_openai import OpenAIEmbeddings

from typing import List, Any
from core.repo import Repo
from abc import ABC, abstractmethod


# Set GEMINI_API_KEY variable in .env file
class BaseEmbedder(ABC):
    """Abstract base class for embedding implementations"""

    def __init__(self, model: str, token_limit: int, embedding_dim: int):
        self.model = model
        self.token_limit = token_limit
        self.embedding_dim = embedding_dim
        self.token_chars = 3

    @abstractmethod
    def embed_batch(self, repo_objects: List[Any]) -> None:
        """Embed a batch of repo objects"""
        pass

    @abstractmethod
    def embed_query(self, query: str) -> List[float]:
        """Embed a single query"""
        pass

    @abstractmethod
    def get_batch_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Get batch embeddings for a list of texts"""
        pass

    def embed_repo(self, repo: Repo):
        """Generate embeddings for commit messages and hunk patches"""
        print(
            f"Starting embedding generation for repository with {len(repo.commits)} commits..."
        )
        repo_objects = []
        total_repo_objects = 0
        num_tokens = 0

        for commit in repo.commits.values():
            if commit.message is not None and commit.embedding is None:
                repo_objects.append((commit, commit.message, "embedding"))
                num_tokens += len(commit.message) // self.token_chars

            for file_change in commit.file_changes:
                for hunk in file_change.hunks:
                    if hunk.content is not None and hunk.embedding is None:
                        content_tokens = len(hunk.content) // self.token_chars
                        if content_tokens + num_tokens > self.token_limit:
                            print(
                                f"Reached token limit of {self.token_limit} with {num_tokens} tokens. Embedding {len(repo_objects)} objects."
                            )
                            self.embed_batch(repo_objects)
                            total_repo_objects += len(repo_objects)
                            repo_objects = []
                            num_tokens = 0
                            repo_objects.append((hunk, hunk.content, "embedding"))
                            num_tokens += content_tokens

        if repo_objects:
            self.embed_batch(repo_objects)
            total_repo_objects += len(repo_objects)

        print(f"Successfully embedded {total_repo_objects} summaries!")


class GeminiEmbedder(BaseEmbedder):
    def __init__(self):
        super().__init__(
            model="gemini-embedding-001", token_limit=2048, embedding_dim=1536
        )
        self.embedder = genai.Client()

    def embed_batch(self, repo_objects: List[Any]) -> None:
        """Embed a batch of repo objects"""
        embeddings = self.embedder.models.embed_content(
            model=self.model,
            contents=[text for obj, text, _ in repo_objects],
            config=types.EmbedContentConfig(output_dimensionality=self.embedding_dim),
        ).embeddings
        for (obj, _, field_name), embedding in zip(repo_objects, embeddings):
            setattr(obj, field_name, embedding.values)

    def embed_query(self, query: str) -> List[float]:
        """Embed a single query"""
        result = self.embedder.models.embed_content(
            model=self.model,
            contents=query,
            config=types.EmbedContentConfig(output_dimensionality=self.embedding_dim),
        )
        return result.embeddings[0].values

    def get_batch_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Get batch embeddings for a list of texts"""
        result = self.embedder.models.embed_content(
            model=self.model,
            contents=texts,
            config=types.EmbedContentConfig(output_dimensionality=self.embedding_dim),
        )
        return [embedding.values for embedding in result.embeddings]


class OpenAIEmbedder(BaseEmbedder):
    def __init__(self):
        super().__init__(
            model="text-embedding-3-small", token_limit=25000, embedding_dim=1536
        )
        self.embedder = OpenAIEmbeddings(model=self.model)

    def embed_batch(self, repo_objects: List[Any]) -> None:
        embeddings = self.embedder.embed_documents(
            [text for obj, text, _ in repo_objects]
        )
        for (obj, _, field_name), embedding in zip(repo_objects, embeddings):
            setattr(obj, field_name, embedding)

    def embed_query(self, query: str) -> List[float]:
        return self.embedder.embed_query(query)

    def get_batch_embeddings(self, texts: List[str]) -> List[List[float]]:
        return self.embedder.embed_documents(texts)
