import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReviewChatPanel } from "@/pages/review/components/ReviewChatPanel";
import type {
	ChatCodeContext,
	ChatFindingContext,
	ChatMessage,
} from "@/lib/definitions/chat";
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

function buildFindingContext(
	overrides: Partial<ChatFindingContext> = {},
): ChatFindingContext {
	return {
		id: "finding-1",
		severity: "medium",
		title: "Rail state can collapse unexpectedly",
		body: "This effect resets the panel whenever the active run clears.",
		file_path: "frontend/src/pages/review/useReviewLayoutState.ts",
		new_start: 28,
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
	it("sends on Enter and keeps attached draft context visible", async () => {
		const user = userEvent.setup();
		const onSendMessage = vi.fn();

		render(
			<ReviewChatPanel
				messages={[]}
				draft="Please summarize the diff"
				draftCodeContexts={[buildCodeContext()]}
				onDraftChange={() => {}}
				onSendMessage={onSendMessage}
				onCodeContextClick={() => {}}
				onRemoveDraftCodeContext={() => {}}
			/>,
		);

		await user.type(
			screen.getByPlaceholderText(/ask codex about this diff/i),
			"{enter}",
		);

		expect(onSendMessage).toHaveBeenCalledTimes(1);
		expect(
			screen.getByRole("button", {
				name: /jump to frontend\/src\/pages\/review\.tsx/i,
			}),
		).toBeInTheDocument();
	});

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

	it("renders attached finding chips in the draft area and lets users remove them", async () => {
		const user = userEvent.setup();
		const onRemoveDraftFindingContext = vi.fn();

		render(
			<ReviewChatPanel
				messages={[]}
				draft=""
				draftCodeContexts={[]}
				draftFindingContexts={[buildFindingContext()]}
				onDraftChange={() => {}}
				onSendMessage={() => {}}
				onRemoveDraftFindingContext={onRemoveDraftFindingContext}
			/>,
		);

		expect(
			screen.getByText(/rail state can collapse unexpectedly/i),
		).toBeInTheDocument();

		await user.click(
			screen.getByRole("button", {
				name: /remove medium .* rail state can collapse unexpectedly/i,
			}),
		);

		expect(onRemoveDraftFindingContext).toHaveBeenCalledWith("finding-1");
	});

	it("renders attached finding chips inside sent user messages", () => {
		render(
			<ReviewChatPanel
				messages={[buildMessage({ findingContexts: [buildFindingContext()] })]}
				draft=""
				draftCodeContexts={[]}
				onDraftChange={() => {}}
				onSendMessage={() => {}}
			/>,
		);

		expect(
			screen.getByText(/rail state can collapse unexpectedly/i),
		).toBeInTheDocument();
	});

	it("jumps to an attached finding when its chip is clicked", async () => {
		const user = userEvent.setup();
		const onFindingContextClick = vi.fn();

		render(
			<ReviewChatPanel
				messages={[buildMessage({ findingContexts: [buildFindingContext()] })]}
				draft=""
				draftCodeContexts={[]}
				onDraftChange={() => {}}
				onSendMessage={() => {}}
				onFindingContextClick={onFindingContextClick}
			/>,
		);

		await user.click(
			screen.getByRole("button", {
				name: /jump to medium .* rail state can collapse unexpectedly/i,
			}),
		);

		expect(onFindingContextClick).toHaveBeenCalledWith(buildFindingContext());
	});

	it("allows sending a finding-only draft", async () => {
		const user = userEvent.setup();
		const onSendMessage = vi.fn();

		render(
			<ReviewChatPanel
				messages={[]}
				draft=""
				draftCodeContexts={[]}
				draftFindingContexts={[buildFindingContext()]}
				onDraftChange={() => {}}
				onSendMessage={onSendMessage}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /send/i }));

		expect(onSendMessage).toHaveBeenCalledTimes(1);
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
