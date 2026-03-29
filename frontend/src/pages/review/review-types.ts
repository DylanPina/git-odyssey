import type {
	ReviewHistoryEntry,
	ReviewRun,
	ReviewSession,
} from "@/lib/definitions/review";

export type ReasoningTraceEntry = {
	id: string;
	method: string | null;
	text: string;
	stableText: string;
	latestDeltaText: string | null;
	sequence: number;
	createdAt: string | null;
};

export type ReviewPanelMode = "collapsed" | "rail" | "fullscreen";

export type PersistedReviewRefs = {
	baseRef: string;
	headRef: string;
};

export type SelectedReviewHistoryView = {
	entry: ReviewHistoryEntry;
	session: ReviewSession;
	run: ReviewRun;
};

export type ReviewHistoryOutcomeFilter = "all" | "with_findings" | "clean";
export type ReviewHistorySeverityFilter =
	| "any"
	| "has_high"
	| "has_medium"
	| "has_low";
