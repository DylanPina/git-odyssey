from typing import Any, Dict, List, Optional

from sqlalchemy import distinct, func, literal, or_, select, union_all
from sqlalchemy.orm import Session, joinedload

from core.embedder import EmbeddingEngine
from data.adapter import DatabaseAdapter
from data.data_model import Commit, DiffHunk, FileChange
from data.schema import SQLCommit, SQLDiffHunk, SQLFileChange
from utils.logger import logger


class Retriever:
    # Similarity thresholds (lower = more similar, 0 = identical, 2 = opposite)
    SIMILARITY_THRESHOLDS = {
        "commit": 0.5,
        "file_change": 0.6,
        "hunk": 0.6,
    }

    EXCLUDED_FILE_PATTERNS = [
        ".gitignore",
        "package-lock.json",
        "package.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        "Gemfile.lock",
        "Cargo.lock",
        "poetry.lock",
        "composer.lock",
        "go.sum",
        ".env",
        ".env.example",
        "components.json",
        "tsconfig.json",
        "jsconfig.json",
        ".prettierrc",
        ".eslintrc",
        "tailwind.config",
        "vite.config",
        "webpack.config",
        "rollup.config",
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".bmp",
        ".tiff",
        ".ico",
        ".webp",
        ".heic",
        ".heif",
        ".avif",
    ]

    def __init__(
        self,
        session: Session,
        embedder: EmbeddingEngine | None,
        db_adapter: DatabaseAdapter,
    ):
        self.session = session
        self.embedder = embedder
        self.db_adapter = db_adapter
        self.filter_actions = {
            "author": lambda q, v: q.filter(SQLCommit.author.ilike(f"%{v}%")),
            "start_date": lambda q, v: q.filter(SQLCommit.time >= v),
            "end_date": lambda q, v: q.filter(SQLCommit.time <= v),
            "message_contains": lambda q, v: q.filter(
                SQLCommit.message.ilike(f"%{v}%")
            ),
            "path": lambda q, v: q.filter(
                or_(
                    SQLFileChange.old_path.ilike(f"%{v}%"),
                    SQLFileChange.new_path.ilike(f"%{v}%"),
                )
            ),
            "status": lambda q, v: q.filter(SQLFileChange.status == v),
            "lines_changed": lambda q, v: q.filter(
                SQLDiffHunk.old_lines + SQLDiffHunk.new_lines >= v
            ),
            "repo_path": lambda q, v: q.filter(SQLCommit.repo_path == v),
        }

    def _get_query_embedding(self, query: str) -> list[float] | None:
        if not query.strip() or self.embedder is None:
            return None
        return self.embedder.embed_query(query)

    def _build_file_exclusion_filter(self):
        exclusion_matches = []
        for pattern in self.EXCLUDED_FILE_PATTERNS:
            exclusion_matches.append(
                or_(
                    SQLFileChange.new_path.ilike(f"%{pattern}%"),
                    SQLFileChange.old_path.ilike(f"%{pattern}%"),
                )
            )
        return ~or_(*exclusion_matches)

    def _format_status(self, status: Any) -> str:
        return {
            "ADDED": "added",
            "MODIFIED": "modified",
            "DELETED": "deleted",
            "RENAMED": "renamed",
            "COPIED": "copied",
        }.get(str(status), str(status).lower())

    def get_commit(self, sha: str) -> Optional[Commit]:
        query = (
            select(SQLCommit)
            .where(SQLCommit.sha == sha)
            .options(
                joinedload(SQLCommit.file_changes).options(
                    joinedload(SQLFileChange.hunks)
                )
            )
        )
        result = self.session.execute(query).scalars().first()
        if result:
            return self.db_adapter.parse_sql_commit(result)
        return None

    def get_file_change(self, id: int) -> Optional[FileChange]:
        query = (
            select(SQLFileChange)
            .where(SQLFileChange.id == id)
            .options(joinedload(SQLFileChange.hunks))
        )
        result = self.session.execute(query).scalars().first()
        if result:
            return self.db_adapter.parse_sql_file_change(result)
        return None

    def get_hunk(self, id: int) -> Optional[DiffHunk]:
        query = select(SQLDiffHunk).where(SQLDiffHunk.id == id)
        result = self.session.execute(query).scalars().first()
        if result:
            return self.db_adapter.parse_sql_hunk(result)
        return None

    def filter(
        self, query: str, filters: Dict[str, Any], repo_path: str, max_results: int
    ) -> List[str]:
        logger.info("Filtering for query '%s' with filters %s", query, filters)

        query_embedding = self._get_query_embedding(query) if query else None

        base_query = select(distinct(SQLCommit.sha).label("sha")).select_from(SQLCommit)

        if repo_path:
            base_query = base_query.filter(SQLCommit.repo_path == repo_path)

        joins = set()
        if any(f in ["path", "status"] for f in filters):
            joins.add(SQLFileChange)
        if any(f in ["lines_changed"] for f in filters):
            joins.add(SQLDiffHunk)

        if SQLFileChange in joins:
            base_query = base_query.join(
                SQLFileChange, SQLCommit.sha == SQLFileChange.commit_sha
            )
        if SQLDiffHunk in joins:
            base_query = base_query.join(
                SQLDiffHunk, SQLCommit.sha == SQLDiffHunk.commit_sha
            )

        for key, value in filters.items():
            if key in self.filter_actions:
                base_query = self.filter_actions[key](base_query, value)

        if query and not query_embedding:
            pattern = f"%{query}%"
            base_query = base_query.filter(
                or_(
                    SQLCommit.message.ilike(pattern),
                    SQLCommit.summary.ilike(pattern),
                )
            )

        filtered_query = base_query.subquery()

        if query_embedding:
            shas_cte = select(filtered_query.c.sha).cte()
            file_exclusion_filter = self._build_file_exclusion_filter()

            commit_similarity = SQLCommit.semantic_embedding.cosine_distance(
                query_embedding
            )
            commits_semantic = (
                select(
                    SQLCommit.sha.label("sha"),
                    commit_similarity.label("similarity"),
                    literal("commit").label("match_type"),
                    func.cast(literal(None), SQLDiffHunk.id.type).label("hunk_id"),
                    func.cast(literal(None), SQLFileChange.new_path.type).label(
                        "file_path"
                    ),
                )
                .join(shas_cte, SQLCommit.sha == shas_cte.c.sha)
                .filter(SQLCommit.semantic_embedding.isnot(None))
                .filter(commit_similarity <= self.SIMILARITY_THRESHOLDS["commit"])
            )

            fc_similarity = SQLFileChange.semantic_embedding.cosine_distance(
                query_embedding
            )
            fc_file_path = func.coalesce(SQLFileChange.new_path, SQLFileChange.old_path)
            fc_semantic = (
                select(
                    SQLFileChange.commit_sha.label("sha"),
                    fc_similarity.label("similarity"),
                    literal("file_change").label("match_type"),
                    func.cast(literal(None), SQLDiffHunk.id.type).label("hunk_id"),
                    fc_file_path.label("file_path"),
                )
                .join(shas_cte, SQLFileChange.commit_sha == shas_cte.c.sha)
                .filter(SQLFileChange.semantic_embedding.isnot(None))
                .filter(file_exclusion_filter)
                .filter(fc_similarity <= self.SIMILARITY_THRESHOLDS["file_change"])
            )

            hunk_similarity = SQLDiffHunk.semantic_embedding.cosine_distance(
                query_embedding
            )
            hunk_file_path = func.coalesce(
                SQLFileChange.new_path, SQLFileChange.old_path
            )
            hunk_semantic = (
                select(
                    SQLDiffHunk.commit_sha.label("sha"),
                    hunk_similarity.label("similarity"),
                    literal("hunk").label("match_type"),
                    SQLDiffHunk.id.label("hunk_id"),
                    hunk_file_path.label("file_path"),
                )
                .join(shas_cte, SQLDiffHunk.commit_sha == shas_cte.c.sha)
                .join(SQLFileChange, SQLDiffHunk.file_change_id == SQLFileChange.id)
                .filter(SQLDiffHunk.semantic_embedding.isnot(None))
                .filter(file_exclusion_filter)
                .filter(hunk_similarity <= self.SIMILARITY_THRESHOLDS["hunk"])
            )

            self._debug_print_top_matches(shas_cte, query_embedding)

            final_query = union_all(
                commits_semantic, fc_semantic, hunk_semantic
            ).subquery()

            ranked_query = select(
                final_query.c.sha,
                final_query.c.similarity,
                final_query.c.match_type,
                final_query.c.hunk_id,
                final_query.c.file_path,
                func.row_number()
                .over(
                    partition_by=final_query.c.sha,
                    order_by=final_query.c.similarity,
                )
                .label("rank"),
            ).subquery()

            final_stmt = (
                select(
                    ranked_query.c.sha,
                    ranked_query.c.similarity.label("best_similarity"),
                    ranked_query.c.match_type,
                    ranked_query.c.hunk_id,
                    ranked_query.c.file_path,
                )
                .where(ranked_query.c.rank == 1)
                .order_by(ranked_query.c.similarity)
            )
            results = self.session.execute(final_stmt.limit(max_results)).all()
            commit_shas = [row.sha for row in results]
        else:
            final_stmt = select(filtered_query.c.sha)
            results = self.session.execute(final_stmt.limit(max_results)).all()
            commit_shas = [row.sha for row in results]

        logger.info("Found %s relevant commits", len(commit_shas))
        return commit_shas

    def _build_fallback_context(
        self, repo_path: str, context_shas: list[str]
    ) -> tuple[str, list[dict[str, Any]]]:
        query = (
            select(
                SQLCommit.sha,
                SQLCommit.message,
                SQLCommit.author,
                SQLCommit.time,
                SQLCommit.summary,
            )
            .where(SQLCommit.repo_path == repo_path, SQLCommit.sha.in_(context_shas))
            .order_by(SQLCommit.time.desc())
            .limit(5)
        )
        rows = self.session.execute(query).mappings().all()

        context_lines = ["## Relevant Context:\n"]
        cited_commits: list[dict[str, Any]] = []

        for index, row in enumerate(rows, 1):
            context_lines.append(
                f"### {index}. Commit\n"
                f"Commit {row['sha'][:8]} by {row['author']} on {row['time']}: {row['message']}\n"
                f"Summary: {row['summary']}\n\n"
            )
            cited_commits.append(
                {
                    "sha": row["sha"],
                    "similarity": 1.0,
                    "message": row["message"] or "",
                }
            )

        return "".join(context_lines), cited_commits

    def get_context_with_citations(
        self, query: str, repo_path: str, context_shas: List[str]
    ) -> tuple[str, List[dict[str, Any]]]:
        if not repo_path:
            raise ValueError("Repository path is required for chat retrieval.")

        if context_shas:
            allowed_shas = (
                self.session.execute(
                    select(SQLCommit.sha).where(
                        SQLCommit.repo_path == repo_path,
                        SQLCommit.sha.in_(context_shas),
                    )
                )
                .scalars()
                .all()
            )
            context_shas = list(allowed_shas)

        query_embedding = self._get_query_embedding(query)

        if not context_shas:
            if query_embedding is None:
                context_shas = (
                    self.session.execute(
                        select(SQLCommit.sha)
                        .where(SQLCommit.repo_path == repo_path)
                        .order_by(SQLCommit.time.desc())
                        .limit(5)
                    )
                    .scalars()
                    .all()
                )
            else:
                context_shas = (
                    self.session.execute(
                        select(SQLCommit.sha).where(SQLCommit.repo_path == repo_path)
                    )
                    .scalars()
                    .all()
                )

        logger.info(
            "Gathering context for query '%s' in repo %s with context SHAs %s",
            query,
            repo_path,
            context_shas,
        )

        if not context_shas:
            return "## Relevant Context:\n", []

        if query_embedding is None:
            return self._build_fallback_context(repo_path, context_shas)

        context_items: list[dict[str, Any]] = []
        file_exclusion_filter = self._build_file_exclusion_filter()

        commits_query = (
            select(
                SQLCommit.sha,
                SQLCommit.message,
                SQLCommit.author,
                SQLCommit.time,
                SQLCommit.summary,
                SQLCommit.semantic_embedding.cosine_distance(query_embedding).label(
                    "similarity"
                ),
            )
            .where(
                SQLCommit.repo_path == repo_path,
                SQLCommit.sha.in_(context_shas),
                SQLCommit.semantic_embedding.isnot(None),
            )
        )
        commits_results = self.session.execute(commits_query).mappings().all()
        for row in commits_results:
            context_items.append(
                {
                    "type": "commit",
                    "sha": row["sha"],
                    "message": row["message"] or "",
                    "similarity": float(row["similarity"]),
                    "content": (
                        f"Commit {row['sha'][:8]} by {row['author']} on {row['time']}: "
                        f"{row['message']}\nSummary: {row['summary']}\n\n"
                    ),
                }
            )

        fc_query = (
            select(
                SQLFileChange.commit_sha,
                SQLFileChange.old_path,
                SQLFileChange.new_path,
                SQLFileChange.status,
                SQLFileChange.summary,
                SQLCommit.message.label("commit_message"),
                SQLCommit.author.label("commit_author"),
                SQLCommit.time.label("commit_time"),
                SQLFileChange.semantic_embedding.cosine_distance(query_embedding).label(
                    "similarity"
                ),
            )
            .join(SQLCommit, SQLFileChange.commit_sha == SQLCommit.sha)
            .where(
                SQLCommit.repo_path == repo_path,
                SQLFileChange.commit_sha.in_(context_shas),
                SQLFileChange.semantic_embedding.isnot(None),
            )
            .filter(file_exclusion_filter)
        )
        fc_results = self.session.execute(fc_query).mappings().all()
        for row in fc_results:
            path_info = row["new_path"] or row["old_path"]
            status = self._format_status(row["status"])
            context_items.append(
                {
                    "type": "file_change",
                    "sha": row["commit_sha"],
                    "message": row["commit_message"] or "",
                    "similarity": float(row["similarity"]),
                    "content": (
                        f"{status} {path_info} in commit {row['commit_sha'][:8]} by "
                        f"{row['commit_author']} on {row['commit_time']}\n"
                        f"Summary: {row['summary']}\n\n"
                    ),
                }
            )

        hunk_query = (
            select(
                SQLDiffHunk.commit_sha,
                SQLDiffHunk.old_lines,
                SQLDiffHunk.new_lines,
                SQLDiffHunk.content,
                SQLDiffHunk.summary,
                SQLFileChange.old_path,
                SQLFileChange.new_path,
                SQLCommit.message.label("commit_message"),
                SQLCommit.author.label("commit_author"),
                SQLCommit.time.label("commit_time"),
                SQLDiffHunk.semantic_embedding.cosine_distance(query_embedding).label(
                    "similarity"
                ),
            )
            .join(SQLCommit, SQLDiffHunk.commit_sha == SQLCommit.sha)
            .join(SQLFileChange, SQLDiffHunk.file_change_id == SQLFileChange.id)
            .where(
                SQLCommit.repo_path == repo_path,
                SQLDiffHunk.commit_sha.in_(context_shas),
                SQLDiffHunk.semantic_embedding.isnot(None),
            )
            .filter(file_exclusion_filter)
        )
        hunk_results = self.session.execute(hunk_query).mappings().all()
        for row in hunk_results:
            file_path = row["new_path"] or row["old_path"]
            lines_info = f"{row['old_lines']}/{row['new_lines']} lines"
            preview = (row["content"] or "")[:200]
            context_items.append(
                {
                    "type": "diff_hunk",
                    "sha": row["commit_sha"],
                    "message": row["commit_message"] or "",
                    "similarity": float(row["similarity"]),
                    "content": (
                        f"{lines_info} in {file_path} (commit {row['commit_sha'][:8]} by "
                        f"{row['commit_author']} on {row['commit_time']}):\n"
                        f"```\n{preview}...\n```\n"
                        f"Summary: {row['summary']}\n\n"
                    ),
                }
            )

        if not context_items:
            return self._build_fallback_context(repo_path, context_shas)

        context_items.sort(key=lambda item: item["similarity"])
        top_context = context_items[:5]

        context_lines = ["## Relevant Context:\n"]
        for index, item in enumerate(top_context, 1):
            context_lines.append(
                f"### {index}. {item['type'].title()} (similarity: {1 - item['similarity']:.3f})\n"
                f"{item['content']}\n"
            )

        cited_by_sha: dict[str, dict[str, Any]] = {}
        threshold = 0.3
        for item in top_context:
            similarity_score = 1 - item["similarity"]
            if similarity_score <= threshold:
                continue
            existing = cited_by_sha.get(item["sha"])
            if existing is None or similarity_score > existing["similarity"]:
                cited_by_sha[item["sha"]] = {
                    "sha": item["sha"],
                    "similarity": similarity_score,
                    "message": item["message"],
                }

        cited_commits = sorted(
            cited_by_sha.values(),
            key=lambda item: item["similarity"],
            reverse=True,
        )[:5]

        logger.info(
            "Selected %s cited commits for repo-scoped chat context",
            len(cited_commits),
        )

        return "".join(context_lines), cited_commits

    def _debug_print_top_matches(
        self, shas_cte, query_embedding, top_k: int = 15
    ) -> None:
        try:
            commit_sim = SQLCommit.semantic_embedding.cosine_distance(query_embedding)
            top_commits_stmt = (
                select(SQLCommit.sha, SQLCommit.message, commit_sim.label("similarity"))
                .join(shas_cte, SQLCommit.sha == shas_cte.c.sha)
                .filter(SQLCommit.semantic_embedding.isnot(None))
                .order_by(commit_sim)
                .limit(top_k)
            )
            top_commits = self.session.execute(top_commits_stmt).all()
            if top_commits:
                print("Top commit matches:")
                for i, row in enumerate(top_commits, 1):
                    print(
                        f"  {i}. type=commit sha={row.sha} sim={row.similarity:.5f} msg={row.message[:80] if row.message else ''}"
                    )

            fc_sim = SQLFileChange.semantic_embedding.cosine_distance(query_embedding)
            top_fc_stmt = (
                select(
                    SQLFileChange.commit_sha,
                    SQLFileChange.old_path,
                    SQLFileChange.new_path,
                    SQLFileChange.status,
                    fc_sim.label("similarity"),
                )
                .join(shas_cte, SQLFileChange.commit_sha == shas_cte.c.sha)
                .filter(SQLFileChange.semantic_embedding.isnot(None))
                .order_by(fc_sim)
                .limit(top_k)
            )
            top_fcs = self.session.execute(top_fc_stmt).all()
            if top_fcs:
                print("Top file-change matches:")
                for i, row in enumerate(top_fcs, 1):
                    print(
                        "  {i}. type=file_change sha={sha} sim={sim:.5f} path={old}->{new} status={status}".format(
                            i=i,
                            sha=row.commit_sha,
                            sim=row.similarity,
                            old=row.old_path,
                            new=row.new_path,
                            status=row.status,
                        )
                    )

            hunk_sim = SQLDiffHunk.semantic_embedding.cosine_distance(query_embedding)
            top_hunk_stmt = (
                select(
                    SQLDiffHunk.commit_sha,
                    SQLDiffHunk.id.label("hunk_id"),
                    SQLFileChange.new_path,
                    SQLFileChange.old_path,
                    hunk_sim.label("similarity"),
                )
                .join(shas_cte, SQLDiffHunk.commit_sha == shas_cte.c.sha)
                .join(SQLFileChange, SQLDiffHunk.file_change_id == SQLFileChange.id)
                .filter(SQLDiffHunk.semantic_embedding.isnot(None))
                .order_by(hunk_sim)
                .limit(top_k)
            )
            top_hunks = self.session.execute(top_hunk_stmt).all()
            if top_hunks:
                print("Top hunk matches:")
                for i, row in enumerate(top_hunks, 1):
                    file_path = row.new_path or row.old_path
                    print(
                        f"  {i}. type=hunk sha={row.commit_sha} hunk_id={row.hunk_id} sim={row.similarity:.5f} path={file_path}"
                    )
        except Exception as error:  # pragma: no cover - debug helper
            print(f"Similarity debug listing failed: {error}")
