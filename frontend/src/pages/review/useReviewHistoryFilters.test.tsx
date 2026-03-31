import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ReviewHistoryEntry } from "@/lib/definitions/review";
import { useReviewHistoryFilters } from "@/pages/review/useReviewHistoryFilters";

function buildEntry(overrides: Partial<ReviewHistoryEntry>): ReviewHistoryEntry {
	return {
		session_id: "session-1",
		run_id: "run-1",
		repo_path: "/tmp/repo",
		target_mode: "compare",
		base_ref: "main",
		head_ref: "feature",
		commit_sha: null,
		merge_base_sha: "11111111",
		base_head_sha: "22222222",
		head_head_sha: "33333333",
		engine: "codex",
		mode: "native_review",
		partial: false,
		summary: "Summary",
		findings_count: 1,
		severity_counts: {
			high: 0,
			medium: 1,
			low: 0,
		},
		generated_at: "2026-03-20T15:00:00.000Z",
		completed_at: "2026-03-20T15:01:00.000Z",
		run_created_at: "2026-03-20T14:59:00.000Z",
		...overrides,
	};
}

describe("useReviewHistoryFilters", () => {
	it("combines search, severity, outcome, and date filters", async () => {
		const entries = [
			buildEntry({
				run_id: "run-high",
				summary: "High severity authentication issue",
				severity_counts: { high: 1, medium: 0, low: 0 },
				findings_count: 1,
				generated_at: "2026-03-22T10:00:00.000Z",
			}),
			buildEntry({
				run_id: "run-clean",
				summary: "Clean review",
				findings_count: 0,
				severity_counts: { high: 0, medium: 0, low: 0 },
				generated_at: "2026-03-18T10:00:00.000Z",
			}),
			buildEntry({
				run_id: "run-medium",
				summary: "Medium severity regression",
				severity_counts: { high: 0, medium: 1, low: 0 },
				findings_count: 1,
				generated_at: "2026-03-25T10:00:00.000Z",
			}),
		];

		const { result } = renderHook(() => useReviewHistoryFilters(entries));

		expect(result.current.filteredReviewHistory).toHaveLength(3);

		act(() => {
			result.current.setHistorySeverityFilter("has_high");
			result.current.setHistorySearchQuery("run-high");
			result.current.setHistoryStartDate(new Date("2026-03-21T00:00:00.000Z"));
		});

		await waitFor(() => {
			expect(result.current.filteredReviewHistory.map((entry) => entry.run_id)).toEqual([
				"run-high",
			]);
		});

		act(() => {
			result.current.setHistoryOutcomeFilter("clean");
		});

		await waitFor(() => {
			expect(result.current.filteredReviewHistory).toHaveLength(0);
		});

		act(() => {
			result.current.resetHistoryFilters();
		});

		await waitFor(() => {
			expect(result.current.filteredReviewHistory).toHaveLength(3);
			expect(result.current.hasActiveHistoryFilters).toBe(false);
		});
	});
});
