import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendReviewChatMessage } from "@/api/api";
import type { ChatMessage } from "@/lib/definitions/chat";
import type { ReviewResult, ReviewRun } from "@/lib/definitions/review";
import { REVIEW_CHAT_DEFAULT_MODEL_ID } from "@/pages/review/review-constants";
import { useReviewChatSession } from "@/pages/review/useReviewChatSession";
import {
	getReviewChatModelStorageKey,
	getReviewChatStorageKey,
} from "@/pages/review/review-storage";

vi.mock("@/api/api", () => ({
	sendReviewChatMessage: vi.fn(),
}));

function clearTestStorage() {
	if (typeof window.localStorage?.clear === "function") {
		window.localStorage.clear();
		return;
	}

	const keys = Object.keys(window.localStorage ?? {});
	keys.forEach((key) => {
		window.localStorage.removeItem(key);
	});
}

function buildStoredMessage(
	overrides: Partial<ChatMessage> = {},
): Omit<ChatMessage, "timestamp"> & { timestamp: string } {
	return {
		id: overrides.id ?? "message-1",
		role: overrides.role ?? "user",
		content: overrides.content ?? "What changed?",
		timestamp: (
			overrides.timestamp ?? new Date("2026-03-29T10:00:00.000Z")
		).toISOString(),
		codeContexts: overrides.codeContexts,
		findingContexts: overrides.findingContexts,
	};
}

function buildReviewRun(overrides: Partial<ReviewRun> = {}): ReviewRun {
	return {
		id: "run-1",
		session_id: "session-1",
		engine: "codex_cli",
		mode: "native_review",
		status: "completed",
		created_at: "2026-03-29T10:00:00.000Z",
		updated_at: "2026-03-29T10:00:00.000Z",
		events: [],
		approvals: [],
		...overrides,
	};
}

function buildReviewResult(overrides: Partial<ReviewResult> = {}): ReviewResult {
	return {
		id: "result-1",
		run_id: "run-1",
		summary: "The review found one risky state transition.",
		findings: [
			{
				id: "finding-1",
				severity: "medium",
				title: "Rail state can collapse unexpectedly",
				body: "This effect resets the panel whenever the active run clears.",
				file_path: "frontend/src/pages/review/useReviewLayoutState.ts",
				new_start: 28,
			},
		],
		partial: false,
		generated_at: "2026-03-29T10:05:00.000Z",
		created_at: "2026-03-29T10:05:00.000Z",
		updated_at: "2026-03-29T10:05:00.000Z",
		...overrides,
	};
}

describe("useReviewChatSession", () => {
	const initialModelId = "gpt-5.4";

	beforeEach(() => {
		clearTestStorage();
		vi.mocked(sendReviewChatMessage).mockReset();
	});

	afterEach(() => {
		clearTestStorage();
	});

	it("loads separate conversations for session scope and history run scope", async () => {
		const sessionKey = getReviewChatStorageKey({ sessionId: "session-1" });
		const historyKey = getReviewChatStorageKey({ runId: "run-history" });
		const sessionModelKey = getReviewChatModelStorageKey({
			sessionId: "session-1",
		});
		const historyModelKey = getReviewChatModelStorageKey({ runId: "run-history" });

		localStorage.setItem(
			sessionKey!,
			JSON.stringify([buildStoredMessage({ content: "session chat" })]),
		);
		localStorage.setItem(
			historyKey!,
			JSON.stringify([buildStoredMessage({ id: "message-2", content: "history chat" })]),
		);
		localStorage.setItem(sessionModelKey!, "gpt-5.4-mini");
		localStorage.setItem(historyModelKey!, "gpt-5.3-codex");

		const { result, rerender } = renderHook(
			(props: {
				activeRun: ReviewRun | null;
				isViewingHistory: boolean;
			}) =>
				useReviewChatSession({
					sessionId: "session-1",
					activeRun: props.activeRun,
					reviewResult: null,
					isViewingHistory: props.isViewingHistory,
					initialModelId,
				}),
			{
				initialProps: {
					activeRun: buildReviewRun(),
					isViewingHistory: false,
				},
			},
		);

		await waitFor(() => {
			expect(result.current.chatMessages[0]?.content).toBe("session chat");
		});
		expect(result.current.selectedModelId).toBe("gpt-5.4-mini");

		rerender({
			activeRun: buildReviewRun({ id: "run-history", session_id: "session-1" }),
			isViewingHistory: true,
		});

		await waitFor(() => {
			expect(result.current.chatMessages[0]?.content).toBe("history chat");
		});
		expect(result.current.selectedModelId).toBe("gpt-5.3-codex");
	});

	it("defaults to the configured model and persists per-scope overrides", async () => {
		const { result, rerender } = renderHook(
			(props: {
				activeRun: ReviewRun | null;
				isViewingHistory: boolean;
			}) =>
				useReviewChatSession({
					sessionId: "session-1",
					activeRun: props.activeRun,
					reviewResult: null,
					isViewingHistory: props.isViewingHistory,
					initialModelId,
				}),
			{
				initialProps: {
					activeRun: buildReviewRun(),
					isViewingHistory: false,
				},
			},
		);

		expect(result.current.selectedModelId).toBe(initialModelId);

		act(() => {
			result.current.setSelectedModelId("gpt-5.4-mini");
		});

		await waitFor(() => {
			expect(
				localStorage.getItem(
					getReviewChatModelStorageKey({ sessionId: "session-1" })!,
				),
			).toBe("gpt-5.4-mini");
		});

		rerender({
			activeRun: buildReviewRun({ id: "run-history", session_id: "session-1" }),
			isViewingHistory: true,
		});

		await waitFor(() => {
			expect(result.current.selectedModelId).toBe(initialModelId);
		});

		act(() => {
			result.current.setSelectedModelId("gpt-5.3-codex");
		});

		await waitFor(() => {
			expect(
				localStorage.getItem(
					getReviewChatModelStorageKey({ runId: "run-history" })!,
				),
			).toBe("gpt-5.3-codex");
		});

		rerender({
			activeRun: buildReviewRun(),
			isViewingHistory: false,
		});

		await waitFor(() => {
			expect(result.current.selectedModelId).toBe("gpt-5.4-mini");
		});

		act(() => {
			result.current.setSelectedModelId(initialModelId);
		});

		await waitFor(() => {
			expect(
				localStorage.getItem(
					getReviewChatModelStorageKey({ sessionId: "session-1" })!,
				),
			).toBeNull();
		});
	});

	it("sends structured Codex review chat payloads with findings context", async () => {
		vi.mocked(sendReviewChatMessage).mockResolvedValue({
			response: "Codex says the panel should stay open for chat-only sessions.",
		});

		const storageKey = getReviewChatStorageKey({ sessionId: "session-1" });
		localStorage.setItem(
			storageKey!,
			JSON.stringify([
				buildStoredMessage({ content: "Previous user message" }),
				buildStoredMessage({
					id: "message-2",
					role: "assistant",
					content: "Previous assistant message",
				}),
			]),
		);

		const activeRun = buildReviewRun();
		const reviewResult = buildReviewResult();
		const { result } = renderHook(() =>
			useReviewChatSession({
				sessionId: "session-1",
				activeRun,
				reviewResult,
				isViewingHistory: false,
				initialModelId,
			}),
		);

		await waitFor(() => {
			expect(result.current.chatMessages).toHaveLength(2);
		});

		act(() => {
			result.current.injectSelection({
				filePath: "frontend/src/pages/Review.tsx",
				side: "modified",
				startLine: 40,
				startColumn: 1,
				endLine: 44,
				endColumn: 18,
				selectedText: "const panel = createAssistantPanel();",
				language: "typescript",
			});
		});

		expect(result.current.draftCodeContexts).toHaveLength(1);

		act(() => {
			result.current.injectFinding(reviewResult.findings[0]);
			result.current.injectFinding(reviewResult.findings[0]);
		});

		expect(result.current.draftFindingContexts).toHaveLength(1);

		act(() => {
			result.current.setDraft("What is the main regression risk here?");
		});

		await act(async () => {
			await result.current.sendDraft();
		});

		expect(vi.mocked(sendReviewChatMessage)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(sendReviewChatMessage).mock.calls[0][0]).toEqual({
			sessionId: "session-1",
			runId: null,
			modelId: initialModelId,
			message: "What is the main regression risk here?",
			codeContexts: [
				expect.objectContaining({
					filePath: "frontend/src/pages/Review.tsx",
					side: "modified",
					startLine: 40,
					endLine: 44,
					language: "typescript",
				}),
			],
			findingContexts: [expect.objectContaining(reviewResult.findings[0])],
			messages: [
				{
					role: "user",
					content: "Previous user message",
					codeContexts: undefined,
					findingContexts: undefined,
				},
				{
					role: "assistant",
					content: "Previous assistant message",
					codeContexts: undefined,
					findingContexts: undefined,
				},
			],
			reviewContext: {
				runStatus: "completed",
				summary: "The review found one risky state transition.",
				appliedInstructions: null,
				findings: reviewResult.findings,
			},
		});
		expect(result.current.chatMessages.at(-2)?.codeContexts).toHaveLength(1);
		expect(result.current.chatMessages.at(-2)?.findingContexts).toEqual([
			expect.objectContaining(reviewResult.findings[0]),
		]);
		expect(result.current.chatMessages.at(-1)?.content).toContain(
			"Codex says",
		);
	});

	it("uses the selected historical run id and findings for history-scoped chat", async () => {
		vi.mocked(sendReviewChatMessage).mockResolvedValue({
			response: "Codex is answering from the historical review.",
		});

		const historyRun = buildReviewRun({
			id: "run-history",
			session_id: "session-1",
			status: "completed",
		});
		const historyResult = buildReviewResult({
			run_id: "run-history",
			summary: "Historical summary",
			findings: [
				{
					id: "finding-history",
					severity: "high",
					title: "Historical regression",
					body: "The old run found a broken state path.",
					file_path: "src/historical.ts",
					new_start: 12,
				},
			],
		});

		const { result } = renderHook(() =>
			useReviewChatSession({
				sessionId: "session-1",
				activeRun: historyRun,
				reviewResult: historyResult,
				isViewingHistory: true,
				initialModelId,
			}),
		);

		act(() => {
			result.current.injectFinding(historyResult.findings[0]);
			result.current.setDraft("Explain the historical finding.");
		});

		await act(async () => {
			await result.current.sendDraft();
		});

		expect(vi.mocked(sendReviewChatMessage).mock.calls[0][0]).toEqual({
			sessionId: "session-1",
			runId: "run-history",
			modelId: initialModelId,
			message: "Explain the historical finding.",
			codeContexts: [],
			findingContexts: [expect.objectContaining(historyResult.findings[0])],
			messages: [],
			reviewContext: {
				runStatus: "completed",
				summary: "Historical summary",
				appliedInstructions: null,
				findings: historyResult.findings,
			},
		});
	});

	it("sends finding-only drafts without requiring freeform text", async () => {
		vi.mocked(sendReviewChatMessage).mockResolvedValue({
			response: "Codex is answering about the attached finding.",
		});

		const reviewResult = buildReviewResult();
		const { result } = renderHook(() =>
			useReviewChatSession({
				sessionId: "session-1",
				activeRun: buildReviewRun(),
				reviewResult,
				initialModelId,
			}),
		);

		act(() => {
			result.current.injectFinding(reviewResult.findings[0]);
		});

		await act(async () => {
			await result.current.sendDraft();
		});

		expect(vi.mocked(sendReviewChatMessage).mock.calls[0][0]).toEqual({
			sessionId: "session-1",
			runId: null,
			modelId: initialModelId,
			message: "",
			codeContexts: [],
			findingContexts: [expect.objectContaining(reviewResult.findings[0])],
			messages: [],
			reviewContext: {
				runStatus: "completed",
				summary: "The review found one risky state transition.",
				appliedInstructions: null,
				findings: reviewResult.findings,
			},
		});
	});

	it("falls back to the default chat model when no configured model is provided", () => {
		const { result } = renderHook(() =>
			useReviewChatSession({
				sessionId: "session-1",
			}),
		);

		expect(result.current.selectedModelId).toBe(REVIEW_CHAT_DEFAULT_MODEL_ID);
	});
});
