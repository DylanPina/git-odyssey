import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ReviewTitleBarTrailing } from "@/pages/review/components/ReviewTitleBarTrailing";
import type { ReviewHistoryEntry } from "@/lib/definitions/review";
import { useReviewHistoryFilters } from "@/pages/review/useReviewHistoryFilters";

function buildHistoryEntry(overrides: Partial<ReviewHistoryEntry> = {}): ReviewHistoryEntry {
	return {
		run_id: "run-1",
		session_id: "session-1",
		repo_path: "/tmp/example-repo",
		target_mode: "compare",
		base_ref: "main",
		head_ref: "feature",
		commit_sha: null,
		base_head_sha: "aaaaaaaa",
		head_head_sha: "bbbbbbbb",
		merge_base_sha: "cccccccc",
		engine: "codex_cli",
		mode: "native_review",
		partial: false,
		findings_count: 1,
		severity_counts: {
			high: 1,
			medium: 0,
			low: 0,
		},
		summary: "Found one issue.",
		generated_at: "2026-03-20T10:02:00.000Z",
		completed_at: "2026-03-20T10:03:00.000Z",
		run_created_at: "2026-03-20T10:00:00.000Z",
		...overrides,
	};
}

function ReviewTitleBarTrailingHarness({
	reviewHistory,
	isViewingHistory = false,
	targetMode = "compare",
}: {
	reviewHistory: ReviewHistoryEntry[];
	isViewingHistory?: boolean;
	targetMode?: "compare" | "commit";
}) {
	const filters = useReviewHistoryFilters(reviewHistory);

	return (
		<ReviewTitleBarTrailing
			targetMode={targetMode}
			branchOptions={["main", "feature"]}
			baseRef="main"
			headRef="feature"
			commitSha={targetMode === "commit" ? "1234567890abcdef" : null}
			onBaseRefChange={() => {}}
			onHeadRefChange={() => {}}
			canStartReview
			canCancelReview={false}
			hasCancelableRun={false}
			reviewHistory={reviewHistory}
			filteredReviewHistory={filters.filteredReviewHistory}
			filters={filters}
			isViewingHistory={isViewingHistory}
			selectedHistoryRunId={isViewingHistory ? reviewHistory[0]?.run_id ?? null : null}
			historySelectionLoadingRunId={null}
			historyError={null}
			isHistoryLoading={false}
			onReturnToLatestReview={() => {}}
			onSelectHistoryReview={() => {}}
			onStartReview={() => {}}
			onCancelReview={() => {}}
		/>
	);
}

describe("ReviewTitleBarTrailing", () => {
	it("does not render previous reviews button when history is empty", () => {
		render(<ReviewTitleBarTrailingHarness reviewHistory={[]} />);

		expect(
			screen.queryByRole("button", { name: /previous reviews/i }),
		).not.toBeInTheDocument();
	});

	it("opens previous reviews overlay from the titlebar button", async () => {
		const user = userEvent.setup();

		render(
			<ReviewTitleBarTrailingHarness
				reviewHistory={[buildHistoryEntry()]}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /reviews/i }));

		expect(screen.getByPlaceholderText(/search ids, refs, shas/i)).toBeInTheDocument();
		expect(screen.getByText(/found one issue/i)).toBeInTheDocument();
	});

	it("shows return to latest inside the overlay when viewing history", async () => {
		const user = userEvent.setup();

		render(
			<ReviewTitleBarTrailingHarness
				reviewHistory={[buildHistoryEntry()]}
				isViewingHistory
			/>,
		);

		await user.click(screen.getByRole("button", { name: /reviews/i }));

		expect(
			screen.getByRole("button", { name: /return to latest/i }),
		).toBeInTheDocument();
	});

	it("shows a commit chip instead of branch pickers in commit mode", () => {
		render(
			<ReviewTitleBarTrailingHarness
				reviewHistory={[buildHistoryEntry({ target_mode: "commit", commit_sha: "1234567890abcdef" })]}
				targetMode="commit"
			/>,
		);

		expect(screen.getByText(/commit/i)).toBeInTheDocument();
		expect(screen.getByText("1234567890ab")).toBeInTheDocument();
		expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
	});
});
