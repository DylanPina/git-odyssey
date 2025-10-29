import os
from copy import deepcopy
import pygit2
from core.branch import Branch
from utils.logger import logger
from utils.utils import delete_dir_if_exists, parse_github_url
from data.schema import (
    SQLBranch,
    SQLCommit,
    SQLFileChange,
    SQLDiffHunk,
    SQLRepo,
    SQLFileSnapshot,
    FileChangeStatus,
)


class Repo:
    def __init__(
        self,
        url: str,
        context_lines: int = 0,
        max_commits: int = None,
        local_path: str = None,
    ):
        self.url = url
        self.context_lines = context_lines
        self.max_commits = max_commits
        self.repo = self.clone_repo(url, local_path)
        self.commits = {}
        self.branches = self._get_branches()

    def clone_repo(self, url: str, local_path: str) -> pygit2.Repository:
        """
        Clones the repository into a local directory and returns the pygit2.Repository object.
        Sets the owner, name, repo_dir, repo_path, main_branch attributes.
        """
        self.owner, self.name = parse_github_url(url)
        self.repo_path = local_path

        logger.info(f"Cloning repository {url} into {self.repo_path}")
        try:
            pygit_repo = pygit2.clone_repository(
                url,
                self.repo_path,
                depth=self.max_commits,
                bare=True,
            )
        except Exception as e:
            raise Exception(f"Failed to clone repository: {e}")

        logger.info(f"Cloned repository {url} into {self.repo_path}/main")

        self.branch_names = [
            branch_name.decode("utf-8")
            for branch_name in pygit_repo.raw_listall_branches(pygit2.GIT_BRANCH_REMOTE)
        ]
        logger.info(f"Remote branch names={self.branch_names}")
        logger.info(f"References={[ref for ref in pygit_repo.references]}")

        head_ref = pygit_repo.references.get("HEAD")
        logger.info(f"HEAD is tracking: {head_ref.raw_target.decode('utf-8')}")

        self.main_branch = (
            pygit_repo.references.get("HEAD").raw_target.decode("utf-8").split("/")[-1]
        )
        logger.info(f"Main branch is: {self.main_branch}")

        return pygit_repo

    def to_sql(self) -> SQLRepo:
        """Parse the repository into SQLAlchemy models."""
        # Create SQLAlchemy commits first
        sql_commits: dict[str, SQLCommit] = {}

        # Process all commits from the CoreRepo
        last_snapshot_by_path: dict[str, SQLFileSnapshot] = {}
        for sha, commit in sorted(self.commits.items(), key=lambda x: x[1].time):
            logger.info(f"Processing commit: {sha}")

            # Create SQLAlchemy commit
            sql_commit = SQLCommit(
                sha=commit.sha,
                parents=commit.parents,
                author=commit.author,
                email=commit.email,
                time=commit.time,
                message=commit.message,
                summary=commit.summary,
                embedding=commit.embedding,
                repo_url=self.url,
            )

            sql_file_changes = []
            for file_change in commit.file_changes:
                # Sanitize snapshot to ensure no NULs are stored in DB
                sanitized_snapshot_text = (
                    (file_change.snapshot.content if file_change.snapshot else "")
                ).replace("\x00", "")

                sql_fc = SQLFileChange(
                    old_path=file_change.old_path,
                    new_path=file_change.new_path,
                    status=file_change.status.value,  # Store enum as string
                    summary=file_change.summary,
                    embedding=file_change.embedding,
                    commit_sha=commit.sha,
                )

                # Create snapshot record if present
                if file_change.snapshot:
                    snapshot_path = file_change.snapshot.path
                    # For renames or copies, the previous snapshot should be looked up by old_path
                    previous_key = (
                        file_change.old_path
                        if file_change.status
                        in {FileChangeStatus.RENAMED, FileChangeStatus.COPIED}
                        else snapshot_path
                    )
                    sql_snapshot = SQLFileSnapshot(
                        path=snapshot_path,
                        content=sanitized_snapshot_text,
                        previous_snapshot=last_snapshot_by_path.get(previous_key),
                    )
                    sql_fc.snapshot = sql_snapshot
                    last_snapshot_by_path[snapshot_path] = sql_snapshot

                # Process hunks for this file change
                sql_hunks = []
                for hunk in file_change.hunks:
                    sql_hunk = SQLDiffHunk(
                        old_start=hunk.old_start,
                        old_lines=hunk.old_lines,
                        new_start=hunk.new_start,
                        new_lines=hunk.new_lines,
                        content=hunk.content,
                        summary=hunk.summary,
                        embedding=hunk.embedding,
                        diff_embedding=hunk.diff_embedding,
                        commit_sha=commit.sha,
                    )
                    sql_hunks.append(sql_hunk)

                # Set the hunks relationship
                sql_fc.hunks = sql_hunks
                sql_file_changes.append(sql_fc)

            # Set the file changes relationship
            sql_commit.file_changes = sql_file_changes
            sql_commits[sha] = sql_commit

        # Create SQLAlchemy branches
        sql_branches = []
        for branch in self.branches:
            # Get the commits for this branch that exist in our sql_commits
            branch_commits = [
                sql_commits[sha] for sha in branch.commits if sha in sql_commits
            ]

            sql_branch = SQLBranch(
                name=branch.name, repo_url=self.url, commits=branch_commits
            )
            sql_branches.append(sql_branch)

        # Create the final SQLAlchemy repo
        sql_repo = SQLRepo(
            url=self.url, branches=sql_branches, commits=list(sql_commits.values())
        )

        logger.info(
            f"Parsed repo with {len(sql_commits)} commits and {len(sql_branches)} branches"
        )
        return sql_repo

    def rm(self):
        delete_dir_if_exists(self.repo_dir)

    def output_branches(self):
        for branch in self.branches:
            branch.output()

    def _get_branches(self) -> list[Branch]:
        return [
            self._get_branch(name)
            for name in self.branch_names
            if name != "origin/HEAD"
        ]

    def _get_branch(self, branch_name: str) -> Branch:
        return Branch(
            repo=self.repo,
            repo_url=self.url,
            name=branch_name,
            all_commits=self.commits,
        )
