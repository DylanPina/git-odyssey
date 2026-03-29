import { useCallback, useMemo, useRef, useState } from "react";
import { GitCommitHorizontal, PanelRightOpen } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
	DiffWorkspace,
	type DiffWorkspaceHandle,
} from "@/components/ui/custom/DiffWorkspace";
import { DiffWorkspaceHeader } from "@/components/ui/custom/DiffWorkspaceHeader";
import { DiffWorkspacePage } from "@/components/ui/custom/DiffWorkspacePage";
import { ReviewInsightsPanel } from "@/pages/review/components/ReviewInsightsPanel";
import { PreviousReviewsSection } from "@/pages/review/components/PreviousReviewsSection";
import { ReviewSetupSection } from "@/pages/review/components/ReviewSetupSection";
import { StatusPill } from "@/components/ui/status-pill";
import { useRepoData } from "@/hooks/useRepoData";
import { formatShortSha } from "@/lib/commitPresentation";
import { getFileChangeLabelPath } from "@/lib/diff";
import type {
	ReviewFinding,
	ReviewHistoryEntry,
} from "@/lib/definitions/review";
import {
	readRepoPathFromSearchParams,
	readReviewRefsFromSearchParams,
} from "@/lib/repoPaths";
import {
	REVIEW_DIFF_MIN_WIDTH,
	REVIEW_FILE_TREE_WIDTH_DEFAULT,
	REVIEW_FILE_TREE_WIDTH_MIN,
	REVIEW_RIGHT_RAIL_WIDTH_DEFAULT,
	REVIEW_RIGHT_RAIL_WIDTH_MIN,
} from "@/pages/review/review-constants";
import {
	formatLabel,
	getRunStatusTone,
} from "@/pages/review/review-formatters";
import { useReviewHistoryFilters } from "@/pages/review/useReviewHistoryFilters";
import { useReviewLayoutState } from "@/pages/review/useReviewLayoutState";
import { useReviewRefSelection } from "@/pages/review/useReviewRefSelection";
import { useReviewRunController } from "@/pages/review/useReviewRunController";

export function Review() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const repoPath = readRepoPathFromSearchParams(searchParams);
	const { baseRef: queryBaseRef, headRef: queryHeadRef } = useMemo(
		() => readReviewRefsFromSearchParams(searchParams),
		[searchParams],
	);
	const diffWorkspaceRef = useRef<DiffWorkspaceHandle | null>(null);
	const [customInstructions, setCustomInstructions] = useState("");

	const {
		commits,
		branches,
		isLoading: isRepoLoading,
		error: repoError,
	} = useRepoData({ repoPath });

	const {
		baseRef,
		headRef,
		branchOptions,
		baseTipCommit,
		headTipCommit,
		handleBaseRefChange,
		handleHeadRefChange,
	} = useReviewRefSelection({
		repoPath,
		queryBaseRef,
		queryHeadRef,
		branches,
		commits,
		isRepoLoading,
		navigate,
	});

	const {
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
	} = useReviewRunController({
		repoPath,
		baseRef,
		headRef,
	});

	const historyFilters = useReviewHistoryFilters(reviewHistory);
	const {
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
		isReviewVisible,
		isReviewRailOpen,
		isReviewFullscreen,
	} = useReviewLayoutState({
		activeRunId: activeRun?.id,
		reviewResult,
	});

	const availableFindingPaths = useMemo(() => {
		const paths = new Set<string>();

		for (const fileChange of displayedSession?.file_changes ?? []) {
			paths.add(getFileChangeLabelPath(fileChange));
			if (fileChange.new_path) {
				paths.add(fileChange.new_path);
			}
			if (fileChange.old_path) {
				paths.add(fileChange.old_path);
			}
		}

		return paths;
	}, [displayedSession?.file_changes]);

	const canNavigateToFinding = useCallback(
		(finding: ReviewFinding) => availableFindingPaths.has(finding.file_path),
		[availableFindingPaths],
	);

	const handleReturnToLatestReview = useCallback(() => {
		clearHistorySelection();
		setReviewPanelMode(currentActiveRun ? "rail" : "collapsed");
	}, [clearHistorySelection, currentActiveRun, setReviewPanelMode]);

	const handleSelectHistoryReview = useCallback(
		async (entry: ReviewHistoryEntry) => {
			const result = await selectHistoryReview(entry);
			if (
				result === "latest" ||
				result === "already_selected" ||
				result === "selected"
			) {
				setReviewPanelMode("rail");
			}
		},
		[selectHistoryReview, setReviewPanelMode],
	);

	const handleFindingSelect = useCallback(
		(finding: ReviewFinding) => {
			if (!canNavigateToFinding(finding)) {
				return;
			}

			setSelectedFindingId(finding.id);
			const focusFinding = () => {
				diffWorkspaceRef.current?.focusLocation({
					filePath: finding.file_path,
					newStart: finding.new_start ?? null,
					oldStart: finding.old_start ?? null,
				});
			};

			if (reviewPanelMode === "fullscreen" && typeof window !== "undefined") {
				setReviewPanelMode("rail");
				window.requestAnimationFrame(() => {
					window.requestAnimationFrame(() => {
						focusFinding();
					});
				});
				return;
			}

			focusFinding();
		},
		[canNavigateToFinding, reviewPanelMode, setReviewPanelMode, setSelectedFindingId],
	);

	const findingsLabel = reviewResult
		? `${reviewResult.findings.length} finding${reviewResult.findings.length === 1 ? "" : "s"}`
		: activeRun
			? formatLabel(activeRun.status)
			: "No review";

	const compareMetadata = [
		{
			label: isViewingHistory ? "Reviewed Base" : "Base",
			value: isViewingHistory
				? displayedSession?.base_head_sha
					? formatShortSha(displayedSession.base_head_sha)
					: "Unavailable"
				: baseRef
					? baseTipCommit
						? formatShortSha(baseTipCommit.sha)
						: isRepoLoading
							? "Loading"
							: "Unavailable"
					: "Not selected",
		},
		{
			label: isViewingHistory ? "Reviewed Head" : "Head",
			value: isViewingHistory
				? displayedSession?.head_head_sha
					? formatShortSha(displayedSession.head_head_sha)
					: "Unavailable"
				: headRef
					? headTipCommit
						? formatShortSha(headTipCommit.sha)
						: isRepoLoading
							? "Loading"
							: "Unavailable"
					: "Not selected",
		},
		{
			label: "Merge",
			value: displayedSession?.merge_base_sha
				? formatShortSha(displayedSession.merge_base_sha)
				: "Pending",
		},
		{
			label: "Files",
			value: displayedSession ? String(displayedSession.stats.files_changed) : "Pending",
		},
		{
			label: "Run",
			value: activeRun ? formatLabel(activeRun.status) : "Idle",
			isMono: false,
		},
		{
			label: "Approvals",
			value: String(pendingApprovals.length),
		},
	];

	if (reviewResult) {
		compareMetadata.push({
			label: "Review",
			value: findingsLabel,
			isMono: false,
		});
	}

	const changedFilesLabel = displayedSession
		? `${displayedSession.stats.files_changed} file${displayedSession.stats.files_changed === 1 ? "" : "s"} changed`
		: "Review diff";
	const isDisplayedSessionLoading =
		historySelectionLoadingRunId !== null || (!isViewingHistory && isSessionLoading);

	const workspaceTopContent = (
		<DiffWorkspaceHeader
			icon={<GitCommitHorizontal className="size-4 text-text-secondary" />}
			title={changedFilesLabel}
			titleMeta={
				displayedSession ? (
					<div className="flex items-center gap-2 font-mono text-[11px]">
						<span className="text-success">+{displayedSession.stats.additions}</span>
						<span className="text-danger">-{displayedSession.stats.deletions}</span>
						<span className="text-text-secondary">lines changed</span>
					</div>
				) : null
			}
			subtitle={
				<>
					<span className="font-mono text-text-primary">{baseRef || "Base"}</span>
					<span>vs</span>
					<span className="font-mono text-text-primary">{headRef || "Head"}</span>
					{displayedSession?.merge_base_sha ? (
						<>
							<span className="text-text-tertiary">merge</span>
							<span className="font-mono">
								{formatShortSha(displayedSession.merge_base_sha)}
							</span>
						</>
					) : null}
					{activeRun ? (
						<StatusPill tone={getRunStatusTone(activeRun.status)}>
							{formatLabel(activeRun.status)}
						</StatusPill>
					) : null}
					{reviewResult ? <span>{findingsLabel}</span> : null}
				</>
			}
		/>
	);

	const setupSection = (
		<ReviewSetupSection
			repoPath={repoPath}
			branchOptions={branchOptions}
			baseRef={baseRef}
			headRef={headRef}
			onBaseRefChange={handleBaseRefChange}
			onHeadRefChange={handleHeadRefChange}
			compareMetadata={compareMetadata}
			isViewingHistory={isViewingHistory}
			baseTipCommit={baseTipCommit}
			headTipCommit={headTipCommit}
			isRepoLoading={isRepoLoading}
			customInstructions={customInstructions}
			onCustomInstructionsChange={setCustomInstructions}
			canStartReview={canStartReview}
			canCancelReview={canCancelReview}
			hasCancelableRun={hasCancelableRun}
			isRunStarting={isRunStarting}
			isRunCancelling={isRunCancelling}
			onStartReview={() => {
				void startReview(customInstructions);
			}}
			onCancelReview={() => {
				void cancelCurrentRun();
			}}
			isReviewSetupOpen={isReviewSetupOpen}
			onToggleReviewSetup={() => setIsReviewSetupOpen((current) => !current)}
			repoError={repoError}
			sessionError={sessionError}
			runError={runError}
			historySelectionError={historySelectionError}
			isHistorySelectionLoading={historySelectionLoadingRunId !== null}
			pendingApprovals={pendingApprovals}
			approvalLoadingById={approvalLoadingById}
			onApprovalDecision={(approval, decision) => {
				void respondToApproval(approval, decision);
			}}
			reviewGeneratedAt={reviewResult?.generated_at ?? null}
		/>
	);

	const previousReviewsSection =
		repoPath && baseRef && headRef ? (
			<PreviousReviewsSection
				reviewHistory={reviewHistory}
				filteredReviewHistory={historyFilters.filteredReviewHistory}
				filters={historyFilters}
				isViewingHistory={isViewingHistory}
				isPreviousReviewsOpen={isPreviousReviewsOpen}
				onTogglePreviousReviews={() =>
					setIsPreviousReviewsOpen((current) => !current)
				}
				onReturnToLatestReview={handleReturnToLatestReview}
				selectedHistoryRunId={selectedHistoryView?.entry.run_id}
				historySelectionLoadingRunId={historySelectionLoadingRunId}
				historyError={historyError}
				isHistoryLoading={isHistoryLoading}
				onSelectHistoryReview={(entry) => {
					void handleSelectHistoryReview(entry);
				}}
			/>
		) : null;

	const mobileReviewPanel =
		activeRun && isReviewVisible ? (
			<div className="xl:hidden">
				<ReviewInsightsPanel
					activeRun={activeRun}
					reviewResult={reviewResult}
					findingsLabel={findingsLabel}
					selectedFindingId={selectedFindingId}
					onSelectFinding={handleFindingSelect}
					canNavigateToFinding={canNavigateToFinding}
					reasoningTrace={reasoningTrace}
					isInline
					onToggleOpen={() => setReviewPanelMode("collapsed")}
					onToggleFullscreen={() => setReviewPanelMode("rail")}
				/>
			</div>
		) : null;

	const desktopCollapsedReviewRail =
		activeRun ? (
			<button
				type="button"
				className="flex h-full w-full flex-col items-center justify-center gap-3 bg-transparent px-2 py-4 text-text-secondary transition-colors hover:bg-[rgba(255,255,255,0.04)]"
				onClick={() => setReviewPanelMode("rail")}
				aria-label="Show AI review"
				title="Show AI review"
			>
				<PanelRightOpen className="size-4" />
				<span className="rounded-full border border-[rgba(122,162,255,0.24)] bg-[rgba(122,162,255,0.12)] px-2 py-0.5 font-mono text-[10px] text-text-primary">
					{reviewResult ? reviewResult.findings.length : "..."}
				</span>
				<span className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-semibold tracking-[0.22em] text-text-tertiary uppercase">
					Review
				</span>
			</button>
		) : undefined;

	return (
		<DiffWorkspacePage
			topSections={[setupSection, previousReviewsSection, mobileReviewPanel]}
			workspace={
				<DiffWorkspace
					ref={diffWorkspaceRef}
					repoPath={repoPath}
					viewerId={displayedSession ? `review:${displayedSession.id}` : "review"}
					files={displayedSession?.file_changes ?? []}
					isLoading={isDisplayedSessionLoading}
					error={
						!repoPath
							? "No Git project path was provided."
							: displayedSession
								? null
								: isViewingHistory
									? historySelectionError
									: sessionError
					}
					topContent={workspaceTopContent}
					fileSearchInputId="review-file-search-input"
					codeSearchInputId="review-code-search-input"
					emptyTitle="Select two local branches to prepare a review session."
					emptyDescription="GitOdyssey creates a persisted Codex review session for merge-base(base, head)...head and then runs the review in a disposable worktree."
					chromeDensity="compact"
					fileTreeCollapsible
					desktopResize={{
						minContentWidth: REVIEW_DIFF_MIN_WIDTH,
						fileTree: {
							preferredWidth: fileTreePreferredWidth,
							defaultWidth: REVIEW_FILE_TREE_WIDTH_DEFAULT,
							minWidth: REVIEW_FILE_TREE_WIDTH_MIN,
							onPreferredWidthChange: setFileTreePreferredWidth,
						},
						rightRail: {
							preferredWidth: reviewRailPreferredWidth,
							defaultWidth: REVIEW_RIGHT_RAIL_WIDTH_DEFAULT,
							minWidth: REVIEW_RIGHT_RAIL_WIDTH_MIN,
							onPreferredWidthChange: setReviewRailPreferredWidth,
						},
					}}
					rightRail={
						activeRun ? (
							<ReviewInsightsPanel
								activeRun={activeRun}
								reviewResult={reviewResult}
								findingsLabel={findingsLabel}
								selectedFindingId={selectedFindingId}
								onSelectFinding={handleFindingSelect}
								canNavigateToFinding={canNavigateToFinding}
								reasoningTrace={reasoningTrace}
								isFullscreen={isReviewFullscreen}
								onToggleOpen={() => setReviewPanelMode("collapsed")}
								onToggleFullscreen={() =>
									setReviewPanelMode((current) =>
										current === "fullscreen" ? "rail" : "fullscreen",
									)
								}
							/>
						) : undefined
					}
					isRightRailOpen={Boolean(activeRun) && isReviewRailOpen}
					isRightRailFullscreen={Boolean(activeRun) && isReviewFullscreen}
					rightRailCollapsedSummary={desktopCollapsedReviewRail}
				/>
			}
		/>
	);
}
