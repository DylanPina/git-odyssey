import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ReviewAssistantPanel } from "@/pages/review/components/ReviewAssistantPanel";
import type {
	ReviewFinding,
	ReviewResult,
	ReviewRun,
} from "@/lib/definitions/review";
import type { ReviewAssistantTab } from "@/pages/review/review-types";

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

function ControlledAssistantPanel({
	initialTab = "chat",
	activeRun = null,
	reviewResult = null,
}: {
	initialTab?: ReviewAssistantTab;
	activeRun?: ReviewRun | null;
	reviewResult?: ReviewResult | null;
}) {
	const [activeTab, setActiveTab] = useState<ReviewAssistantTab>(initialTab);

	return (
		<ReviewAssistantPanel
			activeTab={activeTab}
			onActiveTabChange={setActiveTab}
			activeRun={activeRun}
			reviewResult={reviewResult}
			findingsLabel={reviewResult ? `${reviewResult.findings.length} findings` : "No review"}
			selectedFindingId={null}
			onSelectFinding={() => {}}
			canNavigateToFinding={() => true}
			reasoningTrace={[]}
			chatMessages={[]}
			chatDraft=""
			draftCodeContexts={[]}
			selectedModelId="gpt-5.4-mini"
			onChatDraftChange={() => {}}
			onSelectedModelIdChange={() => {}}
			onSendChatMessage={() => {}}
			onChatCodeContextClick={() => {}}
			onRemoveDraftCodeContext={() => {}}
			onToggleOpen={() => {}}
			onToggleFullscreen={() => {}}
		/>
	);
}

describe("ReviewAssistantPanel", () => {
	it("defaults to the chat tab when requested", () => {
		render(<ControlledAssistantPanel initialTab="chat" />);

		expect(
			screen.getByRole("radio", { name: /chat tab/i }),
		).toHaveAttribute("data-state", "on");
		expect(screen.getByText(/ask about this diff/i)).toBeInTheDocument();
	});

	it("switches between chat and review tabs", async () => {
		const user = userEvent.setup();
		const findings: ReviewFinding[] = [
			{
				id: "finding-1",
				severity: "high",
				title: "Fix the auth regression",
				body: "This path is reachable.",
				file_path: "src/auth.ts",
				new_start: 12,
			},
		];

		render(
			<ControlledAssistantPanel
				initialTab="chat"
				activeRun={buildRun()}
				reviewResult={buildResult(findings)}
			/>,
		);

		await user.click(screen.getByRole("radio", { name: /review tab/i }));

		expect(
			screen.getByRole("radio", { name: /review tab/i }),
		).toHaveAttribute("data-state", "on");
		expect(screen.getByText(/fix the auth regression/i)).toBeInTheDocument();

		await user.click(screen.getByRole("radio", { name: /chat tab/i }));

		expect(screen.getByText(/ask about this diff/i)).toBeInTheDocument();
	});
});
