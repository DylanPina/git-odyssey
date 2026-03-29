import { useCallback, useEffect, useRef, useState } from "react";

import type { ReviewResult } from "@/lib/definitions/review";
import {
	REVIEW_FILE_TREE_WIDTH_DEFAULT,
	REVIEW_FILE_TREE_WIDTH_MIN,
	REVIEW_FILE_TREE_WIDTH_STORAGE_KEY,
	REVIEW_RIGHT_RAIL_WIDTH_DEFAULT,
	REVIEW_RIGHT_RAIL_WIDTH_MIN,
	REVIEW_RIGHT_RAIL_WIDTH_STORAGE_KEY,
} from "@/pages/review/review-constants";
import {
	getStoredReviewPanelWidth,
	persistStoredPanelWidth,
} from "@/pages/review/review-storage";
import type { ReviewPanelMode } from "@/pages/review/review-types";

type UseReviewLayoutStateArgs = {
	activeRunId?: string | null;
	reviewResult: ReviewResult | null;
};

export function useReviewLayoutState({
	activeRunId,
	reviewResult,
}: UseReviewLayoutStateArgs) {
	const lastOpenedRunIdRef = useRef<string | null>(null);
	const [isReviewSetupOpen, setIsReviewSetupOpen] = useState(true);
	const [isPreviousReviewsOpen, setIsPreviousReviewsOpen] = useState(true);
	const [reviewPanelMode, setReviewPanelMode] =
		useState<ReviewPanelMode>("collapsed");
	const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
	const [fileTreePreferredWidth, setFileTreePreferredWidthState] = useState(() =>
		getStoredReviewPanelWidth(
			REVIEW_FILE_TREE_WIDTH_STORAGE_KEY,
			REVIEW_FILE_TREE_WIDTH_DEFAULT,
			REVIEW_FILE_TREE_WIDTH_MIN,
		),
	);
	const [reviewRailPreferredWidth, setReviewRailPreferredWidthState] =
		useState(() =>
			getStoredReviewPanelWidth(
				REVIEW_RIGHT_RAIL_WIDTH_STORAGE_KEY,
				REVIEW_RIGHT_RAIL_WIDTH_DEFAULT,
				REVIEW_RIGHT_RAIL_WIDTH_MIN,
			),
		);

	useEffect(() => {
		if (activeRunId && activeRunId !== lastOpenedRunIdRef.current) {
			setReviewPanelMode("rail");
			lastOpenedRunIdRef.current = activeRunId;
		}

		if (!activeRunId) {
			lastOpenedRunIdRef.current = null;
			setReviewPanelMode("collapsed");
		}
	}, [activeRunId]);

	useEffect(() => {
		if (!reviewResult) {
			setSelectedFindingId(null);
			return;
		}

		setSelectedFindingId((current) =>
			current && reviewResult.findings.some((finding) => finding.id === current)
				? current
				: null,
		);
	}, [reviewResult]);

	const setFileTreePreferredWidth = useCallback((nextWidth: number) => {
		setFileTreePreferredWidthState(
			persistStoredPanelWidth(
				REVIEW_FILE_TREE_WIDTH_STORAGE_KEY,
				nextWidth,
				REVIEW_FILE_TREE_WIDTH_MIN,
			),
		);
	}, []);

	const setReviewRailPreferredWidth = useCallback((nextWidth: number) => {
		setReviewRailPreferredWidthState(
			persistStoredPanelWidth(
				REVIEW_RIGHT_RAIL_WIDTH_STORAGE_KEY,
				nextWidth,
				REVIEW_RIGHT_RAIL_WIDTH_MIN,
			),
		);
	}, []);

	return {
		isReviewSetupOpen,
		setIsReviewSetupOpen,
		isPreviousReviewsOpen,
		setIsPreviousReviewsOpen,
		reviewPanelMode,
		setReviewPanelMode,
		selectedFindingId,
		setSelectedFindingId,
		fileTreePreferredWidth,
		setFileTreePreferredWidth,
		reviewRailPreferredWidth,
		setReviewRailPreferredWidth,
		isReviewVisible: reviewPanelMode !== "collapsed",
		isReviewRailOpen: reviewPanelMode === "rail",
		isReviewFullscreen: reviewPanelMode === "fullscreen",
	};
}
