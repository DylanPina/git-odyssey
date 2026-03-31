import unittest
from unittest.mock import Mock

from core.retriever import (
    FilterCandidate,
    Retriever,
    _build_diff_preview_excerpt,
    _build_preview_excerpt,
)


class EmptyMappingsResult:
    def mappings(self):
        return self

    def all(self):
        return []


class FilterRetrieverHelperTests(unittest.TestCase):
    def setUp(self) -> None:
        self.retriever = Retriever.__new__(Retriever)

    def test_preview_excerpt_centers_exact_query(self) -> None:
        preview = _build_preview_excerpt(
            "alpha beta gamma delta epsilon zeta eta theta iota kappa",
            "delta",
            context_chars=6,
        )

        self.assertIsNotNone(preview)
        self.assertIn("delta", preview or "")
        self.assertTrue((preview or "").startswith("..."))
        self.assertTrue((preview or "").endswith("..."))

    def test_diff_preview_excerpt_preserves_diff_formatting(self) -> None:
        preview = _build_diff_preview_excerpt(
            "-const hidden = false;\n context line\n+const token = true;\n+return token;\n",
            "token",
            old_start=10,
            old_lines=2,
            new_start=10,
            new_lines=3,
        )

        self.assertEqual(
            preview,
            "@@ -10,2 +10,3 @@\n-const hidden = false;\n context line\n+const token = true;\n+return token;",
        )

    def test_compile_ranked_results_prefers_recent_semantic_match_when_relevance_is_close(self) -> None:
        candidates = [
            FilterCandidate(
                match_type="hunk",
                sha="older-stronger",
                similarity=0.08,
                commit_time=80 * 86400,
                preview_source="-before\n+older semantic match\n",
                preview_kind="diff",
                file_path="src/a.ts",
                hunk_id=11,
                new_start=18,
                old_start=17,
                preview_old_start=17,
                preview_old_lines=1,
                preview_new_start=17,
                preview_new_lines=1,
            ),
            FilterCandidate(
                match_type="hunk",
                sha="newer-close",
                similarity=0.12,
                commit_time=199 * 86400,
                preview_source="-before\n+newer semantic match\n",
                preview_kind="diff",
                file_path="src/b.ts",
                hunk_id=12,
                new_start=9,
                old_start=8,
                preview_old_start=8,
                preview_old_lines=1,
                preview_new_start=8,
                preview_new_lines=1,
            ),
        ]
        self.retriever._current_timestamp = lambda: 200 * 86400

        results = self.retriever._compile_ranked_results(candidates, "token", 5)

        self.assertEqual([result["sha"] for result in results], ["newer-close", "older-stronger"])
        self.assertEqual(results[0]["similarity"], 0.12)
        self.assertEqual(results[0]["display_match"]["match_type"], "hunk")

    def test_compile_ranked_results_uses_exact_bonus_for_display_and_ordering(self) -> None:
        candidates = [
            FilterCandidate(
                sha="commit-a",
                match_type="commit",
                similarity=0.11,
                commit_time=100,
                preview_source="semantic commit message",
                preview_kind="text",
            ),
            FilterCandidate(
                sha="commit-a",
                match_type="hunk",
                similarity=None,
                commit_time=100,
                preview_source="-const token = false;\n+const token = true;\n",
                preview_kind="diff",
                file_path="src/search.ts",
                hunk_id=7,
                new_start=12,
                old_start=11,
                preview_old_start=11,
                preview_old_lines=1,
                preview_new_start=11,
                preview_new_lines=1,
                exact_match=True,
            ),
            FilterCandidate(
                sha="commit-b",
                match_type="hunk",
                similarity=0.1,
                commit_time=100,
                preview_source="-before\n+semantic result\n",
                preview_kind="diff",
                file_path="src/other.ts",
                hunk_id=8,
                new_start=2,
                old_start=1,
                preview_old_start=1,
                preview_old_lines=1,
                preview_new_start=1,
                preview_new_lines=1,
            ),
        ]

        results = self.retriever._compile_ranked_results(candidates, "token", 5)

        self.assertEqual(
            [result["sha"] for result in results],
            ["commit-a", "commit-b"],
        )
        self.assertEqual(results[0]["display_match"]["highlight_strategy"], "exact_query")
        self.assertEqual(results[0]["display_match"]["match_type"], "hunk")
        self.assertEqual(results[0]["display_match"]["preview_kind"], "diff")
        self.assertEqual(results[0]["similarity"], 0.11)

    def test_compile_ranked_results_exact_bonus_does_not_beat_clearly_better_recent_semantic_match(self) -> None:
        candidates = [
            FilterCandidate(
                sha="older-exact",
                match_type="hunk",
                similarity=None,
                commit_time=50 * 86400,
                preview_source="-const token = false;\n+const token = true;\n",
                preview_kind="diff",
                file_path="src/search.ts",
                hunk_id=7,
                new_start=12,
                old_start=11,
                preview_old_start=11,
                preview_old_lines=1,
                preview_new_start=11,
                preview_new_lines=1,
                exact_match=True,
            ),
            FilterCandidate(
                sha="newer-semantic",
                match_type="hunk",
                similarity=0.04,
                commit_time=199 * 86400,
                preview_source="-before\n+semantic winner\n",
                preview_kind="diff",
                file_path="src/semantic.ts",
                hunk_id=9,
                new_start=4,
                old_start=3,
                preview_old_start=3,
                preview_old_lines=1,
                preview_new_start=3,
                preview_new_lines=1,
            ),
        ]
        self.retriever._current_timestamp = lambda: 200 * 86400

        results = self.retriever._compile_ranked_results(candidates, "token", 5)

        self.assertEqual([result["sha"] for result in results], ["newer-semantic", "older-exact"])

    def test_fetch_exact_candidates_does_not_include_summary_fields(self) -> None:
        self.retriever.session = Mock()
        captured_sql: list[str] = []

        def execute(statement):
            captured_sql.append(str(statement))
            return EmptyMappingsResult()

        self.retriever.session.execute.side_effect = execute

        results = self.retriever._fetch_exact_candidates(["abc123"], "summary-only-term")

        self.assertEqual(results, [])
        self.assertEqual(len(captured_sql), 3)
        self.assertTrue(all("summary" not in sql.lower() for sql in captured_sql))

    def test_build_filter_result_uses_diff_preview_for_file_change_when_diff_kind_is_set(self) -> None:
        candidate = FilterCandidate(
            sha="file-change-hit",
            match_type="file_change",
            similarity=0.2,
            commit_time=5,
            preview_source="-before\n+after\n",
            preview_kind="diff",
            file_change_id=8,
            file_path="src/file.ts",
            preview_old_start=4,
            preview_old_lines=1,
            preview_new_start=4,
            preview_new_lines=1,
        )

        result = self.retriever._build_filter_result(candidate, "token")

        self.assertEqual(result["display_match"]["preview_kind"], "diff")
        self.assertEqual(result["display_match"]["highlight_strategy"], "file_header")
        self.assertEqual(result["display_match"]["preview"], "@@ -4,1 +4,1 @@\n-before\n+after")


if __name__ == "__main__":
    unittest.main()
