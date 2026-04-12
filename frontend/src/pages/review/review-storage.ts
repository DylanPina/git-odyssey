import type { PersistedReviewRefs } from "@/pages/review/review-types";
import {
	REVIEW_ADDITIONAL_GUIDELINES_STORAGE_KEY_PREFIX,
	REVIEW_CHAT_STORAGE_KEY_PREFIX,
	REVIEW_SELECTED_REFS_STORAGE_KEY_PREFIX,
} from "@/pages/review/review-constants";
import { getRepoStableKey, normalizeRepoPath } from "@/lib/repoPaths";

export type PersistedAdditionalReviewGuideline = {
	id: string;
	text: string;
};

export type PersistedAdditionalReviewGuidelineState = {
	draftGuideline: string;
	guidelines: PersistedAdditionalReviewGuideline[];
};

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

export function getAdditionalReviewGuidelinesStorageKey(
	scopeKey?: string | null,
) {
	const normalizedScopeKey = String(scopeKey || "").trim();
	return normalizedScopeKey
			? `${REVIEW_ADDITIONAL_GUIDELINES_STORAGE_KEY_PREFIX}:${encodeURIComponent(normalizedScopeKey)}`
			: null;
}

export function getLegacyAdditionalReviewGuidelinesStorageKeys(
	repoPath?: string | null,
) {
	if (!repoPath) {
		return [];
	}

	const normalizedRepoPath = normalizeRepoPath(repoPath);
	const repoScopedKey =
		getAdditionalReviewGuidelinesStorageKey(normalizedRepoPath);
	const compareScopedKey = getAdditionalReviewGuidelinesStorageKey(
		`${normalizedRepoPath}:compare`,
	);
	const commitScopedKey = getAdditionalReviewGuidelinesStorageKey(
		`${normalizedRepoPath}:commit`,
	);

	return Array.from(
		new Set(
			[repoScopedKey, compareScopedKey, commitScopedKey].filter(
				(key): key is string => Boolean(key),
			),
		),
	);
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

export function getStoredAdditionalReviewGuidelines(
	storageKey: string | null,
): PersistedAdditionalReviewGuidelineState {
	if (typeof window === "undefined" || !storageKey) {
		return {
			draftGuideline: "",
			guidelines: [],
		};
	}

	try {
		const storedGuidelines = window.localStorage.getItem(storageKey);
		if (!storedGuidelines) {
			return {
				draftGuideline: "",
				guidelines: [],
			};
		}

		const parsed = JSON.parse(storedGuidelines);

		// Backward compatibility: older payloads stored only the submitted guidelines array.
		if (Array.isArray(parsed)) {
			return {
				draftGuideline: "",
				guidelines: parsed.flatMap((item, index) => {
					if (!item || typeof item !== "object" || Array.isArray(item)) {
						return [];
					}

					const id =
						typeof item.id === "string" && item.id.trim()
							? item.id.trim()
							: `guideline-${index + 1}`;
					const text = typeof item.text === "string" ? item.text.trim() : "";

					return text ? [{ id, text }] : [];
				}),
			};
		}

		if (!parsed || typeof parsed !== "object") {
			return {
				draftGuideline: "",
				guidelines: [],
			};
		}

		const draftGuideline =
			typeof parsed.draftGuideline === "string"
				? parsed.draftGuideline
				: "";
		const guidelines = Array.isArray(parsed.guidelines) ? parsed.guidelines : [];

		return {
			draftGuideline,
			guidelines: guidelines.flatMap((item: unknown, index: number) => {
				if (!item || typeof item !== "object" || Array.isArray(item)) {
					return [];
				}

				const guideline = item as { id?: unknown; text?: unknown };

				const id =
					typeof guideline.id === "string" && guideline.id.trim()
						? guideline.id.trim()
						: `guideline-${index + 1}`;
				const text =
					typeof guideline.text === "string" ? guideline.text.trim() : "";

				return text ? [{ id, text }] : [];
			}),
		};
	} catch {
		return {
			draftGuideline: "",
			guidelines: [],
		};
	}
}

export function persistStoredAdditionalReviewGuidelines(
	storageKey: string | null,
	state: PersistedAdditionalReviewGuidelineState,
) {
	if (typeof window === "undefined" || !storageKey) {
		return;
	}

	try {
		const draftGuideline = state.draftGuideline.trimEnd();
		const guidelines = state.guidelines.flatMap((item, index) => {
			if (!item || typeof item !== "object" || Array.isArray(item)) {
				return [];
			}

			const id =
				typeof item.id === "string" && item.id.trim()
					? item.id.trim()
					: `guideline-${index + 1}`;
			const text = typeof item.text === "string" ? item.text.trim() : "";

			return text ? [{ id, text }] : [];
		});

		if (!draftGuideline && !guidelines.length) {
			window.localStorage.removeItem(storageKey);
			return;
		}

		window.localStorage.setItem(
			storageKey,
			JSON.stringify({
				draftGuideline,
				guidelines,
			}),
		);
	} catch {
		// Ignore storage issues and keep the in-memory state.
	}
}

export function getLegacyStoredAdditionalReviewGuidelinesForRepo(
	repoPath?: string | null,
): PersistedAdditionalReviewGuidelineState {
	const storageKeys = getLegacyAdditionalReviewGuidelinesStorageKeys(repoPath);
	for (const storageKey of storageKeys) {
		const state = getStoredAdditionalReviewGuidelines(storageKey);
		if (state.draftGuideline.trimEnd() || state.guidelines.length > 0) {
			return state;
		}
	}

	return {
		draftGuideline: "",
		guidelines: [],
	};
}

export function clearLegacyStoredAdditionalReviewGuidelinesForRepo(
	repoPath?: string | null,
) {
	if (typeof window === "undefined") {
		return;
	}

	for (const storageKey of getLegacyAdditionalReviewGuidelinesStorageKeys(repoPath)) {
		try {
			window.localStorage.removeItem(storageKey);
		} catch {
			// Ignore storage issues and keep the migration best-effort.
		}
	}
}
