import unittest

from core.retriever import (
    FilterCandidate,
    Retriever,
    _build_diff_preview_excerpt,
    _build_preview_excerpt,
)


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

    def test_compile_semantic_results_preserves_similarity_ranking_but_shows_hunk_match(self) -> None:
        candidates = [
            FilterCandidate(
                sha="commit-a",
                match_type="commit",
                similarity=0.08,
                commit_time=10,
                preview_source="Commit level summary",
                preview_kind="text",
            ),
            FilterCandidate(
                sha="commit-a",
                match_type="hunk",
                similarity=0.24,
                commit_time=10,
                preview_source="-before\n+target token changed in the diff\n",
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
                sha="commit-b",
                match_type="file_change",
                similarity=0.15,
                commit_time=20,
                preview_source="src/b.ts",
                preview_kind="text",
                file_path="src/b.ts",
            ),
        ]

        results = self.retriever._compile_semantic_results(candidates, "token", 5)

        self.assertEqual([result["sha"] for result in results], ["commit-a", "commit-b"])
        self.assertEqual(results[0]["similarity"], 0.08)
        self.assertEqual(results[0]["display_match"]["match_type"], "hunk")
        self.assertEqual(results[0]["display_match"]["highlight_strategy"], "target_hunk")
        self.assertEqual(results[0]["display_match"]["preview_kind"], "diff")
        self.assertEqual(results[0]["display_match"]["file_path"], "src/a.ts")

    def test_compile_exact_results_prioritizes_diff_hits_before_commit_only_hits(self) -> None:
        candidates = [
            FilterCandidate(
                sha="newer-commit-hit",
                match_type="commit",
                similarity=None,
                commit_time=30,
                preview_source="token only appears in the commit message",
                preview_kind="text",
                exact_match=True,
            ),
            FilterCandidate(
                sha="older-hunk-hit",
                match_type="hunk",
                similarity=None,
                commit_time=10,
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
        ]

        results = self.retriever._compile_exact_results(candidates, "token", 5)

        self.assertEqual(
            [result["sha"] for result in results],
            ["older-hunk-hit", "newer-commit-hit"],
        )
        self.assertEqual(results[0]["display_match"]["highlight_strategy"], "exact_query")
        self.assertEqual(results[0]["display_match"]["match_type"], "hunk")
        self.assertEqual(results[0]["display_match"]["preview_kind"], "diff")
        self.assertEqual(results[1]["display_match"]["highlight_strategy"], "none")

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
