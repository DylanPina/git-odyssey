import type { ReviewRun } from "@/lib/definitions/review";
import type {
	ReviewHistoryOutcomeFilter,
	ReviewHistorySeverityFilter,
} from "@/pages/review/review-types";

export const DETACHED_HEAD_LABEL = "HEAD (detached)";
export const ACTIVE_RUN_STATUSES = new Set<ReviewRun["status"]>([
	"pending",
	"running",
	"awaiting_approval",
]);

export const REVIEW_SELECTED_REFS_STORAGE_KEY_PREFIX =
	"git-odyssey.review.selected_refs";
export const REVIEW_FILE_TREE_WIDTH_STORAGE_KEY =
	"git-odyssey.review.file_tree_width";
export const REVIEW_RIGHT_RAIL_WIDTH_STORAGE_KEY =
	"git-odyssey.review.right_rail_width";
export const REVIEW_FILE_TREE_WIDTH_DEFAULT = 320;
export const REVIEW_FILE_TREE_WIDTH_MIN = 240;
export const REVIEW_RIGHT_RAIL_WIDTH_DEFAULT = 384;
export const REVIEW_RIGHT_RAIL_WIDTH_MIN = 320;
export const REVIEW_DIFF_MIN_WIDTH = 512;

export const REVIEW_HISTORY_OUTCOME_OPTIONS: Array<{
	value: ReviewHistoryOutcomeFilter;
	label: string;
}> = [
	{ value: "all", label: "All reviews" },
	{ value: "with_findings", label: "With findings" },
	{ value: "clean", label: "Clean reviews" },
];

export const REVIEW_HISTORY_SEVERITY_OPTIONS: Array<{
	value: ReviewHistorySeverityFilter;
	label: string;
}> = [
	{ value: "any", label: "Any severity" },
	{ value: "has_high", label: "Has high" },
	{ value: "has_medium", label: "Has medium" },
	{ value: "has_low", label: "Has low" },
];
