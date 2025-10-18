import os
from core.repo import Repo
from utils.utils import delete_dir_if_exists


if __name__ == "__main__":
    repo_path = os.path.join(os.path.dirname(
        __file__), "..", "api", "repo.git")
    delete_dir_if_exists(repo_path)

    repo = Repo(
        url="http://github.com/DylanPina/dsp.dev",
        context_lines=3,
        max_commits=10,
    )

    print("Branches:")
    for branch in repo.branches:
        print(branch.name)

    print("Commits:")
    for commit in repo.commits:
        print(commit.sha)

    print("To SQL:")
    print(repo.to_sql())

    repo.rm()
