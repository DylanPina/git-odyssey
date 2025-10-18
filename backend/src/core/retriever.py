from data.database import Database
from data.schema import SQLCommit, SQLFileChange, SQLDiffHunk
from core.embedder import Embedder
from typing import Dict, Any, List, Optional
from utils.logger import logger
from sqlalchemy import or_, func, union_all, select, distinct, case, literal
from sqlalchemy.orm import joinedload
from data.data_model import Commit, FileChange, DiffHunk


class Retriever:
    # Similarity thresholds (lower = more similar, 0 = identical, 2 = opposite)
    SIMILARITY_THRESHOLDS = {
        "commit": 0.55,  # Very loose - commit messages are often poor quality
        "file_change": 0.7,  # Moderate - file change summaries are better
        "hunk": 0.7,  # Moderate - hunk content/diffs are specific but noisy
    }

    # File patterns to exclude from semantic search (config/generated files)
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
        "components.json",  # shadcn/ui config
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

    def __init__(self, db: Database, embedder: Embedder):
        self.db = db
        self.embedder = embedder
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
            "repo_url": lambda q, v: q.filter(SQLCommit.repo_url == v),
        }

    def _should_exclude_file(self, file_path: str) -> bool:
        """Check if a file should be excluded from semantic search based on patterns."""
        if not file_path:
            return False
        file_path_lower = file_path.lower()
        return any(
            pattern.lower() in file_path_lower
            for pattern in self.EXCLUDED_FILE_PATTERNS
        )

    def get_commit(self, sha: str) -> Optional[Commit]:
        with self.db.get_session() as session:
            query = (
                select(SQLCommit)
                .where(SQLCommit.sha == sha)
                .options(
                    joinedload(SQLCommit.file_changes).options(
                        joinedload(SQLFileChange.hunks)
                    )
                )
            )
            result = session.execute(query).scalars().first()
            if result:
                return self.db.parse_sql_commit(result)
            return None

    def get_file_change(self, id: int) -> Optional[FileChange]:
        with self.db.get_session() as session:
            query = (
                select(SQLFileChange)
                .where(SQLFileChange.id == id)
                .options(joinedload(SQLFileChange.hunks))
            )
            result = session.execute(query).scalars().first()
            if result:
                return self.db.parse_sql_file_change(result)
            return None

    def get_hunk(self, id: int) -> Optional[DiffHunk]:
        with self.db.get_session() as session:
            query = select(SQLDiffHunk).where(SQLDiffHunk.id == id)
            result = session.execute(query).scalars().first()
            if result:
                return self.db.parse_sql_hunk(result)
            return None

    def filter(
        self, query: str, filters: Dict[str, Any], repo_url: str, max_results: int
    ) -> List[str]:
        """Hybrid search: apply SQL filters first, then semantic search across all tables."""
        logger.info(f"Filtering for query: '{query}' with filters: {filters}")

        with self.db.get_session() as session:
            query_embedding = self.embedder.embed_query(
                query) if query else None

            base_query = select(distinct(SQLCommit.sha).label("sha")).select_from(
                SQLCommit
            )

            if repo_url:
                base_query = base_query.filter(SQLCommit.repo_url == repo_url)

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
            filtered_query = base_query.subquery()
            if query_embedding:
                shas_cte = select(filtered_query.c.sha).cte()

                # Semantic search on commits with similarity threshold
                commit_similarity = SQLCommit.embedding.cosine_distance(
                    query_embedding)
                commits_semantic = (
                    select(
                        SQLCommit.sha.label("sha"),
                        commit_similarity.label("similarity"),
                        literal("commit").label("match_type"),
                        func.cast(literal(None), SQLDiffHunk.id.type).label(
                            "hunk_id"
                        ),  # Cast NULL to integer type
                        func.cast(literal(None), SQLFileChange.new_path.type).label(
                            "file_path"
                        ),  # Cast NULL to text type
                    )
                    .join(shas_cte, SQLCommit.sha == shas_cte.c.sha)
                    .filter(commit_similarity <= self.SIMILARITY_THRESHOLDS["commit"])
                )

                # Build file exclusion filter (check both old_path and new_path)
                # Exclude a file if EITHER path matches any excluded pattern
                exclusion_matches = []
                for pattern in self.EXCLUDED_FILE_PATTERNS:
                    # Match if new_path OR old_path contains the pattern
                    exclusion_matches.append(
                        or_(
                            SQLFileChange.new_path.ilike(f"%{pattern}%"),
                            SQLFileChange.old_path.ilike(f"%{pattern}%"),
                        )
                    )

                # Combine all pattern matches with OR (exclude if ANY pattern matches)
                # Then negate the whole thing to exclude those files
                file_exclusion_filter = ~or_(*exclusion_matches)

                # Semantic search on file changes with exclusions and threshold
                fc_similarity = SQLFileChange.embedding.cosine_distance(
                    query_embedding)
                fc_file_path = func.coalesce(
                    SQLFileChange.new_path, SQLFileChange.old_path
                )
                fc_semantic = (
                    select(
                        SQLFileChange.commit_sha.label("sha"),
                        fc_similarity.label("similarity"),
                        literal("file_change").label("match_type"),
                        func.cast(literal(None), SQLDiffHunk.id.type).label(
                            "hunk_id"
                        ),  # Cast NULL to integer type
                        fc_file_path.label("file_path"),
                    )
                    .join(shas_cte, SQLFileChange.commit_sha == shas_cte.c.sha)
                    .filter(SQLFileChange.embedding.isnot(None))
                    .filter(file_exclusion_filter)
                    .filter(fc_similarity <= self.SIMILARITY_THRESHOLDS["file_change"])
                )

                # Use CASE to pick the best available embedding
                hunk_similarity = case(
                    # If both exist, use the minimum
                    (
                        (SQLDiffHunk.embedding.isnot(None))
                        & (SQLDiffHunk.diff_embedding.isnot(None)),
                        func.least(
                            SQLDiffHunk.embedding.cosine_distance(
                                query_embedding),
                            SQLDiffHunk.diff_embedding.cosine_distance(
                                query_embedding),
                        ),
                    ),
                    # If only embedding exists, use it
                    (
                        SQLDiffHunk.embedding.isnot(None),
                        SQLDiffHunk.embedding.cosine_distance(query_embedding),
                    ),
                    # Otherwise use diff_embedding
                    else_=SQLDiffHunk.diff_embedding.cosine_distance(
                        query_embedding),
                )

                # Semantic search on hunks with file exclusions and threshold
                # Need to join with file_change to get the file path for filtering
                # Check both old_path and new_path (same logic as file changes)
                hunk_exclusion_matches = []
                for pattern in self.EXCLUDED_FILE_PATTERNS:
                    hunk_exclusion_matches.append(
                        or_(
                            SQLFileChange.new_path.ilike(f"%{pattern}%"),
                            SQLFileChange.old_path.ilike(f"%{pattern}%"),
                        )
                    )

                hunk_file_exclusion_filter = ~or_(*hunk_exclusion_matches)

                hunk_file_path = func.coalesce(
                    SQLFileChange.new_path, SQLFileChange.old_path
                )
                hunk_semantic = (
                    select(
                        SQLDiffHunk.commit_sha.label("sha"),
                        hunk_similarity.label("similarity"),
                        literal("hunk").label("match_type"),
                        SQLDiffHunk.id.label(
                            "hunk_id"
                        ),  # Keep as integer - NULLs are cast to match
                        hunk_file_path.label("file_path"),
                    )
                    .join(shas_cte, SQLDiffHunk.commit_sha == shas_cte.c.sha)
                    .join(SQLFileChange, SQLDiffHunk.file_change_id == SQLFileChange.id)
                    .filter(hunk_file_exclusion_filter)
                    .filter(hunk_similarity <= self.SIMILARITY_THRESHOLDS["hunk"])
                )

                # Debug: print top-k by similarity with types and metadata
                self._debug_print_top_matches(shas_cte, query_embedding)

                final_query = union_all(
                    commits_semantic, fc_semantic, hunk_semantic
                ).subquery()

                # Get the best match for each SHA along with match type and metadata
                # First, use a window function to rank matches by similarity within each SHA
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

                # Then, filter to only the best match (rank=1) for each SHA
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
            else:
                final_stmt = select(filtered_query.c.sha)

            results = session.execute(final_stmt.limit(max_results)).all()

            # Log results with match type information
            if query_embedding:
                logger.info(f"Found {len(results)} relevant commits:")
                for i, row in enumerate(results, 1):
                    # Build detailed log message with metadata
                    log_msg = f"  {i}. {row.sha[:8]}... sim={row.best_similarity:.4f} via {row.match_type}"

                    # Add file path if available
                    if row.file_path:
                        log_msg += f" path={row.file_path}"

                    # Add hunk ID if this is a hunk match
                    if row.match_type == "hunk" and row.hunk_id:
                        log_msg += f" hunk_id={row.hunk_id}"

                    logger.info(log_msg)
                commit_shas = [row.sha for row in results]
            else:
                commit_shas = [row.sha for row in results]
                logger.info(
                    f"Found {len(commit_shas)} commits (no semantic search)")

            return commit_shas

    def get_context_with_citations(
        self, query: str, context_shas: List[str]
    ) -> tuple[str, List[str]]:
        """Find the most relevant context from given SHAs for AI prompt generation and return cited commits."""
        if not context_shas or not query.strip():
            logger.info("No commit SHAs provided, fetching all commits")
            with self.db.get_session() as session:
                query = select(SQLCommit.sha)
                results = session.execute(query).all()
                context_shas = [row.sha for row in results]

        logger.info(
            f"Gathering context for query: '{query}' with context shas: {context_shas}"
        )

        query_embedding = self.embedder.embed_query(query)
        context_items = []
        cited_commits = []

        with self.db.get_session() as session:
            # Search for commits from the context SHAs
            commits_query = select(
                SQLCommit.sha,
                SQLCommit.message,
                SQLCommit.author,
                SQLCommit.time,
                SQLCommit.summary,
                SQLCommit.embedding.cosine_distance(query_embedding).label(
                    "similarity"
                ),
            ).where(SQLCommit.sha.in_(context_shas), SQLCommit.embedding.isnot(None))

            commits_results = session.execute(commits_query).mappings().all()

            for row in commits_results:
                context_items.append(
                    {
                        "type": "commit",
                        "similarity": float(row["similarity"]),
                        "content": f"Commit {row['sha'][:8]} by {row['author']} on {row['time']}: {row['message']} \n Summary: {row['summary']} \n\n",
                    }
                )
                cited_commits.append(row["sha"])

            # Search for file changes from the context commits
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
                    SQLFileChange.embedding.cosine_distance(query_embedding).label(
                        "similarity"
                    ),
                )
                .join(SQLCommit, SQLFileChange.commit_sha == SQLCommit.sha)
                .where(
                    SQLFileChange.commit_sha.in_(context_shas),
                    SQLFileChange.embedding.isnot(None),
                )
            )

            fc_results = session.execute(fc_query).mappings().all()

            for row in fc_results:
                path_info = row["new_path"] if row["new_path"] else row["old_path"]
                status = {
                    "ADDED": "added",
                    "MODIFIED": "modified",
                    "DELETED": "deleted",
                    "RENAMED": "renamed",
                    "COPIED": "copied",
                }.get(row["status"], "unknown")

                context_items.append(
                    {
                        "type": "file_change",
                        "similarity": float(row["similarity"]),
                        "content": f"{status} {path_info} in commit {row['commit_sha'][:8]} by {row['commit_author']} on {row['commit_time']} \n Summary: {row['summary']} \n\n",
                    }
                )
                # Add commit SHA if not already in cited_commits
                if row["commit_sha"] not in cited_commits:
                    cited_commits.append(row["commit_sha"])

            # Search for diff hunks from the context commits
            hunk_context_similarity = case(
                (
                    (SQLDiffHunk.embedding.isnot(None))
                    & (SQLDiffHunk.diff_embedding.isnot(None)),
                    func.least(
                        SQLDiffHunk.embedding.cosine_distance(query_embedding),
                        SQLDiffHunk.diff_embedding.cosine_distance(
                            query_embedding),
                    ),
                ),
                (
                    SQLDiffHunk.embedding.isnot(None),
                    SQLDiffHunk.embedding.cosine_distance(query_embedding),
                ),
                else_=SQLDiffHunk.diff_embedding.cosine_distance(
                    query_embedding),
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
                    SQLFileChange.status,
                    SQLFileChange.summary,
                    SQLCommit.message.label("commit_message"),
                    SQLCommit.author.label("commit_author"),
                    SQLCommit.time.label("commit_time"),
                    hunk_context_similarity.label("similarity"),
                )
                .join(SQLCommit, SQLDiffHunk.commit_sha == SQLCommit.sha)
                .join(SQLFileChange, SQLDiffHunk.file_change_id == SQLFileChange.id)
                .where(
                    SQLDiffHunk.commit_sha.in_(context_shas),
                    or_(
                        SQLDiffHunk.embedding.isnot(None),
                        SQLDiffHunk.diff_embedding.isnot(None),
                    ),
                )
            )

            hunk_results = session.execute(hunk_query).mappings().all()

            for row in hunk_results:
                file_path = row["new_path"] if row["new_path"] else row["old_path"]
                lines_info = f"{row['old_lines']}/{row['new_lines']} lines"

                context_items.append(
                    {
                        "type": "diff_hunk",
                        "similarity": float(row["similarity"]),
                        "content": f"{lines_info} in {file_path} (commit {row['commit_sha'][:8]} by {row['commit_author']} on {row['commit_time']}):\n```\n{row['content'][:200]}...\n``` \n Summary: {row['summary']} \n\n",
                    }
                )
                # Add commit SHA if not already in cited_commits
                if row["commit_sha"] not in cited_commits:
                    cited_commits.append(row["commit_sha"])

            # Sort by similarity (lower distance = more similar = higher score)
            context_items.sort(key=lambda x: x["similarity"])

            # Take top 5 most relevant items
            top_context = context_items[:5]

            # Build context using list comprehension + join (O(n) instead of O(n²))
            context_lines = [
                "## Relevant Context:\n",
                *[
                    f"### {i}. {item['type'].title()} (similarity: {1 - item['similarity']:.3f})\n"
                    f"{item['content']}\n"
                    for i, item in enumerate(top_context, 1)
                ],
            ]

            # Collect all cited commits with their similarity scores and messages
            cited_commits_with_scores = []

            # Add commits with their similarity scores
            for item in top_context:
                if item["type"] == "commit":
                    # Extract commit SHA from content (format: "Commit {sha[:8]} by...")
                    content_lines = item["content"].split("\n")
                    first_line = content_lines[0]
                    if "Commit " in first_line:
                        sha_part = first_line.split(
                            "Commit ")[1].split(" by")[0]
                        # Find full SHA from context_shas
                        for full_sha in context_shas:
                            if full_sha.startswith(sha_part):
                                # Extract commit message from content
                                # Format: "Commit {sha} by {author} on {time}: {message}"
                                commit_message = ""
                                if " by " in first_line and ": " in first_line:
                                    commit_message = (
                                        first_line.split(": ", 1)[1]
                                        if ": " in first_line
                                        else ""
                                    )

                                cited_commits_with_scores.append(
                                    {
                                        "sha": full_sha,
                                        "similarity": 1 - item["similarity"],
                                        "message": commit_message,
                                    }
                                )
                                break
                elif item["type"] in ["file_change", "diff_hunk"]:
                    # Extract commit SHA from content (format: "...in commit {sha[:8]} by...")
                    content_lines = item["content"].split("\n")
                    for line in content_lines:
                        if "in commit " in line:
                            sha_part = line.split("in commit ")[
                                1].split(" by")[0]
                            # Find full SHA from context_shas
                            for full_sha in context_shas:
                                if full_sha.startswith(sha_part):
                                    # Extract commit message from line
                                    commit_message = ""
                                    if " by " in line and ": " in line:
                                        commit_message = (
                                            line.split(": ", 1)[1]
                                            if ": " in line
                                            else ""
                                        )

                                    cited_commits_with_scores.append(
                                        {
                                            "sha": full_sha,
                                            "similarity": 1 - item["similarity"],
                                            "message": commit_message,
                                        }
                                    )
                                    break
                            break

            # Remove duplicates while preserving order and similarity scores
            seen_shas = set()
            unique_cited_commits = []
            for commit in cited_commits_with_scores:
                if commit["sha"] not in seen_shas:
                    seen_shas.add(commit["sha"])
                    unique_cited_commits.append(commit)

            # Sort by similarity (highest first) and take top 5
            unique_cited_commits.sort(
                key=lambda x: x["similarity"], reverse=True)

            # Apply similarity threshold (only include commits with similarity > 0.3)
            # This ensures we only show highly relevant citations
            threshold = 0.3
            filtered_commits = [
                commit
                for commit in unique_cited_commits
                if commit["similarity"] > threshold
            ]

            logger.info(
                f"Filtered {len(unique_cited_commits)} commits to {len(filtered_commits)} based on similarity threshold {threshold}"
            )

            # Take top 5 most similar commits
            top_cited_commits = filtered_commits[:5]

            context = "".join(context_lines)
            return context, top_cited_commits

    def _debug_print_top_matches(
        self, shas_cte, query_embedding, top_k: int = 15
    ) -> None:
        """Print top-k semantic matches for commits, file changes, and hunks.

        Uses a separate session to avoid affecting the main transaction.
        """
        try:
            with self.db.get_session() as session:
                # Top commits
                commit_sim = SQLCommit.embedding.cosine_distance(query_embedding).label(
                    "similarity"
                )
                top_commits_stmt = (
                    select(SQLCommit.sha, SQLCommit.message, commit_sim)
                    .join(shas_cte, SQLCommit.sha == shas_cte.c.sha)
                    .order_by(commit_sim)
                    .limit(top_k)
                )
                top_commits = session.execute(top_commits_stmt).all()
                if top_commits:
                    print("Top commit matches:")
                    for i, row in enumerate(top_commits, 1):
                        print(
                            f"  {i}. type=commit sha={row.sha} sim={row.similarity:.5f} msg={row.message[:80] if row.message else ''}"
                        )

                # Top file changes
                fc_sim = SQLFileChange.embedding.cosine_distance(
                    query_embedding)
                top_fc_stmt = (
                    select(
                        SQLFileChange.commit_sha,
                        SQLFileChange.old_path,
                        SQLFileChange.new_path,
                        SQLFileChange.status,
                        fc_sim.label("similarity"),
                    )
                    .join(shas_cte, SQLFileChange.commit_sha == shas_cte.c.sha)
                    .filter(SQLFileChange.embedding.isnot(None))
                    .order_by(fc_sim)
                    .limit(top_k)
                )
                top_fcs = session.execute(top_fc_stmt).all()
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

                # Top hunks
                hunk_similarity = case(
                    (
                        (SQLDiffHunk.embedding.isnot(None))
                        & (SQLDiffHunk.diff_embedding.isnot(None)),
                        func.least(
                            SQLDiffHunk.embedding.cosine_distance(
                                query_embedding),
                            SQLDiffHunk.diff_embedding.cosine_distance(
                                query_embedding),
                        ),
                    ),
                    (
                        SQLDiffHunk.embedding.isnot(None),
                        SQLDiffHunk.embedding.cosine_distance(query_embedding),
                    ),
                    else_=SQLDiffHunk.diff_embedding.cosine_distance(
                        query_embedding),
                )

                top_hunk_stmt = (
                    select(
                        SQLDiffHunk.commit_sha,
                        SQLDiffHunk.id.label("hunk_id"),
                        SQLFileChange.new_path,
                        SQLFileChange.old_path,
                        hunk_similarity.label("similarity"),
                    )
                    .join(shas_cte, SQLDiffHunk.commit_sha == shas_cte.c.sha)
                    .join(SQLFileChange, SQLDiffHunk.file_change_id == SQLFileChange.id)
                    .order_by(hunk_similarity)
                    .limit(top_k)
                )
                top_hunks = session.execute(top_hunk_stmt).all()
                if top_hunks:
                    print("Top hunk matches:")
                    for i, row in enumerate(top_hunks, 1):
                        file_path = row.new_path or row.old_path
                        print(
                            f"  {i}. type=hunk sha={row.commit_sha} hunk_id={row.hunk_id} sim={row.similarity:.5f} path={file_path}"
                        )
        except Exception as e:
            print(f"Similarity debug listing failed: {e}")
