from core.embedder import Embedder
from core.repo import Repo
import time

embedder = Embedder()

# print("Testing single Embedding")
# print(embedder.embed_query("What is the meaning of life?"))

# print("Testing batch Embedding")
# print(embedder.get_batch_embeddings(["What is the meaning of life?", "What is the meaning of death?"]))


print("Testing repo embedding")
start_time = time.time()
repo = Repo(
        url="https://github.com/DylanPina/RUCS-Hub",
        context_lines=3,
        max_commits=50,
    )
embedder.embed_repo(repo)
end_time = time.time()
print("Repo embedded in %s seconds" % (end_time - start_time))
# print(repo.commits['d54610e66d1ad9a12d63d040d1f2a1d217dd31b9'])