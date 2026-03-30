import { useCallback, useEffect, useMemo, useState } from "react";

import { sendReviewChatMessage } from "@/api/api";
import type { DiffSelectionContext } from "@/lib/diff";
import type { ChatCodeContext, ChatMessage } from "@/lib/definitions/chat";
import type {
	ReviewChatContext,
	ReviewChatTranscriptMessage,
	ReviewResult,
	ReviewRun,
} from "@/lib/definitions/review";
import { getReviewChatStorageKey } from "@/pages/review/review-storage";

const MAX_TRANSCRIPT_MESSAGES = 6;
const MAX_SELECTION_LINES = 200;
const MAX_SELECTION_CHARS = 8_000;

type UseReviewChatSessionArgs = {
	sessionId?: string | null;
	activeRun?: ReviewRun | null;
	reviewResult?: ReviewResult | null;
	isViewingHistory?: boolean;
};

type UseReviewChatSessionReturn = {
	chatMessages: ChatMessage[];
	draft: string;
	setDraft: (value: string) => void;
	draftCodeContexts: ChatCodeContext[];
	isChatLoading: boolean;
	chatError: string | null;
	isChatReady: boolean;
	sendDraft: () => Promise<void>;
	injectSelection: (selection: DiffSelectionContext) => void;
	removeDraftCodeContext: (contextId: string) => void;
	clearChatError: () => void;
};

function createChatMessageId() {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}

	return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createCodeContextId(selection: DiffSelectionContext) {
	return [
		selection.filePath,
		selection.side,
		selection.startLine,
		selection.startColumn,
		selection.endLine,
		selection.endColumn,
	].join(":");
}

function clipSelectionText(value: string) {
	const normalized = value.replace(/\r\n?/g, "\n").trim();
	const lines = normalized.split("\n");
	let wasTruncated = false;
	let clippedLines = lines;

	if (clippedLines.length > MAX_SELECTION_LINES) {
		clippedLines = clippedLines.slice(0, MAX_SELECTION_LINES);
		wasTruncated = true;
	}

	let clippedText = clippedLines.join("\n");
	if (clippedText.length > MAX_SELECTION_CHARS) {
		clippedText = `${clippedText.slice(0, MAX_SELECTION_CHARS).trimEnd()}\n…`;
		wasTruncated = true;
	}

	return {
		text: clippedText,
		wasTruncated,
	};
}

function buildCodeContextFromSelection(
	selection: DiffSelectionContext,
): ChatCodeContext {
	const clippedSelection = clipSelectionText(selection.selectedText);

	return {
		id: createCodeContextId(selection),
		filePath: selection.filePath,
		side: selection.side,
		startLine: selection.startLine,
		startColumn: selection.startColumn,
		endLine: selection.endLine,
		endColumn: selection.endColumn,
		selectedText: clippedSelection.text,
		language: selection.language,
		isTruncated: clippedSelection.wasTruncated,
	};
}

export function formatReviewChatCodeContextLabel(context: ChatCodeContext) {
	const range =
		context.startLine === context.endLine
			? `line ${context.startLine}:${context.startColumn}-${context.endColumn}`
			: `lines ${context.startLine}:${context.startColumn}-${context.endLine}:${context.endColumn}`;
	const sideLabel = context.side === "modified" ? "modified" : "original";
	return `${context.filePath} • ${sideLabel} • ${range}`;
}

function buildReviewChatContext(
	activeRun?: ReviewRun | null,
	reviewResult?: ReviewResult | null,
): ReviewChatContext | null {
	if (!activeRun && !reviewResult) {
		return null;
	}

	return {
		runStatus: activeRun?.status ?? null,
		summary: reviewResult?.summary ?? null,
		findings: reviewResult?.findings ?? [],
	};
}

function serializeTranscriptMessage(
	message: ChatMessage,
): ReviewChatTranscriptMessage {
	return {
		role: message.role,
		content: message.content,
		codeContexts: message.codeContexts,
	};
}

function loadMessagesFromStorage(storageKey: string | null): ChatMessage[] {
	if (typeof window === "undefined" || !storageKey) {
		return [];
	}

	try {
		const stored = window.localStorage.getItem(storageKey);
		if (!stored) {
			return [];
		}

		const parsed = JSON.parse(stored) as Array<
			Omit<ChatMessage, "timestamp"> & { timestamp: string }
		>;
		return parsed.map((message) => ({
			...message,
			timestamp: new Date(message.timestamp),
		}));
	} catch {
		return [];
	}
}

function persistMessagesToStorage(
	storageKey: string | null,
	messages: ChatMessage[],
) {
	if (typeof window === "undefined" || !storageKey) {
		return;
	}

	try {
		if (messages.length === 0) {
			window.localStorage.removeItem(storageKey);
			return;
		}

		window.localStorage.setItem(storageKey, JSON.stringify(messages));
	} catch {
		// Ignore storage issues and keep the in-memory state.
	}
}

export function useReviewChatSession({
	sessionId,
	activeRun,
	reviewResult,
	isViewingHistory = false,
}: UseReviewChatSessionArgs): UseReviewChatSessionReturn {
	const historyRunId = isViewingHistory ? activeRun?.id ?? null : null;
	const storageKey = useMemo(
		() =>
			getReviewChatStorageKey({
				sessionId,
				runId: historyRunId,
			}),
		[historyRunId, sessionId],
	);
	const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
	const [draft, setDraft] = useState("");
	const [draftCodeContexts, setDraftCodeContexts] = useState<ChatCodeContext[]>([]);
	const [isChatLoading, setIsChatLoading] = useState(false);
	const [chatError, setChatError] = useState<string | null>(null);
	const isChatReady = Boolean(sessionId);

	useEffect(() => {
		setChatMessages(loadMessagesFromStorage(storageKey));
		setDraft("");
		setDraftCodeContexts([]);
		setChatError(null);
	}, [storageKey]);

	useEffect(() => {
		persistMessagesToStorage(storageKey, chatMessages);
	}, [chatMessages, storageKey]);

	const clearChatError = useCallback(() => {
		setChatError(null);
	}, []);

	const injectSelection = useCallback((selection: DiffSelectionContext) => {
		const nextContext = buildCodeContextFromSelection(selection);
		setDraftCodeContexts((current) =>
			current.some((context) => context.id === nextContext.id)
				? current
				: [...current, nextContext],
		);
	}, []);

	const removeDraftCodeContext = useCallback((contextId: string) => {
		setDraftCodeContexts((current) =>
			current.filter((context) => context.id !== contextId),
		);
	}, []);

	const sendDraft = useCallback(async () => {
		const nextDraft = draft.trim();
		if (!nextDraft && draftCodeContexts.length === 0) {
			return;
		}

		if (!sessionId) {
			setChatError(
				"Review chat will be available as soon as the compare session finishes loading.",
			);
			return;
		}

		setIsChatLoading(true);
		setChatError(null);

		const nextUserMessage: ChatMessage = {
			id: createChatMessageId(),
			role: "user",
			content: nextDraft,
			timestamp: new Date(),
			codeContexts: draftCodeContexts,
		};

		setChatMessages((current) => [...current, nextUserMessage]);
		setDraft("");
		setDraftCodeContexts([]);

		try {
			const response = await sendReviewChatMessage({
				sessionId,
				runId: historyRunId,
				message: nextDraft,
				codeContexts: draftCodeContexts,
				messages: chatMessages
					.slice(-MAX_TRANSCRIPT_MESSAGES)
					.map(serializeTranscriptMessage),
				reviewContext: buildReviewChatContext(activeRun, reviewResult),
			});
			const assistantMessage: ChatMessage = {
				id: createChatMessageId(),
				role: "assistant",
				content: response.response,
				timestamp: new Date(),
			};

			setChatMessages((current) => [...current, assistantMessage]);
		} catch {
			setChatError(
				"Failed to get a response from Codex review chat. Please try again.",
			);
		} finally {
			setIsChatLoading(false);
		}
	}, [
		activeRun,
		chatMessages,
		draft,
		draftCodeContexts,
		historyRunId,
		reviewResult,
		sessionId,
	]);

	return {
		chatMessages,
		draft,
		setDraft,
		draftCodeContexts,
		isChatLoading,
		chatError,
		isChatReady,
		sendDraft,
		injectSelection,
		removeDraftCodeContext,
		clearChatError,
	};
}
