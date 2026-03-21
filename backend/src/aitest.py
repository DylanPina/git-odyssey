import os
import time

from openai import OpenAI

from core.embedder import OpenAIEmbedder
from core.repo import Repo


def get_embedder() -> OpenAIEmbedder:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("Set OPENAI_API_KEY before running this smoke test.")

    return OpenAIEmbedder(client=OpenAI(api_key=api_key))


embedder = get_embedder()

print("Testing single Embedding")
print(embedder.embed_query("What is the meaning of life?"))

print("Testing batch Embedding")
print(embedder.get_batch_embeddings(["What is the meaning of life?", "What is the meaning of death?"]))


print("Testing repo embedding")
start_time = time.time()
repo = Repo(
        url="http://github.com/DylanPina/dsp.dev",
        context_lines=3,
        max_commits=10,
    )
embedder.embed_repo(repo)
end_time = time.time()
print("Repo embedded in %s seconds" % (end_time - start_time))
print(repo.commits['d54610e66d1ad9a12d63d040d1f2a1d217dd31b9'])
