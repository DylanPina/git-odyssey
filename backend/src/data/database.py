from data.schema import SQLDiffHunk, SQLFileChange, SQLCommit, SQLBranch, SQLUser
from data.data_model import DiffHunk, FileChange, Commit, Branch, FileSnapshot, User


class Database:
    def __init__(self):
        pass

    def parse_sql_hunk(
        self, sql_hunk: SQLDiffHunk, compressed: bool = False
    ) -> DiffHunk:
        return DiffHunk(
            id=sql_hunk.id,
            old_start=sql_hunk.old_start,
            old_lines=sql_hunk.old_lines,
            new_start=sql_hunk.new_start,
            new_lines=sql_hunk.new_lines,
            content=sql_hunk.content,
            summary=sql_hunk.summary,
            commit_sha=(
                sql_hunk.file_change.commit_sha if sql_hunk.file_change else None
            ),
            embedding=sql_hunk.embedding if not compressed else None,
            diff_embedding=sql_hunk.diff_embedding if not compressed else None,
        )

    def parse_sql_user(self, sql_user: SQLUser) -> User:
        return User(
            id=sql_user.id,
            github_id=sql_user.github_id,
            username=sql_user.username,
            email=sql_user.email,
            installation_id=sql_user.installation_id,
            api_credits_remaining=sql_user.api_credits_remaining,
            created_at=sql_user.created_at,
            updated_at=sql_user.updated_at,
        )

    def parse_sql_file_change(
        self, sql_file_change: SQLFileChange, compressed: bool = False
    ) -> FileChange:
        hunks = [
            self.parse_sql_hunk(hunk, compressed) for hunk in sql_file_change.hunks
        ]

        snapshot = None
        if sql_file_change.snapshot is not None:
            previous_snapshot_model = None
            if (
                not compressed
                and sql_file_change.snapshot.previous_snapshot is not None
            ):
                prev = sql_file_change.snapshot.previous_snapshot
                previous_snapshot_model = FileSnapshot(
                    id=prev.id,
                    path=prev.path,
                    content=prev.content,
                    previous_snapshot_id=prev.previous_snapshot_id,
                    commit_sha=sql_file_change.commit_sha,
                )

            snapshot = FileSnapshot(
                id=sql_file_change.snapshot.id,
                path=sql_file_change.snapshot.path,
                content=sql_file_change.snapshot.content if not compressed else "",
                previous_snapshot_id=sql_file_change.snapshot.previous_snapshot_id,
                commit_sha=sql_file_change.commit_sha,
                previous_snapshot=previous_snapshot_model,
            )

        return FileChange(
            id=sql_file_change.id,
            old_path=sql_file_change.old_path,
            new_path=sql_file_change.new_path,
            status=sql_file_change.status,
            hunks=hunks,
            snapshot=snapshot,
            summary=sql_file_change.summary,
            commit_sha=sql_file_change.commit_sha,
            embedding=sql_file_change.embedding if not compressed else None,
        )

    def parse_sql_commit(
        self, sql_commit: SQLCommit, compressed: bool = False
    ) -> Commit:
        file_changes = [
            self.parse_sql_file_change(fc, compressed) for fc in sql_commit.file_changes
        ]

        return Commit(
            sha=sql_commit.sha,
            repo_url=sql_commit.repo_url,
            parents=sql_commit.parents,
            author=sql_commit.author,
            email=sql_commit.email,
            time=sql_commit.time,
            message=sql_commit.message,
            file_changes=file_changes,
            summary=sql_commit.summary,
            embedding=sql_commit.embedding if not compressed else None,
        )

    def parse_sql_branch(self, sql_branch: SQLBranch) -> Branch:
        return Branch(
            name=sql_branch.name,
            repo_url=sql_branch.repo_url,
            commits=[commit.sha for commit in sql_branch.commits],
        )
