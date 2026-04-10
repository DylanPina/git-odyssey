import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
	cancelReviewRun,
	createReviewSession,
	getDesktopRepoSettings,
	getReviewHistory,
	getReviewRun,
	getReviewSession,
	onReviewRuntimeEvent,
	respondReviewApproval,
	startReviewRun,
} from "@/api/api";
import type {
	ReviewApproval,
	ReviewApprovalDecision,
	ReviewHistoryEntry,
	ReviewResult,
	ReviewRun,
	ReviewRuntimeEvent,
	ReviewSession,
} from "@/lib/definitions/review";
import { ACTIVE_RUN_STATUSES } from "@/pages/review/review-constants";
import {
	getErrorMessage,
} from "@/pages/review/review-formatters";
import { extractReasoningTraces } from "@/pages/review/review-reasoning";
import type { SelectedReviewHistoryView } from "@/pages/review/review-types";

type UseReviewRunControllerArgs = {
	repoPath?: string | null;
	targetMode: "compare" | "commit";
	baseRef?: string;
	headRef?: string;
	commitSha?: string | null;
	sessionId?: string | null;
};

function sessionMatchesTarget(
	session: ReviewSession,
	input: {
		targetMode: "compare" | "commit";
		baseRef: string;
		headRef: string;
		commitSha: string | null;
	},
) {
	if (session.target_mode !== input.targetMode) {
		return false;
	}

	if (input.targetMode === "commit") {
		return session.commit_sha === input.commitSha;
	}

	return session.base_ref === input.baseRef && session.head_ref === input.headRef;
}

export function useReviewRunController({
	repoPath,
	targetMode,
	baseRef = "",
	headRef = "",
	commitSha = null,
	sessionId = null,
}: UseReviewRunControllerArgs) {
	const sessionRequestIdRef = useRef(0);
	const historyRequestIdRef = useRef(0);
	const historySelectionRequestIdRef = useRef(0);
	const refreshTimerRef = useRef<number | null>(null);
	const lastHistorySyncRunKeyRef = useRef<string | null>(null);

	const [session, setSession] = useState<ReviewSession | null>(null);
	const [reviewHistory, setReviewHistory] = useState<ReviewHistoryEntry[]>([]);
	const [sessionError, setSessionError] = useState<string | null>(null);
	const [historyError, setHistoryError] = useState<string | null>(null);
	const [runError, setRunError] = useState<string | null>(null);
	const [isSessionLoading, setIsSessionLoading] = useState(false);
	const [isHistoryLoading, setIsHistoryLoading] = useState(false);
	const [isRunStarting, setIsRunStarting] = useState(false);
	const [isRunCancelling, setIsRunCancelling] = useState(false);
	const [runDetail, setRunDetail] = useState<ReviewRun | null>(null);
	const [selectedHistoryView, setSelectedHistoryView] =
		useState<SelectedReviewHistoryView | null>(null);
	const [historySelectionLoadingRunId, setHistorySelectionLoadingRunId] =
		useState<string | null>(null);
	const [historySelectionError, setHistorySelectionError] = useState<string | null>(
		null,
	);
	const [approvalLoadingById, setApprovalLoadingById] = useState<
		Record<string, boolean>
	>({});

	useEffect(() => {
		setSession(null);
		setRunDetail(null);
		setReviewHistory([]);
		setSelectedHistoryView(null);
		setHistorySelectionLoadingRunId(null);
		setSessionError(null);
		setHistoryError(null);
		setHistorySelectionError(null);
		setRunError(null);
		setApprovalLoadingById({});
		historySelectionRequestIdRef.current += 1;
		lastHistorySyncRunKeyRef.current = null;
	}, [baseRef, commitSha, headRef, repoPath, sessionId, targetMode]);

	const refreshSessionState = useCallback(
		async (sessionId: string, preferredRunId?: string | null) => {
			const nextSession = await getReviewSession(sessionId);
			setSession(nextSession);
			setSessionError(null);

			const nextRunId = preferredRunId || nextSession.runs[0]?.id || null;
			if (!nextRunId) {
				setRunDetail(null);
				return;
			}

			const nextRun = await getReviewRun({
				sessionId,
				runId: nextRunId,
			});
			setRunDetail(nextRun);
			setRunError(null);
		},
		[],
	);

	const loadReviewHistory = useCallback(
		async ({
			targetMode: nextTargetMode = targetMode,
			baseRef: nextBaseRef = baseRef,
			headRef: nextHeadRef = headRef,
			commitSha: nextCommitSha = commitSha,
		}: {
			targetMode?: "compare" | "commit";
			baseRef?: string;
			headRef?: string;
			commitSha?: string | null;
		} = {}) => {
			if (!repoPath) {
				setHistoryError("No Git project path was provided.");
				setReviewHistory([]);
				return;
			}

			if (
				(nextTargetMode === "compare" && (!nextBaseRef || !nextHeadRef)) ||
				(nextTargetMode === "commit" && !nextCommitSha)
			) {
				setReviewHistory([]);
				setHistoryError(null);
				return;
			}

			const requestId = ++historyRequestIdRef.current;
			setIsHistoryLoading(true);
			setHistoryError(null);

			try {
				const nextHistory = await getReviewHistory({
					repoPath,
					targetMode: nextTargetMode,
					baseRef: nextTargetMode === "compare" ? nextBaseRef : undefined,
					headRef: nextTargetMode === "compare" ? nextHeadRef : undefined,
					commitSha: nextTargetMode === "commit" ? nextCommitSha : undefined,
				});
				if (historyRequestIdRef.current !== requestId) {
					return;
				}

				setReviewHistory(nextHistory.items);
			} catch (error) {
				if (historyRequestIdRef.current !== requestId) {
					return;
				}

				setReviewHistory([]);
				setHistoryError(getErrorMessage(error));
			} finally {
				if (historyRequestIdRef.current === requestId) {
					setIsHistoryLoading(false);
				}
			}
		},
		[baseRef, commitSha, headRef, repoPath, targetMode],
	);

	const loadSession = useCallback(
		async ({
			targetMode: nextTargetMode = targetMode,
			baseRef: nextBaseRef = baseRef,
			headRef: nextHeadRef = headRef,
			commitSha: nextCommitSha = commitSha,
			sessionId: nextSessionId = sessionId,
		}: {
			targetMode?: "compare" | "commit";
			baseRef?: string;
			headRef?: string;
			commitSha?: string | null;
			sessionId?: string | null;
		} = {}): Promise<ReviewSession | null> => {
			if (!repoPath) {
				setSessionError("No Git project path was provided.");
				return null;
			}

			if (
				(nextTargetMode === "compare" && (!nextBaseRef || !nextHeadRef)) ||
				(nextTargetMode === "commit" && !nextCommitSha)
			) {
				return null;
			}

			const requestId = ++sessionRequestIdRef.current;
			setIsSessionLoading(true);
			setSessionError(null);
			setRunError(null);

			try {
				let boundSession: ReviewSession | null = null;
				if (nextSessionId) {
					try {
						boundSession = await getReviewSession(nextSessionId);
					} catch {
						boundSession = null;
					}
				}

				const canReuseBoundSession = Boolean(
					boundSession &&
						sessionMatchesTarget(boundSession, {
							targetMode: nextTargetMode,
							baseRef: nextBaseRef,
							headRef: nextHeadRef,
							commitSha: nextCommitSha,
						}) &&
						(nextTargetMode === "commit" ||
							Boolean(
								boundSession.runs[0]?.status &&
									ACTIVE_RUN_STATUSES.has(boundSession.runs[0].status),
							)),
				);
				const nextSession: ReviewSession =
					canReuseBoundSession && boundSession
						? boundSession
					: await (async () => {
							const repoSettings = await getDesktopRepoSettings(repoPath);
							return createReviewSession({
								repoPath,
								targetMode: nextTargetMode,
								baseRef:
									nextTargetMode === "compare" ? nextBaseRef : undefined,
								headRef:
									nextTargetMode === "compare" ? nextHeadRef : undefined,
								commitSha:
									nextTargetMode === "commit" ? nextCommitSha : undefined,
								contextLines: repoSettings.contextLines,
							});
						  })();
				if (sessionRequestIdRef.current !== requestId) {
					return null;
				}
				setSession(nextSession);
				const nextRunId = nextSession.runs[0]?.id ?? null;
				if (!nextRunId) {
					setRunDetail(null);
					return nextSession;
				}

				try {
					const nextRun = await getReviewRun({
						sessionId: nextSession.id,
						runId: nextRunId,
					});
					if (sessionRequestIdRef.current !== requestId) {
						return null;
					}
					setRunDetail(nextRun);
					setRunError(null);
				} catch (error) {
					if (sessionRequestIdRef.current !== requestId) {
						return null;
					}
					setRunDetail(nextSession.runs[0] ?? null);
					setRunError(getErrorMessage(error));
				}

				return nextSession;
			} catch (error) {
				if (sessionRequestIdRef.current !== requestId) {
					return null;
				}
				setSession(null);
				setRunDetail(null);
				setSessionError(getErrorMessage(error));
				return null;
			} finally {
				if (sessionRequestIdRef.current === requestId) {
					setIsSessionLoading(false);
				}
			}
		},
		[baseRef, commitSha, headRef, repoPath, sessionId, targetMode],
	);

	useEffect(() => {
		if (
			!repoPath ||
			(targetMode === "compare" && (!baseRef || !headRef)) ||
			(targetMode === "commit" && !commitSha)
		) {
			sessionRequestIdRef.current += 1;
			setIsSessionLoading(false);
			return;
		}

		void loadSession({ targetMode, baseRef, headRef, commitSha, sessionId });
	}, [baseRef, commitSha, headRef, loadSession, repoPath, sessionId, targetMode]);

	useEffect(() => {
		if (
			!repoPath ||
			(targetMode === "compare" && (!baseRef || !headRef)) ||
			(targetMode === "commit" && !commitSha)
		) {
			historyRequestIdRef.current += 1;
			setReviewHistory([]);
			setIsHistoryLoading(false);
			setHistoryError(null);
			return;
		}

		void loadReviewHistory({ targetMode, baseRef, headRef, commitSha });
	}, [baseRef, commitSha, headRef, loadReviewHistory, repoPath, targetMode]);

	useEffect(() => {
		if (!session?.id) {
			return;
		}

		const unsubscribe = onReviewRuntimeEvent((event: ReviewRuntimeEvent) => {
			if (event.type !== "review-runtime-changed") {
				return;
			}

			if (event.sessionId !== session.id) {
				return;
			}

			if (refreshTimerRef.current != null) {
				window.clearTimeout(refreshTimerRef.current);
			}

			refreshTimerRef.current = window.setTimeout(() => {
				void refreshSessionState(session.id, event.runId ?? null).catch((error) => {
					setRunError(getErrorMessage(error));
				});
			}, 180);
		});

		return () => {
			unsubscribe();
			if (refreshTimerRef.current != null) {
				window.clearTimeout(refreshTimerRef.current);
				refreshTimerRef.current = null;
			}
		};
	}, [refreshSessionState, session?.id]);

	const currentRunSummary = session?.runs[0] ?? null;
	const currentActiveRun =
		runDetail?.id === currentRunSummary?.id ? runDetail : runDetail ?? currentRunSummary;
	const isViewingHistory = selectedHistoryView !== null;
	const displayedSession = selectedHistoryView?.session ?? session;
	const activeRun = selectedHistoryView?.run ?? currentActiveRun;
	const reviewResult: ReviewResult | null = activeRun?.result ?? null;
	const pendingApprovals = useMemo(
		() =>
			(activeRun?.approvals ?? []).filter(
				(approval) => approval.status === "pending",
			),
		[activeRun?.approvals],
	);
	const reasoningTrace = useMemo(
		() => extractReasoningTraces(activeRun?.events ?? []),
		[activeRun?.events],
	);

	useEffect(() => {
		if (
			!repoPath ||
			(targetMode === "compare" && (!baseRef || !headRef)) ||
			(targetMode === "commit" && !commitSha)
		) {
			lastHistorySyncRunKeyRef.current = null;
			return;
		}

		if (
			!currentActiveRun?.id ||
			currentActiveRun.status !== "completed" ||
			!currentActiveRun.completed_at
		) {
			return;
		}

		const syncKey = `${currentActiveRun.id}:${currentActiveRun.completed_at}`;
		if (lastHistorySyncRunKeyRef.current === syncKey) {
			return;
		}

		lastHistorySyncRunKeyRef.current = syncKey;
		void loadReviewHistory({ targetMode, baseRef, headRef, commitSha });
	}, [
		baseRef,
		commitSha,
		headRef,
		currentActiveRun?.completed_at,
		currentActiveRun?.id,
		currentActiveRun?.status,
		loadReviewHistory,
		repoPath,
		targetMode,
	]);

	const clearHistorySelection = useCallback(() => {
		historySelectionRequestIdRef.current += 1;
		setSelectedHistoryView(null);
		setHistorySelectionLoadingRunId(null);
		setHistorySelectionError(null);
	}, []);

	const selectHistoryReview = useCallback(
		async (entry: ReviewHistoryEntry) => {
			if (
				entry.run_id === currentActiveRun?.id &&
				entry.session_id === session?.id
			) {
				clearHistorySelection();
				return "latest" as const;
			}

			if (
				selectedHistoryView?.entry.run_id === entry.run_id &&
				!historySelectionLoadingRunId
			) {
				return "already_selected" as const;
			}

			const requestId = ++historySelectionRequestIdRef.current;
			setHistorySelectionLoadingRunId(entry.run_id);
			setHistorySelectionError(null);

			try {
				const [nextSession, nextRun] = await Promise.all([
					getReviewSession(entry.session_id),
					getReviewRun({
						sessionId: entry.session_id,
						runId: entry.run_id,
					}),
				]);
				if (historySelectionRequestIdRef.current !== requestId) {
					return "stale" as const;
				}

				setSelectedHistoryView({
					entry,
					session: nextSession,
					run: nextRun,
				});
				return "selected" as const;
			} catch (error) {
				if (historySelectionRequestIdRef.current !== requestId) {
					return "stale" as const;
				}

				setHistorySelectionError(getErrorMessage(error));
				return "error" as const;
			} finally {
				if (historySelectionRequestIdRef.current === requestId) {
					setHistorySelectionLoadingRunId(null);
				}
			}
		},
		[
			clearHistorySelection,
			currentActiveRun?.id,
			historySelectionLoadingRunId,
			selectedHistoryView?.entry.run_id,
			session?.id,
		],
	);

	const startReview = useCallback(
		async (customInstructions: string) => {
			if (!session) {
				return;
			}

			setIsRunStarting(true);
			setRunError(null);
			try {
				const startedRun = await startReviewRun({
					sessionId: session.id,
					customInstructions: customInstructions.trim() || null,
				});
				await refreshSessionState(session.id, startedRun.id);
			} catch (error) {
				setRunError(getErrorMessage(error));
			} finally {
				setIsRunStarting(false);
			}
		},
		[refreshSessionState, session],
	);

	const cancelCurrentRun = useCallback(async () => {
		if (!session || !currentActiveRun) {
			return;
		}

		setIsRunCancelling(true);
		setRunError(null);
		try {
			await cancelReviewRun({
				sessionId: session.id,
				runId: currentActiveRun.id,
			});
			await refreshSessionState(session.id, currentActiveRun.id);
		} catch (error) {
			setRunError(getErrorMessage(error));
		} finally {
			setIsRunCancelling(false);
		}
	}, [currentActiveRun, refreshSessionState, session]);

	const respondToApproval = useCallback(
		async (approval: ReviewApproval, decision: ReviewApprovalDecision) => {
			if (!session || !currentActiveRun) {
				return;
			}

			setApprovalLoadingById((current) => ({
				...current,
				[approval.id]: true,
			}));
			try {
				await respondReviewApproval({
					sessionId: session.id,
					runId: currentActiveRun.id,
					approvalId: approval.id,
					decision,
				});
				await refreshSessionState(session.id, currentActiveRun.id);
			} catch (error) {
				setRunError(getErrorMessage(error));
			} finally {
				setApprovalLoadingById((current) => {
					const next = { ...current };
					delete next[approval.id];
					return next;
				});
			}
		},
		[currentActiveRun, refreshSessionState, session],
	);

	const canStartReview = Boolean(
		historySelectionLoadingRunId === null &&
			!isViewingHistory &&
			session &&
			!isSessionLoading &&
			!isRunStarting &&
			!(currentActiveRun && ACTIVE_RUN_STATUSES.has(currentActiveRun.status)),
	);
	const canCancelReview = Boolean(
		historySelectionLoadingRunId === null &&
			!isViewingHistory &&
			session &&
			currentActiveRun &&
			ACTIVE_RUN_STATUSES.has(currentActiveRun.status) &&
			!isRunCancelling,
	);
	const hasCancelableRun = Boolean(
		historySelectionLoadingRunId === null &&
			!isViewingHistory &&
			currentActiveRun &&
			ACTIVE_RUN_STATUSES.has(currentActiveRun.status),
	);

	return {
		session,
		reviewHistory,
		sessionError,
		historyError,
		runError,
		isSessionLoading,
		isHistoryLoading,
		isRunStarting,
		isRunCancelling,
		currentActiveRun,
		displayedSession,
		activeRun,
		reviewResult,
		pendingApprovals,
		reasoningTrace,
		isViewingHistory,
		selectedHistoryView,
		historySelectionLoadingRunId,
		historySelectionError,
		approvalLoadingById,
		canStartReview,
		canCancelReview,
		hasCancelableRun,
		clearHistorySelection,
		selectHistoryReview,
		startReview,
		cancelCurrentRun,
		respondToApproval,
	};
}
