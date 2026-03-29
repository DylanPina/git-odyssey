from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional

from sqlalchemy import distinct, func, literal, or_, select
from sqlalchemy.orm import Session, joinedload

from core.embedder import EmbeddingEngine
from data.adapter import DatabaseAdapter
from data.data_model import Commit, DiffHunk, FileChange
from data.schema import SQLCommit, SQLDiffHunk, SQLFileChange
from utils.logger import logger


MatchType = Literal["commit", "file_change", "hunk"]
HighlightStrategy = Literal["exact_query", "target_hunk", "file_header", "none"]
PreviewKind = Literal["text", "diff"]

MATCH_TYPE_PRIORITY: dict[MatchType, int] = {
    "hunk": 0,
    "file_change": 1,
    "commit": 2,
}
PREVIEW_CONTEXT_CHARS = 84
PREVIEW_MAX_CHARS = 220
DIFF_PREVIEW_MAX_LINES = 8
DIFF_PREVIEW_CONTEXT_LINES = 3


@dataclass(frozen=True)
class FilterCandidate:
    sha: str
    match_type: MatchType
    similarity: float | None
    commit_time: int | None
    preview_source: str | None = None
    preview_kind: PreviewKind = "text"
    file_change_id: int | None = None
    hunk_id: int | None = None
    file_path: str | None = None
    old_start: int | None = None
    new_start: int | None = None
    preview_old_start: int | None = None
    preview_old_lines: int | None = None
    preview_new_start: int | None = None
    preview_new_lines: int | None = None
    exact_match: bool = False


def _escape_like_query(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )


def _normalize_preview_text(value: str | None) -> str:
    if not value:
        return ""

    return " ".join(value.replace("\r", " ").replace("\n", " ").split())


def _build_preview_excerpt(
    value: str | None,
    query: str | None = None,
    *,
    context_chars: int = PREVIEW_CONTEXT_CHARS,
    max_chars: int = PREVIEW_MAX_CHARS,
) -> str | None:
    normalized_value = _normalize_preview_text(value)
    if not normalized_value:
        return None

    normalized_query = (query or "").strip().lower()
    if normalized_query:
        match_index = normalized_value.lower().find(normalized_query)
        if match_index >= 0:
            start = max(0, match_index - context_chars)
            end = min(
                len(normalized_value),
                match_index + len(normalized_query) + context_chars,
            )
            excerpt = normalized_value[start:end]
            if start > 0:
                excerpt = "..." + excerpt.lstrip()
            if end < len(normalized_value):
                excerpt = excerpt.rstrip() + "..."
            return excerpt

    if len(normalized_value) <= max_chars:
        return normalized_value

    return normalized_value[: max_chars - 3].rstrip() + "..."


def _format_diff_header(
    old_start: int | None,
    old_lines: int | None,
    new_start: int | None,
    new_lines: int | None,
) -> str:
    old_label = (
        f"{old_start},{old_lines}"
        if old_start is not None and old_lines is not None
        else "0,0"
    )
    new_label = (
        f"{new_start},{new_lines}"
        if new_start is not None and new_lines is not None
        else "0,0"
    )
    return f"@@ -{old_label} +{new_label} @@"


def _build_diff_preview_excerpt(
    value: str | None,
    query: str | None = None,
    *,
    old_start: int | None = None,
    old_lines: int | None = None,
    new_start: int | None = None,
    new_lines: int | None = None,
    context_lines: int = DIFF_PREVIEW_CONTEXT_LINES,
    max_lines: int = DIFF_PREVIEW_MAX_LINES,
) -> str | None:
    if not value:
        return None

    lines = value.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    while lines and lines[-1] == "":
        lines.pop()
    if not lines:
        return None

    normalized_query = (query or "").strip().lower()
    if normalized_query:
        match_index = next(
            (index for index, line in enumerate(lines) if normalized_query in line.lower()),
            0,
        )
        start_index = max(0, match_index - context_lines)
    else:
        start_index = 0

    end_index = min(len(lines), start_index + max_lines)
    if end_index - start_index < max_lines and start_index > 0:
        start_index = max(0, end_index - max_lines)

    visible_lines = lines[start_index:end_index]
    preview_lines = [_format_diff_header(old_start, old_lines, new_start, new_lines)]

    if start_index > 0:
        preview_lines.append("...")

    preview_lines.extend(visible_lines)

    if end_index < len(lines):
        preview_lines.append("...")

    return "\n".join(preview_lines)


def _candidate_display_sort_key(candidate: FilterCandidate) -> tuple[Any, ...]:
    return (
        MATCH_TYPE_PRIORITY.get(candidate.match_type, 99),
        candidate.similarity if candidate.similarity is not None else float("inf"),
        candidate.file_path or "",
        candidate.new_start if candidate.new_start is not None else float("inf"),
        candidate.old_start if candidate.old_start is not None else float("inf"),
        candidate.hunk_id if candidate.hunk_id is not None else float("inf"),
        candidate.file_change_id
        if candidate.file_change_id is not None
        else float("inf"),
        candidate.sha,
    )


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

    def _get_representative_hunks(
        self, file_change_ids: list[int]
    ) -> dict[int, dict[str, Any]]:
        if not file_change_ids:
            return {}

        rows = self.session.execute(
            select(
                SQLDiffHunk.id.label("id"),
                SQLDiffHunk.file_change_id.label("file_change_id"),
                SQLDiffHunk.content.label("content"),
                SQLDiffHunk.old_start.label("old_start"),
                SQLDiffHunk.old_lines.label("old_lines"),
                SQLDiffHunk.new_start.label("new_start"),
                SQLDiffHunk.new_lines.label("new_lines"),
            )
            .where(SQLDiffHunk.file_change_id.in_(file_change_ids))
            .order_by(
                SQLDiffHunk.file_change_id,
                SQLDiffHunk.new_start,
                SQLDiffHunk.old_start,
                SQLDiffHunk.id,
            )
        ).mappings().all()

        representative_hunks: dict[int, dict[str, Any]] = {}
        for row in rows:
            representative_hunks.setdefault(row["file_change_id"], dict(row))

        return representative_hunks

    def _attach_file_change_diff_previews(
        self, rows: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        file_change_ids = [
            int(row["file_change_id"])
            for row in rows
            if row.get("file_change_id") is not None
        ]
        representative_hunks = self._get_representative_hunks(file_change_ids)

        enriched_rows: list[dict[str, Any]] = []
        for row in rows:
            next_row = dict(row)
            representative_hunk = representative_hunks.get(
                next_row.get("file_change_id")
            )
            if representative_hunk:
                next_row["preview_source"] = representative_hunk["content"]
                next_row["preview_kind"] = "diff"
                next_row["preview_old_start"] = representative_hunk["old_start"]
                next_row["preview_old_lines"] = representative_hunk["old_lines"]
                next_row["preview_new_start"] = representative_hunk["new_start"]
                next_row["preview_new_lines"] = representative_hunk["new_lines"]
            else:
                next_row["preview_kind"] = "text"
                next_row["preview_old_start"] = None
                next_row["preview_old_lines"] = None
                next_row["preview_new_start"] = None
                next_row["preview_new_lines"] = None
            enriched_rows.append(next_row)

        return enriched_rows

    def _build_filter_result(
        self, candidate: FilterCandidate, query: str | None = None
    ) -> dict[str, Any]:
        highlight_strategy: HighlightStrategy
        if candidate.match_type == "hunk":
            highlight_strategy = "exact_query" if candidate.exact_match else "target_hunk"
        elif candidate.match_type == "file_change":
            highlight_strategy = "file_header"
        else:
            highlight_strategy = "none"

        preview_source = candidate.preview_source or candidate.file_path
        preview_query = query if highlight_strategy == "exact_query" else None
        preview = (
            _build_diff_preview_excerpt(
                preview_source,
                preview_query,
                old_start=candidate.preview_old_start,
                old_lines=candidate.preview_old_lines,
                new_start=candidate.preview_new_start,
                new_lines=candidate.preview_new_lines,
            )
            if candidate.preview_kind == "diff"
            else _build_preview_excerpt(preview_source, preview_query)
        )

        return {
            "sha": candidate.sha,
            "similarity": candidate.similarity,
            "display_match": {
                "match_type": candidate.match_type,
                "file_path": candidate.file_path,
                "hunk_id": candidate.hunk_id,
                "new_start": candidate.new_start,
                "old_start": candidate.old_start,
                "preview": preview,
                "preview_kind": candidate.preview_kind,
                "highlight_strategy": highlight_strategy,
            },
        }

    def _create_candidates(
        self, rows: list[dict[str, Any]], *, exact_match: bool
    ) -> list[FilterCandidate]:
        candidates: list[FilterCandidate] = []

        for row in rows:
            match_type = str(row["match_type"])
            if match_type not in MATCH_TYPE_PRIORITY:
                continue

            similarity = row.get("similarity")
            candidates.append(
                FilterCandidate(
                    sha=row["sha"],
                    match_type=match_type,  # type: ignore[arg-type]
                    similarity=float(similarity) if similarity is not None else None,
                    commit_time=row.get("commit_time"),
                    preview_source=row.get("preview_source"),
                    preview_kind=row.get("preview_kind", "text"),
                    file_change_id=row.get("file_change_id"),
                    hunk_id=row.get("hunk_id"),
                    file_path=row.get("file_path"),
                    old_start=row.get("old_start"),
                    new_start=row.get("new_start"),
                    preview_old_start=row.get("preview_old_start"),
                    preview_old_lines=row.get("preview_old_lines"),
                    preview_new_start=row.get("preview_new_start"),
                    preview_new_lines=row.get("preview_new_lines"),
                    exact_match=exact_match,
                )
            )

        return candidates

    def _compile_exact_results(
        self,
        candidates: list[FilterCandidate],
        query: str,
        max_results: int,
        exclude_shas: set[str] | None = None,
    ) -> list[dict[str, Any]]:
        grouped: dict[str, list[FilterCandidate]] = {}

        for candidate in candidates:
            if exclude_shas and candidate.sha in exclude_shas:
                continue
            grouped.setdefault(candidate.sha, []).append(candidate)

        ranked_candidates = [
            min(group, key=_candidate_display_sort_key)
            for group in grouped.values()
            if group
        ]
        ranked_candidates.sort(
            key=lambda candidate: (
                MATCH_TYPE_PRIORITY.get(candidate.match_type, 99),
                -(candidate.commit_time or 0),
                candidate.sha,
            )
        )

        return [
            self._build_filter_result(candidate, query)
            for candidate in ranked_candidates[:max_results]
        ]

    def _compile_semantic_results(
        self,
        candidates: list[FilterCandidate],
        query: str,
        max_results: int,
        exclude_shas: set[str] | None = None,
    ) -> list[dict[str, Any]]:
        grouped: dict[str, list[FilterCandidate]] = {}

        for candidate in candidates:
            if exclude_shas and candidate.sha in exclude_shas:
                continue
            grouped.setdefault(candidate.sha, []).append(candidate)

        ranked_candidates: list[tuple[FilterCandidate, FilterCandidate]] = []
        for group in grouped.values():
            if not group:
                continue

            ranking_candidate = min(
                group,
                key=lambda candidate: (
                    candidate.similarity
                    if candidate.similarity is not None
                    else float("inf"),
                    MATCH_TYPE_PRIORITY.get(candidate.match_type, 99),
                    -(candidate.commit_time or 0),
                    candidate.sha,
                ),
            )
            display_candidate = min(group, key=_candidate_display_sort_key)
            ranked_candidates.append((ranking_candidate, display_candidate))

        ranked_candidates.sort(
            key=lambda pair: (
                pair[0].similarity if pair[0].similarity is not None else float("inf"),
                MATCH_TYPE_PRIORITY.get(pair[1].match_type, 99),
                -(pair[0].commit_time or 0),
                pair[0].sha,
            )
        )

        results: list[dict[str, Any]] = []
        for ranking_candidate, display_candidate in ranked_candidates:
            result = self._build_filter_result(display_candidate, query)
            result["similarity"] = ranking_candidate.similarity
            results.append(result)
            if len(results) >= max_results:
                break

        return results

    def _fetch_exact_candidates(
        self, commit_shas: list[str], query: str
    ) -> list[FilterCandidate]:
        normalized_query = query.strip()
        if not commit_shas or not normalized_query:
            return []

        pattern = f"%{_escape_like_query(normalized_query)}%"
        file_path_expr = func.coalesce(SQLFileChange.new_path, SQLFileChange.old_path)

        commit_rows = self.session.execute(
            select(
                SQLCommit.sha.label("sha"),
                literal("commit").label("match_type"),
                literal(None).label("similarity"),
                SQLCommit.time.label("commit_time"),
                func.coalesce(SQLCommit.summary, SQLCommit.message).label(
                    "preview_source"
                ),
                literal("text").label("preview_kind"),
                literal(None).label("file_change_id"),
                literal(None).label("hunk_id"),
                literal(None).label("file_path"),
                literal(None).label("old_start"),
                literal(None).label("new_start"),
                literal(None).label("preview_old_start"),
                literal(None).label("preview_old_lines"),
                literal(None).label("preview_new_start"),
                literal(None).label("preview_new_lines"),
            ).where(
                SQLCommit.sha.in_(commit_shas),
                or_(
                    SQLCommit.message.ilike(pattern, escape="\\"),
                    SQLCommit.summary.ilike(pattern, escape="\\"),
                ),
            )
        ).mappings().all()

        file_rows = self.session.execute(
            select(
                SQLFileChange.commit_sha.label("sha"),
                literal("file_change").label("match_type"),
                literal(None).label("similarity"),
                SQLCommit.time.label("commit_time"),
                func.coalesce(SQLFileChange.summary, file_path_expr).label(
                    "preview_source"
                ),
                literal("text").label("preview_kind"),
                SQLFileChange.id.label("file_change_id"),
                literal(None).label("hunk_id"),
                file_path_expr.label("file_path"),
                literal(None).label("old_start"),
                literal(None).label("new_start"),
                literal(None).label("preview_old_start"),
                literal(None).label("preview_old_lines"),
                literal(None).label("preview_new_start"),
                literal(None).label("preview_new_lines"),
            )
            .join(SQLCommit, SQLCommit.sha == SQLFileChange.commit_sha)
            .where(
                SQLFileChange.commit_sha.in_(commit_shas),
                or_(
                    SQLFileChange.new_path.ilike(pattern, escape="\\"),
                    SQLFileChange.old_path.ilike(pattern, escape="\\"),
                    SQLFileChange.summary.ilike(pattern, escape="\\"),
                ),
            )
        ).mappings().all()

        hunk_rows = self.session.execute(
            select(
                SQLDiffHunk.commit_sha.label("sha"),
                literal("hunk").label("match_type"),
                literal(None).label("similarity"),
                SQLCommit.time.label("commit_time"),
                SQLDiffHunk.content.label("preview_source"),
                literal("diff").label("preview_kind"),
                SQLDiffHunk.file_change_id.label("file_change_id"),
                SQLDiffHunk.id.label("hunk_id"),
                file_path_expr.label("file_path"),
                SQLDiffHunk.old_start.label("old_start"),
                SQLDiffHunk.new_start.label("new_start"),
                SQLDiffHunk.old_start.label("preview_old_start"),
                SQLDiffHunk.old_lines.label("preview_old_lines"),
                SQLDiffHunk.new_start.label("preview_new_start"),
                SQLDiffHunk.new_lines.label("preview_new_lines"),
            )
            .join(SQLFileChange, SQLDiffHunk.file_change_id == SQLFileChange.id)
            .join(SQLCommit, SQLCommit.sha == SQLDiffHunk.commit_sha)
            .where(
                SQLDiffHunk.commit_sha.in_(commit_shas),
                SQLDiffHunk.content.ilike(pattern, escape="\\"),
            )
        ).mappings().all()

        file_rows = self._attach_file_change_diff_previews(
            [dict(row) for row in file_rows]
        )

        return self._create_candidates(
            [*hunk_rows, *file_rows, *commit_rows],
            exact_match=True,
        )

    def _fetch_semantic_candidates(
        self, commit_shas: list[str], query_embedding: list[float]
    ) -> list[FilterCandidate]:
        if not commit_shas:
            return []

        file_exclusion_filter = self._build_file_exclusion_filter()
        file_path_expr = func.coalesce(SQLFileChange.new_path, SQLFileChange.old_path)

        commit_similarity = SQLCommit.semantic_embedding.cosine_distance(query_embedding)
        commit_rows = self.session.execute(
            select(
                SQLCommit.sha.label("sha"),
                literal("commit").label("match_type"),
                commit_similarity.label("similarity"),
                SQLCommit.time.label("commit_time"),
                func.coalesce(SQLCommit.summary, SQLCommit.message).label(
                    "preview_source"
                ),
                literal("text").label("preview_kind"),
                literal(None).label("file_change_id"),
                literal(None).label("hunk_id"),
                literal(None).label("file_path"),
                literal(None).label("old_start"),
                literal(None).label("new_start"),
                literal(None).label("preview_old_start"),
                literal(None).label("preview_old_lines"),
                literal(None).label("preview_new_start"),
                literal(None).label("preview_new_lines"),
            ).where(
                SQLCommit.sha.in_(commit_shas),
                SQLCommit.semantic_embedding.isnot(None),
                commit_similarity <= self.SIMILARITY_THRESHOLDS["commit"],
            )
        ).mappings().all()

        fc_similarity = SQLFileChange.semantic_embedding.cosine_distance(query_embedding)
        file_rows = self.session.execute(
            select(
                SQLFileChange.commit_sha.label("sha"),
                literal("file_change").label("match_type"),
                fc_similarity.label("similarity"),
                SQLCommit.time.label("commit_time"),
                func.coalesce(SQLFileChange.summary, file_path_expr).label(
                    "preview_source"
                ),
                literal("text").label("preview_kind"),
                SQLFileChange.id.label("file_change_id"),
                literal(None).label("hunk_id"),
                file_path_expr.label("file_path"),
                literal(None).label("old_start"),
                literal(None).label("new_start"),
                literal(None).label("preview_old_start"),
                literal(None).label("preview_old_lines"),
                literal(None).label("preview_new_start"),
                literal(None).label("preview_new_lines"),
            )
            .join(SQLCommit, SQLCommit.sha == SQLFileChange.commit_sha)
            .where(
                SQLFileChange.commit_sha.in_(commit_shas),
                SQLFileChange.semantic_embedding.isnot(None),
                file_exclusion_filter,
                fc_similarity <= self.SIMILARITY_THRESHOLDS["file_change"],
            )
        ).mappings().all()

        hunk_similarity = SQLDiffHunk.semantic_embedding.cosine_distance(query_embedding)
        hunk_rows = self.session.execute(
            select(
                SQLDiffHunk.commit_sha.label("sha"),
                literal("hunk").label("match_type"),
                hunk_similarity.label("similarity"),
                SQLCommit.time.label("commit_time"),
                func.coalesce(SQLDiffHunk.summary, SQLDiffHunk.content).label(
                    "preview_source"
                ),
                literal("diff").label("preview_kind"),
                SQLDiffHunk.file_change_id.label("file_change_id"),
                SQLDiffHunk.id.label("hunk_id"),
                file_path_expr.label("file_path"),
                SQLDiffHunk.old_start.label("old_start"),
                SQLDiffHunk.new_start.label("new_start"),
                SQLDiffHunk.old_start.label("preview_old_start"),
                SQLDiffHunk.old_lines.label("preview_old_lines"),
                SQLDiffHunk.new_start.label("preview_new_start"),
                SQLDiffHunk.new_lines.label("preview_new_lines"),
            )
            .join(SQLFileChange, SQLDiffHunk.file_change_id == SQLFileChange.id)
            .join(SQLCommit, SQLCommit.sha == SQLDiffHunk.commit_sha)
            .where(
                SQLDiffHunk.commit_sha.in_(commit_shas),
                SQLDiffHunk.semantic_embedding.isnot(None),
                file_exclusion_filter,
                hunk_similarity <= self.SIMILARITY_THRESHOLDS["hunk"],
            )
        ).mappings().all()

        file_rows = self._attach_file_change_diff_previews(
            [dict(row) for row in file_rows]
        )

        return self._create_candidates(
            [*hunk_rows, *file_rows, *commit_rows],
            exact_match=False,
        )

    def _fetch_ordered_commit_shas(
        self, commit_shas: list[str], max_results: int
    ) -> list[str]:
        if not commit_shas:
            return []

        rows = self.session.execute(
            select(SQLCommit.sha)
            .where(SQLCommit.sha.in_(commit_shas))
            .order_by(SQLCommit.time.desc(), SQLCommit.sha.desc())
            .limit(max_results)
        ).all()
        return [row.sha for row in rows]

    def filter(
        self, query: str, filters: Dict[str, Any], repo_path: str, max_results: int
    ) -> list[dict[str, Any]]:
        logger.info("Filtering for query '%s' with filters %s", query, filters)

        normalized_query = query.strip()
        max_results = max(1, max_results)

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

        filtered_shas = self.session.execute(base_query).scalars().all()
        if not filtered_shas:
            logger.info("Found 0 relevant commits")
            return []

        if not normalized_query:
            ordered_shas = self._fetch_ordered_commit_shas(filtered_shas, max_results)
            return [
                {
                    "sha": sha,
                    "similarity": None,
                    "display_match": None,
                }
                for sha in ordered_shas
            ]

        results: list[dict[str, Any]] = []
        exact_candidates = self._fetch_exact_candidates(filtered_shas, normalized_query)
        if exact_candidates:
            results.extend(
                self._compile_exact_results(
                    exact_candidates,
                    normalized_query,
                    max_results,
                )
            )

        if len(results) < max_results:
            query_embedding = self._get_query_embedding(normalized_query)
        else:
            query_embedding = None

        if query_embedding and len(results) < max_results:
            semantic_candidates = self._fetch_semantic_candidates(
                filtered_shas,
                query_embedding,
            )
            if semantic_candidates:
                results.extend(
                    self._compile_semantic_results(
                        semantic_candidates,
                        normalized_query,
                        max_results - len(results),
                        exclude_shas={result["sha"] for result in results},
                    )
                )

        logger.info("Found %s relevant commits", len(results))
        return results

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
