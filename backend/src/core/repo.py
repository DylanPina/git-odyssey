import os

import pygit2

from core.branch import Branch
from data.schema import (
    FileChangeStatus,
    SQLBranch,
    SQLCommit,
    SQLDiffHunk,
    SQLFileChange,
    SQLFileSnapshot,
    SQLRepo,
)
from utils.logger import logger

DETACHED_HEAD_BRANCH_NAME = "HEAD (detached)"


def normalize_repo_path(repo_path: str) -> str:
    if not repo_path:
        raise ValueError("Repository path is required.")

    return os.path.realpath(os.path.abspath(os.path.expanduser(repo_path)))


class Repo:
    def __init__(
        self,
        repo_path: str,
        context_lines: int = 0,
        max_commits: int | None = None,
    ):
        self.context_lines = context_lines
        self.max_commits = max_commits
        self.repo, self.repo_path = self.open_repo(repo_path)
        self.name = os.path.basename(self.repo_path.rstrip(os.sep)) or self.repo_path
        self.commits = {}
        self.branch_specs = self._build_branch_specs(self.repo)
        self.branches = [self._get_branch(spec) for spec in self.branch_specs]

    @classmethod
    def discover_repo_path(cls, repo_path: str) -> str:
        _, resolved_path = cls.open_repo(repo_path)
        return resolved_path

    @classmethod
    def get_branch_heads(cls, repo_path: str) -> tuple[str, dict[str, str]]:
        pygit_repo, resolved_path = cls.open_repo(repo_path)
        branch_heads = {}

        for branch_spec in cls._build_branch_specs(pygit_repo):
            if branch_spec["target_oid"] is None:
                continue
            branch_heads[branch_spec["name"]] = str(branch_spec["target_oid"])

        return resolved_path, branch_heads

    @classmethod
    def open_repo(cls, repo_path: str) -> tuple[pygit2.Repository, str]:
        normalized_input = normalize_repo_path(repo_path)
        discovered_path = pygit2.discover_repository(normalized_input)
        if not discovered_path:
            raise ValueError(
                f"Git project not found at {normalized_input}. Re-select the folder from Home."
            )

        try:
            pygit_repo = pygit2.Repository(discovered_path)
        except Exception as error:
            raise ValueError(f"Failed to open the Git project at {normalized_input}: {error}")

        if pygit_repo.is_bare:
            resolved_path = normalize_repo_path(discovered_path)
        else:
            resolved_path = normalize_repo_path(
                pygit_repo.workdir or os.path.dirname(discovered_path)
            )

        logger.info("Opened local repository at %s", resolved_path)
        return pygit_repo, resolved_path

    @staticmethod
    def _build_branch_specs(pygit_repo: pygit2.Repository) -> list[dict[str, object]]:
        if not pygit_repo.head_is_unborn and pygit_repo.head_is_detached:
            head_target = pygit_repo.head.target if pygit_repo.head else None
            return [
                {
                    "name": DETACHED_HEAD_BRANCH_NAME,
                    "reference_name": None,
                    "target_oid": head_target,
                }
            ]

        branch_specs = []
        for branch_name in sorted(pygit_repo.listall_branches(pygit2.GIT_BRANCH_LOCAL)):
            branch = pygit_repo.lookup_branch(branch_name, pygit2.GIT_BRANCH_LOCAL)
            target_oid = branch.target if branch is not None else None
            branch_specs.append(
                {
                    "name": branch_name,
                    "reference_name": f"refs/heads/{branch_name}",
                    "target_oid": target_oid,
                }
            )

        return branch_specs

    def to_sql(self) -> SQLRepo:
        """Parse the repository into SQLAlchemy models."""
        sql_commits: dict[str, SQLCommit] = {}

        last_snapshot_by_path: dict[str, SQLFileSnapshot] = {}
        for sha, commit in sorted(self.commits.items(), key=lambda item: item[1].time):
            logger.info("Processing commit: %s", sha)

            sql_commit = SQLCommit(
                sha=commit.sha,
                parents=commit.parents,
                author=commit.author,
                email=commit.email,
                time=commit.time,
                message=commit.message,
                summary=commit.summary,
                semantic_embedding=commit.semantic_embedding,
                repo_path=self.repo_path,
            )

            sql_file_changes = []
            for file_change in commit.file_changes:
                sanitized_snapshot_text = (
                    (file_change.snapshot.content if file_change.snapshot else "")
                ).replace("\x00", "")

                sql_fc = SQLFileChange(
                    old_path=file_change.old_path,
                    new_path=file_change.new_path,
                    status=file_change.status.value,
                    summary=file_change.summary,
                    semantic_embedding=file_change.semantic_embedding,
                    commit_sha=commit.sha,
                )

                if file_change.snapshot:
                    snapshot_path = file_change.snapshot.path
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

                sql_hunks = []
                for hunk in file_change.hunks:
                    sql_hunk = SQLDiffHunk(
                        old_start=hunk.old_start,
                        old_lines=hunk.old_lines,
                        new_start=hunk.new_start,
                        new_lines=hunk.new_lines,
                        content=hunk.content,
                        summary=hunk.summary,
                        semantic_embedding=hunk.semantic_embedding,
                        commit_sha=commit.sha,
                    )
                    sql_hunks.append(sql_hunk)

                sql_fc.hunks = sql_hunks
                sql_file_changes.append(sql_fc)

            sql_commit.file_changes = sql_file_changes
            sql_commits[sha] = sql_commit

        sql_branches = []
        for branch in self.branches:
            branch_commits = [
                sql_commits[sha] for sha in branch.commits if sha in sql_commits
            ]

            sql_branch = SQLBranch(
                name=branch.name,
                repo_path=self.repo_path,
                head_commit_sha=branch.head_commit_sha,
                commits=branch_commits,
            )
            sql_branches.append(sql_branch)

        sql_repo = SQLRepo(
            path=self.repo_path,
            branches=sql_branches,
            commits=list(sql_commits.values()),
        )

        logger.info(
            "Parsed repo at %s with %s commits and %s branches",
            self.repo_path,
            len(sql_commits),
            len(sql_branches),
        )
        return sql_repo

    def output_branches(self):
        for branch in self.branches:
            branch.output()

    def _get_branch(self, branch_spec: dict[str, object]) -> Branch:
        return Branch(
            repo=self.repo,
            repo_path=self.repo_path,
            name=str(branch_spec["name"]),
            reference_name=branch_spec["reference_name"],
            target_oid=branch_spec["target_oid"],
            all_commits=self.commits,
            context_lines=self.context_lines,
            max_commits=self.max_commits,
        )
