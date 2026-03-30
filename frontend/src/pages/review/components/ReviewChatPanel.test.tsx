import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReviewChatPanel } from "@/pages/review/components/ReviewChatPanel";
import type { ChatCodeContext, ChatMessage } from "@/lib/definitions/chat";

function buildCodeContext(
	overrides: Partial<ChatCodeContext> = {},
): ChatCodeContext {
	return {
		id: "context-1",
		filePath: "frontend/src/pages/Review.tsx",
		side: "modified",
		startLine: 40,
		startColumn: 1,
		endLine: 44,
		endColumn: 18,
		selectedText: "const panel = createAssistantPanel();",
		language: "typescript",
		...overrides,
	};
}

function buildMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
	return {
		id: "message-1",
		role: "user",
		content: "Please review this code path.",
		timestamp: new Date("2026-03-29T10:00:00.000Z"),
		...overrides,
	};
}

describe("ReviewChatPanel", () => {
	it("renders attached code context buttons in the draft area and lets users remove them", async () => {
		const user = userEvent.setup();
		const onCodeContextClick = vi.fn();
		const onRemoveDraftCodeContext = vi.fn();

		render(
			<ReviewChatPanel
				messages={[]}
				draft=""
				draftCodeContexts={[buildCodeContext()]}
				onDraftChange={() => {}}
				onSendMessage={() => {}}
				onCodeContextClick={onCodeContextClick}
				onRemoveDraftCodeContext={onRemoveDraftCodeContext}
			/>,
		);

		await user.click(
			screen.getByRole("button", {
				name: /jump to frontend\/src\/pages\/review\.tsx/i,
			}),
		);
		expect(onCodeContextClick).toHaveBeenCalledWith(buildCodeContext());

		await user.click(
			screen.getByRole("button", {
				name: /remove frontend\/src\/pages\/review\.tsx/i,
			}),
		);
		expect(onRemoveDraftCodeContext).toHaveBeenCalledWith("context-1");
	});

	it("renders attached code context buttons inside sent user messages", async () => {
		const user = userEvent.setup();
		const onCodeContextClick = vi.fn();
		const context = buildCodeContext();

		render(
			<ReviewChatPanel
				messages={[buildMessage({ codeContexts: [context] })]}
				draft=""
				draftCodeContexts={[]}
				onDraftChange={() => {}}
				onSendMessage={() => {}}
				onCodeContextClick={onCodeContextClick}
			/>,
		);

		await user.click(
			screen.getByRole("button", {
				name: /jump to frontend\/src\/pages\/review\.tsx/i,
			}),
		);

		expect(onCodeContextClick).toHaveBeenCalledWith(context);
		expect(screen.getByText(/please review this code path/i)).toBeInTheDocument();
	});

	it("does not render cited commits for assistant messages", () => {
		render(
			<ReviewChatPanel
				messages={[
					buildMessage({
						role: "assistant",
						content: "The merge branch setup looks correct.",
						citedCommits: [
							{
								sha: "abc12345",
								similarity: 0.91,
								message: "Unrelated historical commit",
							},
						],
					}),
				]}
				draft=""
				draftCodeContexts={[]}
				onDraftChange={() => {}}
				onSendMessage={() => {}}
			/>,
		);

		expect(
			screen.getByText(/the merge branch setup looks correct/i),
		).toBeInTheDocument();
		expect(screen.queryByText(/cited commits/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/unrelated historical commit/i)).not.toBeInTheDocument();
	});
});
