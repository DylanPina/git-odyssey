from core.embedder import Embedder
from core.repo import Repo
embedder = Embedder()

print("Testing single Embedding")
print(embedder.embed_query("What is the meaning of life?"))

print("Testing batch Embedding")
print(embedder.get_batch_embeddings(["What is the meaning of life?", "What is the meaning of death?"]))


print("Testing repo embedding")
repo = Repo(
        url="http://github.com/DylanPina/dsp.dev",
        context_lines=3,
        max_commits=2,
    )
embedder.embed_repo(repo)
print("Repo embedded")
print(repo.commits['d54610e66d1ad9a12d63d040d1f2a1d217dd31b9'])