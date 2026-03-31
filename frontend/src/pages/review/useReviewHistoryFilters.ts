import { useCallback, useDeferredValue, useMemo, useState } from "react";

import type { ReviewHistoryEntry } from "@/lib/definitions/review";
import {
	buildReviewHistorySearchText,
	endOfLocalDay,
	startOfLocalDay,
} from "@/pages/review/review-formatters";
import type {
	ReviewHistoryOutcomeFilter,
	ReviewHistorySeverityFilter,
} from "@/pages/review/review-types";

export type UseReviewHistoryFiltersResult = {
	historySearchQuery: string;
	setHistorySearchQuery: React.Dispatch<React.SetStateAction<string>>;
	historyOutcomeFilter: ReviewHistoryOutcomeFilter;
	setHistoryOutcomeFilter: React.Dispatch<
		React.SetStateAction<ReviewHistoryOutcomeFilter>
	>;
	historySeverityFilter: ReviewHistorySeverityFilter;
	setHistorySeverityFilter: React.Dispatch<
		React.SetStateAction<ReviewHistorySeverityFilter>
	>;
	historyStartDate: Date | undefined;
	setHistoryStartDate: React.Dispatch<React.SetStateAction<Date | undefined>>;
	historyEndDate: Date | undefined;
	setHistoryEndDate: React.Dispatch<React.SetStateAction<Date | undefined>>;
	filteredReviewHistory: ReviewHistoryEntry[];
	hasActiveHistoryFilters: boolean;
	resetHistoryFilters: () => void;
};

export function useReviewHistoryFilters(
	reviewHistory: ReviewHistoryEntry[],
): UseReviewHistoryFiltersResult {
	const [historySearchQuery, setHistorySearchQuery] = useState("");
	const deferredHistorySearchQuery = useDeferredValue(historySearchQuery);
	const [historyOutcomeFilter, setHistoryOutcomeFilter] =
		useState<ReviewHistoryOutcomeFilter>("all");
	const [historySeverityFilter, setHistorySeverityFilter] =
		useState<ReviewHistorySeverityFilter>("any");
	const [historyStartDate, setHistoryStartDate] = useState<Date | undefined>(
		undefined,
	);
	const [historyEndDate, setHistoryEndDate] = useState<Date | undefined>(
		undefined,
	);

	const filteredReviewHistory = useMemo(() => {
		const normalizedQuery = deferredHistorySearchQuery.trim().toLowerCase();
		const startBoundary = historyStartDate ? startOfLocalDay(historyStartDate) : null;
		const endBoundary = historyEndDate ? endOfLocalDay(historyEndDate) : null;

		return reviewHistory.filter((entry) => {
			if (
				historyOutcomeFilter === "with_findings" &&
				entry.findings_count === 0
			) {
				return false;
			}

			if (historyOutcomeFilter === "clean" && entry.findings_count > 0) {
				return false;
			}

			if (
				historySeverityFilter === "has_high" &&
				entry.severity_counts.high === 0
			) {
				return false;
			}

			if (
				historySeverityFilter === "has_medium" &&
				entry.severity_counts.medium === 0
			) {
				return false;
			}

			if (
				historySeverityFilter === "has_low" &&
				entry.severity_counts.low === 0
			) {
				return false;
			}

			const generatedAt = new Date(entry.generated_at).getTime();
			if (
				startBoundary != null &&
				!Number.isNaN(generatedAt) &&
				generatedAt < startBoundary
			) {
				return false;
			}

			if (
				endBoundary != null &&
				!Number.isNaN(generatedAt) &&
				generatedAt > endBoundary
			) {
				return false;
			}

			if (!normalizedQuery) {
				return true;
			}

			return buildReviewHistorySearchText(entry).includes(normalizedQuery);
		});
	}, [
		deferredHistorySearchQuery,
		historyEndDate,
		historyOutcomeFilter,
		historySeverityFilter,
		historyStartDate,
		reviewHistory,
	]);

	const hasActiveHistoryFilters =
		Boolean(historySearchQuery.trim()) ||
		historyOutcomeFilter !== "all" ||
		historySeverityFilter !== "any" ||
		Boolean(historyStartDate) ||
		Boolean(historyEndDate);

	const resetHistoryFilters = useCallback(() => {
		setHistorySearchQuery("");
		setHistoryOutcomeFilter("all");
		setHistorySeverityFilter("any");
		setHistoryStartDate(undefined);
		setHistoryEndDate(undefined);
	}, []);

	return useMemo(
		() => ({
			historySearchQuery,
			setHistorySearchQuery,
			historyOutcomeFilter,
			setHistoryOutcomeFilter,
			historySeverityFilter,
			setHistorySeverityFilter,
			historyStartDate,
			setHistoryStartDate,
			historyEndDate,
			setHistoryEndDate,
			filteredReviewHistory,
			hasActiveHistoryFilters,
			resetHistoryFilters,
		}),
		[
			filteredReviewHistory,
			hasActiveHistoryFilters,
			historyEndDate,
			historyOutcomeFilter,
			historySearchQuery,
			historySeverityFilter,
			historyStartDate,
			resetHistoryFilters,
		],
	);
}
