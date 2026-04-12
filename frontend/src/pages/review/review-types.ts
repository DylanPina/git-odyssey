import type { DiffSearchContext } from "@/lib/diff";
import type {
	ReviewHistoryEntry,
	ReviewRunStatus,
	ReviewRun,
	ReviewSessionStatus,
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
export type ReviewAssistantTab = "review" | "chat";

export type PersistedReviewRefs = {
	baseRef: string;
	headRef: string;
};

export type ReviewTabTarget =
	| {
			mode: "compare";
			baseRef: string;
			headRef: string;
	  }
	| {
			mode: "commit";
			commitSha: string;
			searchContext?: DiffSearchContext | null;
	  };

export type ReviewTab = {
	id: string;
	target: ReviewTabTarget;
	sessionId: string | null;
	sessionStatus: ReviewSessionStatus | null;
	sessionBaseHeadSha: string | null;
	sessionHeadHeadSha: string | null;
	latestRunId: string | null;
	latestRunStatus: ReviewRunStatus | null;
	latestSummary: string | null;
	latestFindingsCount: number | null;
	createdAt: string;
	updatedAt: string;
};

export type PersistedReviewTabsState = {
	version: number;
	activeTabId: string | null;
	tabs: ReviewTab[];
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
