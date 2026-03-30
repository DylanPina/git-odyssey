import type { PersistedReviewRefs } from "@/pages/review/review-types";
import {
	REVIEW_CHAT_STORAGE_KEY_PREFIX,
	REVIEW_SELECTED_REFS_STORAGE_KEY_PREFIX,
} from "@/pages/review/review-constants";
import { getRepoStableKey } from "@/lib/repoPaths";

export function clampPanelWidth(width: number, minWidth: number) {
	return Math.max(minWidth, width);
}

export function getReviewRefsStorageKey(repoPath?: string | null) {
	return repoPath
		? `${REVIEW_SELECTED_REFS_STORAGE_KEY_PREFIX}:${getRepoStableKey(repoPath)}`
		: null;
}

export function getReviewChatStorageKey(
	input: {
		sessionId?: string | null;
		runId?: string | null;
	} = {},
) {
	const runId = String(input.runId || "").trim();
	if (runId) {
		return `${REVIEW_CHAT_STORAGE_KEY_PREFIX}:run:${encodeURIComponent(runId)}`;
	}

	const sessionId = String(input.sessionId || "").trim();
	return sessionId
		? `${REVIEW_CHAT_STORAGE_KEY_PREFIX}:session:${encodeURIComponent(sessionId)}`
		: null;
}

export function getStoredReviewPanelWidth(
	storageKey: string,
	defaultWidth: number,
	minWidth: number,
) {
	const fallbackWidth = clampPanelWidth(defaultWidth, minWidth);
	if (typeof window === "undefined") {
		return fallbackWidth;
	}

	try {
		const storedWidth = window.localStorage.getItem(storageKey);
		if (storedWidth === null) {
			return fallbackWidth;
		}

		const parsedWidth = Number.parseFloat(storedWidth);
		if (Number.isNaN(parsedWidth)) {
			return fallbackWidth;
		}

		return clampPanelWidth(parsedWidth, minWidth);
	} catch {
		return fallbackWidth;
	}
}

export function persistStoredPanelWidth(
	storageKey: string,
	nextWidth: number,
	minWidth: number,
) {
	const clampedWidth = clampPanelWidth(nextWidth, minWidth);
	if (typeof window === "undefined") {
		return clampedWidth;
	}

	try {
		window.localStorage.setItem(storageKey, String(clampedWidth));
	} catch {
		// Ignore storage issues and keep the in-memory state.
	}

	return clampedWidth;
}

export function getStoredReviewRefs(storageKey: string | null): PersistedReviewRefs | null {
	if (typeof window === "undefined" || !storageKey) {
		return null;
	}

	try {
		const storedRefs = window.localStorage.getItem(storageKey);
		if (!storedRefs) {
			return null;
		}

		const parsed = JSON.parse(storedRefs);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return null;
		}

		const baseRef = typeof parsed.baseRef === "string" ? parsed.baseRef : "";
		const headRef = typeof parsed.headRef === "string" ? parsed.headRef : "";

		return baseRef || headRef ? { baseRef, headRef } : null;
	} catch {
		return null;
	}
}

export function persistStoredReviewRefs(
	storageKey: string | null,
	{ baseRef, headRef }: PersistedReviewRefs,
) {
	if (typeof window === "undefined" || !storageKey) {
		return;
	}

	try {
		if (!baseRef && !headRef) {
			window.localStorage.removeItem(storageKey);
			return;
		}

		window.localStorage.setItem(
			storageKey,
			JSON.stringify({ baseRef, headRef }),
		);
	} catch {
		// Ignore storage issues and keep the in-memory state.
	}
}
