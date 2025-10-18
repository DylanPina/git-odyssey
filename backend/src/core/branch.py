import os
import pygit2

from data.data_model import Commit, FileChange, FileChangeStatus, FileSnapshot, DiffHunk
from typing import Optional


class Branch:
    def __init__(self, repo: pygit2.Repository, repo_url: str, name: str, all_commits: dict[str, Commit], context_lines: int = 3):
        self.repo = repo
        self.repo_url = repo_url
        self.name = name
        self.all_commits = all_commits
        self.context_lines = context_lines
        self.commits = self._get_commit_shas()
        self.head_commit = self.commits[0] if self.commits else ""

    def _get_commit_shas(self) -> list[str]:
        """
        Returns a list of the commits for the repository.

        Args:
            ref: Git reference to start walking from (default: "HEAD")
            context_lines: Number of context lines to include in diffs
            max_commits: Maximum number of commits to process (None for unlimited)
        """
        tip = self.repo.revparse_single(self.name)
        walker = self.repo.walk(tip.id)
        commits: list[str] = []

        for commit in walker:
            if (sha := str(commit.id)) in self.all_commits:
                commits.append(self.all_commits[sha].sha)
                continue

            # Compute the diff for this commit vs parent (or root)
            if commit.parents:
                diff = self.repo.diff(
                    commit.parents[0], commit, context_lines=self.context_lines
                )
            else:
                # Root commit: diff the empty tree against commit.tree
                diff = commit.tree.diff_to_tree(
                    context_lines=self.context_lines)

            author_name = commit.author.name if commit.author else None
            author_email = commit.author.email if commit.author else None
            commit_time = commit.commit_time
            commit_message = commit.message.strip() if commit.message else ""

            file_changes = []
            commit_sha = str(commit.id)

            # Iterate over file patches
            for patch in diff:
                delta = patch.delta
                hunks = []

                for h in patch.hunks:
                    # Build the raw diff content for this hunk efficiently
                    hunk_lines = []
                    for ln in h.lines:
                        content = (
                            ln.content.decode("utf-8", "replace")
                            if isinstance(ln.content, (bytes, bytearray))
                            else ln.content
                        )
                        hunk_lines.append(f"{ln.origin}{content}")

                    hunk_content = "".join(hunk_lines)

                    hunks.append(
                        DiffHunk(
                            old_start=h.old_start,
                            old_lines=h.old_lines,
                            new_start=h.new_start,
                            new_lines=h.new_lines,
                            content=hunk_content,
                            commit_sha=commit_sha,
                        )
                    )

                # Determine which snapshot to display
                status_enum = self._get_file_change_status(delta.status)
                snapshot_text: Optional[str] = None
                if status_enum == FileChangeStatus.DELETED:
                    # For deletions, the file exists in the parent tree
                    if commit.parents:
                        parent_tree = commit.parents[0].tree
                        snapshot_text = self._get_snapshot(
                            parent_tree, delta.old_file.path
                        )
                else:
                    # For adds/modifies/etc, take the new version from this commit
                    snapshot_text = self._get_snapshot(
                        commit.tree, delta.new_file.path)

                # Build pydantic FileSnapshot for API layer
                snapshot_path = (
                    delta.old_file.path if status_enum == FileChangeStatus.DELETED else delta.new_file.path
                )
                snapshot = FileSnapshot(
                    path=snapshot_path,
                    content=snapshot_text or "",
                    commit_sha=commit_sha,
                )
                file_change = FileChange(
                    old_path=delta.old_file.path,
                    new_path=delta.new_file.path,
                    status=status_enum,
                    hunks=hunks,
                    snapshot=snapshot,
                    commit_sha=commit_sha,
                )
                file_changes.append(file_change)

            commit = Commit(
                sha=sha,
                repo_url=self.repo_url,
                parents=[str(parent.id) for parent in commit.parents],
                author=author_name,
                email=author_email,
                time=commit_time,
                message=commit_message,
                file_changes=file_changes,
            )
            commits.append(sha)
            self.all_commits[sha] = commit

        return commits

    def _get_snapshot(self, tree: pygit2.Tree, path: str) -> Optional[str]:
        """Retrieves the snapshot of a file from a tree"""
        try:
            parts = [p for p in path.split("/") if p]
            current = tree
            for idx, part in enumerate(parts):
                entry = current[part]
                obj = self.repo[entry.id]
                if idx < len(parts) - 1:
                    if isinstance(obj, pygit2.Tree):
                        current = obj
                        continue
                    else:
                        return None
                if hasattr(obj, "data"):
                    text = obj.data.decode("utf-8", "replace")
                    # Strip NUL characters to avoid DB errors when storing as TEXT
                    return text.replace("\x00", "")
                return None
        except Exception:
            return None

    def _get_file_change_status(self, status: int) -> FileChangeStatus:
        """Returns the FileChangeStatus enum for a given status code"""
        if status == 1:
            return FileChangeStatus.ADDED
        elif status == 2:
            return FileChangeStatus.DELETED
        elif status == 3:
            return FileChangeStatus.MODIFIED
        elif status == 4:
            return FileChangeStatus.RENAMED
        elif status == 5:
            return FileChangeStatus.COPIED
        else:
            raise ValueError(f"Invalid status: {status}")

    def output(self):
        output_dir = os.path.join(
            os.path.dirname(__file__), "..", "..", "output", self.name)
        os.makedirs(output_dir, exist_ok=True)
        for commit in self.commits:
            with open(os.path.join(output_dir, f"{commit}.json"), "w") as f:
                f.write(self.all_commits[commit].model_dump_json())
