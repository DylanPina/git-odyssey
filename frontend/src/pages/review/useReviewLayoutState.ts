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
import type {
	ReviewAssistantTab,
	ReviewPanelMode,
} from "@/pages/review/review-types";

type UseReviewLayoutStateArgs = {
	assistantEnabled: boolean;
	activeRunId?: string | null;
	reviewResult: ReviewResult | null;
};

export function useReviewLayoutState({
	assistantEnabled,
	activeRunId,
	reviewResult,
}: UseReviewLayoutStateArgs) {
	const lastOpenedRunIdRef = useRef<string | null>(null);
	const wasAssistantEnabledRef = useRef(false);
	const hadReviewContentRef = useRef(Boolean(activeRunId));
	const [isPreviousReviewsOpen, setIsPreviousReviewsOpen] = useState(true);
	const [reviewPanelMode, setReviewPanelMode] =
		useState<ReviewPanelMode>("collapsed");
	const [assistantTab, setAssistantTab] = useState<ReviewAssistantTab>(() =>
		activeRunId ? "review" : "chat",
	);
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
			setAssistantTab("review");
			lastOpenedRunIdRef.current = activeRunId;
		}

		if (!activeRunId) {
			lastOpenedRunIdRef.current = null;
		}
	}, [activeRunId]);

	useEffect(() => {
		if (!assistantEnabled) {
			setReviewPanelMode("collapsed");
			wasAssistantEnabledRef.current = false;
			return;
		}

		if (!wasAssistantEnabledRef.current) {
			setReviewPanelMode((current) =>
				current === "collapsed" ? "rail" : current,
			);
			if (!activeRunId) {
				setAssistantTab("chat");
			}
		}

		wasAssistantEnabledRef.current = true;
	}, [activeRunId, assistantEnabled]);

	useEffect(() => {
		const hasReviewContent = Boolean(activeRunId);
		if (!hasReviewContent && hadReviewContentRef.current) {
			setAssistantTab((current) => (current === "review" ? "chat" : current));
		}

		hadReviewContentRef.current = hasReviewContent;
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
		isPreviousReviewsOpen,
		setIsPreviousReviewsOpen,
		reviewPanelMode,
		setReviewPanelMode,
		assistantTab,
		setAssistantTab,
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
