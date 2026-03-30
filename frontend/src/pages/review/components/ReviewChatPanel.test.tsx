import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReviewChatPanel } from "@/pages/review/components/ReviewChatPanel";
import type { ChatCodeContext, ChatMessage } from "@/lib/definitions/chat";
import type { ReviewChatReferenceTarget } from "@/components/ui/custom/MarkdownRenderer";

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

const reviewReferencePaths = [
	"frontend/src/pages/Review.tsx",
	"frontend/src/pages/review/components/ReviewChatPanel.tsx",
];

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

	it("links assistant file references to the diff file", async () => {
		const user = userEvent.setup();
		const onAssistantReferenceClick = vi.fn<
			(target: ReviewChatReferenceTarget) => void
		>();

		render(
			<ReviewChatPanel
				messages={[
					buildMessage({
						role: "assistant",
						content: "Start with frontend/src/pages/Review.tsx before checking anything else.",
					}),
				]}
				draft=""
				draftCodeContexts={[]}
				onDraftChange={() => {}}
				onSendMessage={() => {}}
				onAssistantReferenceClick={onAssistantReferenceClick}
				reviewReferencePaths={reviewReferencePaths}
			/>,
		);

		await user.click(
			screen.getByRole("button", {
				name: "frontend/src/pages/Review.tsx",
			}),
		);

		expect(onAssistantReferenceClick).toHaveBeenCalledWith({
			filePath: "frontend/src/pages/Review.tsx",
			line: null,
		});
	});

	it("links assistant line references and uses the first line of a range", async () => {
		const user = userEvent.setup();
		const onAssistantReferenceClick = vi.fn<
			(target: ReviewChatReferenceTarget) => void
		>();

		render(
			<ReviewChatPanel
				messages={[
					buildMessage({
						role: "assistant",
						content: [
							"See frontend/src/pages/Review.tsx:42-48 for the rail behavior.",
							"Then compare frontend/src/pages/review/components/ReviewChatPanel.tsx#L18-L26.",
						].join("\n\n"),
					}),
				]}
				draft=""
				draftCodeContexts={[]}
				onDraftChange={() => {}}
				onSendMessage={() => {}}
				onAssistantReferenceClick={onAssistantReferenceClick}
				reviewReferencePaths={reviewReferencePaths}
			/>,
		);

		await user.click(
			screen.getByRole("button", {
				name: "frontend/src/pages/Review.tsx:42-48",
			}),
		);
		await user.click(
			screen.getByRole("button", {
				name: "frontend/src/pages/review/components/ReviewChatPanel.tsx#L18-L26",
			}),
		);

		expect(onAssistantReferenceClick).toHaveBeenNthCalledWith(1, {
			filePath: "frontend/src/pages/Review.tsx",
			line: 42,
		});
		expect(onAssistantReferenceClick).toHaveBeenNthCalledWith(2, {
			filePath: "frontend/src/pages/review/components/ReviewChatPanel.tsx",
			line: 18,
		});
	});

	it("does not auto-link user messages or non-diff assistant paths", () => {
		render(
			<ReviewChatPanel
				messages={[
					buildMessage({
						role: "user",
						content: "Please inspect frontend/src/pages/Review.tsx:42 next.",
					}),
					buildMessage({
						id: "message-2",
						role: "assistant",
						content: "The unrelated src/not-in-diff.ts:99 path should stay plain text.",
					}),
				]}
				draft=""
				draftCodeContexts={[]}
				onDraftChange={() => {}}
				onSendMessage={() => {}}
				onAssistantReferenceClick={() => {}}
				reviewReferencePaths={reviewReferencePaths}
			/>,
		);

		expect(
			screen.queryByRole("button", {
				name: "frontend/src/pages/Review.tsx:42",
			}),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", {
				name: "src/not-in-diff.ts:99",
			}),
		).not.toBeInTheDocument();
		expect(screen.getByText(/src\/not-in-diff\.ts:99/i)).toBeInTheDocument();
	});
});
