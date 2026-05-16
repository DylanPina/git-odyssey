import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendReviewChatMessage } from "@/api/api";
import type { ChatMessage } from "@/lib/definitions/chat";
import type { GoogleAITarget } from "@/lib/definitions/desktop";
import type { ReviewResult, ReviewRun } from "@/lib/definitions/review";
import { getReviewChatStorageKey, getReviewChatTargetStorageKey } from "@/pages/review/review-storage";
import { useReviewChatSession } from "@/pages/review/useReviewChatSession";

vi.mock("@/api/api", () => ({
	sendReviewChatMessage: vi.fn(),
}));

const configuredTarget: GoogleAITarget = {
	target_kind: "managed_model",
	resource_name: "publishers/google/models/gemini-2.5-flash",
	display_name: "Gemini 2.5 Flash",
	publisher: "google",
	version: "2.5",
	location: "us-central1",
	capabilities: ["text_generation", "review"],
	adapter_family: "gemini",
	embedding_output_dimension: null,
	source: "managed_api_model",
};

const endpointTarget: GoogleAITarget = {
	target_kind: "vertex_endpoint",
	resource_name: "projects/git-odyssey-test/locations/us-central1/endpoints/123",
	display_name: "Review endpoint",
	publisher: "google",
	version: null,
	location: "us-central1",
	capabilities: ["review"],
	adapter_family: "vertex_predict_text",
	embedding_output_dimension: null,
	source: "vertex_endpoint",
};

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
		engine: "vertex_review",
		mode: "non_agentic_review",
		status: "completed",
		applied_instructions: null,
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
	beforeEach(() => {
		clearTestStorage();
		vi.mocked(sendReviewChatMessage).mockReset();
	});

	afterEach(() => {
		clearTestStorage();
	});

	it("loads separate conversations and target overrides for session and history scopes", async () => {
		const sessionKey = getReviewChatStorageKey({ sessionId: "session-1" });
		const historyKey = getReviewChatStorageKey({ runId: "run-history" });
		const sessionTargetKey = getReviewChatTargetStorageKey({
			sessionId: "session-1",
		});
		const historyTargetKey = getReviewChatTargetStorageKey({ runId: "run-history" });

		localStorage.setItem(
			sessionKey!,
			JSON.stringify([buildStoredMessage({ content: "session chat" })]),
		);
		localStorage.setItem(
			historyKey!,
			JSON.stringify([
				buildStoredMessage({ id: "message-2", content: "history chat" }),
			]),
		);
		localStorage.setItem(sessionTargetKey!, JSON.stringify(endpointTarget));
		localStorage.setItem(historyTargetKey!, JSON.stringify(configuredTarget));

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
					initialTarget: configuredTarget,
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
		expect(result.current.selectedTarget).toEqual(endpointTarget);

		rerender({
			activeRun: buildReviewRun({ id: "run-history", session_id: "session-1" }),
			isViewingHistory: true,
		});

		await waitFor(() => {
			expect(result.current.chatMessages[0]?.content).toBe("history chat");
		});
		expect(result.current.selectedTarget).toEqual(configuredTarget);
	});

	it("defaults to the configured target and persists per-scope target overrides", async () => {
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
					initialTarget: configuredTarget,
				}),
			{
				initialProps: {
					activeRun: buildReviewRun(),
					isViewingHistory: false,
				},
			},
		);

		expect(result.current.selectedTarget).toEqual(configuredTarget);

		act(() => {
			result.current.setSelectedTarget(endpointTarget);
		});

		await waitFor(() => {
			expect(
				JSON.parse(
					localStorage.getItem(
						getReviewChatTargetStorageKey({ sessionId: "session-1" })!,
					) ?? "null",
				),
			).toEqual(endpointTarget);
		});

		rerender({
			activeRun: buildReviewRun({ id: "run-history", session_id: "session-1" }),
			isViewingHistory: true,
		});

		await waitFor(() => {
			expect(result.current.selectedTarget).toEqual(configuredTarget);
		});

		act(() => {
			result.current.setSelectedTarget(endpointTarget);
		});

		await waitFor(() => {
			expect(
				JSON.parse(
					localStorage.getItem(
						getReviewChatTargetStorageKey({ runId: "run-history" })!,
					) ?? "null",
				),
			).toEqual(endpointTarget);
		});

		rerender({
			activeRun: buildReviewRun(),
			isViewingHistory: false,
		});

		await waitFor(() => {
			expect(result.current.selectedTarget).toEqual(endpointTarget);
		});

		act(() => {
			result.current.setSelectedTarget(configuredTarget);
		});

		await waitFor(() => {
			expect(
				localStorage.getItem(
					getReviewChatTargetStorageKey({ sessionId: "session-1" })!,
				),
			).toBeNull();
		});
	});

	it("sends structured Google AI review chat payloads with target and findings context", async () => {
		vi.mocked(sendReviewChatMessage).mockResolvedValue({
			response: "The panel should stay open for chat-only sessions.",
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

		const activeRun = buildReviewRun({
			applied_instructions: "Prefer actionable findings.",
		});
		const reviewResult = buildReviewResult();
		const { result } = renderHook(() =>
			useReviewChatSession({
				sessionId: "session-1",
				activeRun,
				reviewResult,
				isViewingHistory: false,
				initialTarget: configuredTarget,
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
			result.current.injectFinding(reviewResult.findings[0]);
			result.current.injectFinding(reviewResult.findings[0]);
			result.current.setDraft("What is the main regression risk here?");
		});

		await act(async () => {
			await result.current.sendDraft();
		});

		expect(vi.mocked(sendReviewChatMessage)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(sendReviewChatMessage).mock.calls[0][0]).toEqual({
			sessionId: "session-1",
			runId: null,
			targetOverride: configuredTarget,
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
				appliedInstructions: "Prefer actionable findings.",
				findings: reviewResult.findings,
			},
		});
		expect(result.current.chatMessages.at(-2)?.codeContexts).toHaveLength(1);
		expect(result.current.chatMessages.at(-2)?.findingContexts).toEqual([
			expect.objectContaining(reviewResult.findings[0]),
		]);
		expect(result.current.chatMessages.at(-1)?.content).toContain(
			"panel should stay open",
		);
	});

	it("uses the selected historical run id and findings for history-scoped chat", async () => {
		vi.mocked(sendReviewChatMessage).mockResolvedValue({
			response: "Answering from the historical review.",
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
				initialTarget: configuredTarget,
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
			targetOverride: configuredTarget,
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
			response: "Answering about the attached finding.",
		});

		const reviewResult = buildReviewResult();
		const { result } = renderHook(() =>
			useReviewChatSession({
				sessionId: "session-1",
				activeRun: buildReviewRun(),
				reviewResult,
				initialTarget: configuredTarget,
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
			targetOverride: configuredTarget,
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
});
