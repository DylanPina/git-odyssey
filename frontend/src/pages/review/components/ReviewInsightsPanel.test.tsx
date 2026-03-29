import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReviewInsightsPanel } from "@/pages/review/components/ReviewInsightsPanel";
import type {
	ReviewFinding,
	ReviewResult,
	ReviewRun,
} from "@/lib/definitions/review";
import type { ReasoningTraceEntry } from "@/pages/review/review-types";

function buildRun(overrides: Partial<ReviewRun> = {}): ReviewRun {
	return {
		id: "run-1",
		session_id: "session-1",
		engine: "codex_cli",
		mode: "native_review",
		status: "completed",
		created_at: "2026-03-20T10:00:00.000Z",
		updated_at: "2026-03-20T10:00:00.000Z",
		events: [],
		approvals: [],
		...overrides,
	};
}

function buildResult(findings: ReviewFinding[]): ReviewResult {
	return {
		id: "result-1",
		run_id: "run-1",
		summary: "Structured summary",
		findings,
		partial: false,
		generated_at: "2026-03-20T10:02:00.000Z",
		created_at: "2026-03-20T10:02:00.000Z",
		updated_at: "2026-03-20T10:02:00.000Z",
	};
}

describe("ReviewInsightsPanel", () => {
	it("renders findings and calls onSelectFinding for navigable items", async () => {
		const user = userEvent.setup();
		const onSelectFinding = vi.fn();
		const findings: ReviewFinding[] = [
			{
				id: "finding-1",
				severity: "high",
				title: "Fix the auth regression",
				body: "This path is reachable.",
				file_path: "src/auth.ts",
				new_start: 12,
			},
			{
				id: "finding-2",
				severity: "low",
				title: "Non navigable note",
				body: "This file is unavailable.",
				file_path: "src/missing.ts",
			},
		];

		render(
			<ReviewInsightsPanel
				activeRun={buildRun()}
				reviewResult={buildResult(findings)}
				findingsLabel="2 findings"
				selectedFindingId={null}
				onSelectFinding={onSelectFinding}
				canNavigateToFinding={(finding) => finding.file_path === "src/auth.ts"}
				reasoningTrace={[]}
				onToggleOpen={() => {}}
				onToggleFullscreen={() => {}}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /fix the auth regression/i }));

		expect(onSelectFinding).toHaveBeenCalledWith(findings[0]);
		expect(screen.getByText("Reference unavailable in the current diff.")).toBeInTheDocument();
	});

	it("shows in-progress reasoning when the run is active", () => {
		const reasoningTrace: ReasoningTraceEntry[] = [
			{
				id: "trace-1",
				method: "agentMessageDelta",
				text: "Inspecting the diff",
				stableText: "Inspecting the diff",
				latestDeltaText: null,
				sequence: 2,
				createdAt: "2026-03-20T10:01:00.000Z",
			},
		];

		render(
			<ReviewInsightsPanel
				activeRun={buildRun({ status: "running" })}
				reviewResult={null}
				findingsLabel="Running"
				selectedFindingId={null}
				onSelectFinding={() => {}}
				canNavigateToFinding={() => false}
				reasoningTrace={reasoningTrace}
				onToggleOpen={() => {}}
				onToggleFullscreen={() => {}}
			/>,
		);

		expect(screen.getByText(/review in progress/i)).toBeInTheDocument();
		expect(screen.getByText("Inspecting the diff")).toBeInTheDocument();
	});
});
