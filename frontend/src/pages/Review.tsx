import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	GitCommitHorizontal,
	MessageCircle,
	PanelRightOpen,
	Sparkles,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
	DiffWorkspace,
	type DiffWorkspaceHandle,
} from "@/components/ui/custom/DiffWorkspace";
import type { ReviewChatReferenceTarget } from "@/components/ui/custom/MarkdownRenderer";
import { DiffWorkspaceHeader } from "@/components/ui/custom/DiffWorkspaceHeader";
import { DiffWorkspacePage } from "@/components/ui/custom/DiffWorkspacePage";
import { ReviewAssistantPanel } from "@/pages/review/components/ReviewAssistantPanel";
import { PreviousReviewsSection } from "@/pages/review/components/PreviousReviewsSection";
import { ReviewTitleBarTrailing } from "@/pages/review/components/ReviewTitleBarTrailing";
import { StatusPill } from "@/components/ui/status-pill";
import { useRepoData } from "@/hooks/useRepoData";
import { formatShortSha } from "@/lib/commitPresentation";
import {
	type DiffSelectionContext,
	getFileChangeLabelPath,
	normalizeDiffFileStatus,
} from "@/lib/diff";
import type { ChatCodeContext } from "@/lib/definitions/chat";
import type {
	ReviewFinding,
	ReviewHistoryEntry,
} from "@/lib/definitions/review";
import { useDesktopTitleBarChrome } from "@/lib/desktop-titlebar-actions";
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
import { useReviewChatSession } from "@/pages/review/useReviewChatSession";
import { useReviewLayoutState } from "@/pages/review/useReviewLayoutState";
import { useReviewRefSelection } from "@/pages/review/useReviewRefSelection";
import { useReviewRunController } from "@/pages/review/useReviewRunController";

export function Review() {
	const navigate = useNavigate();
	const setDesktopTitleBarChrome = useDesktopTitleBarChrome();
	const [searchParams] = useSearchParams();
	const repoPath = readRepoPathFromSearchParams(searchParams);
	const { baseRef: queryBaseRef, headRef: queryHeadRef } = useMemo(
		() => readReviewRefsFromSearchParams(searchParams),
		[searchParams],
	);
	const diffWorkspaceRef = useRef<DiffWorkspaceHandle | null>(null);
	const [customInstructions] = useState("");
	const [chatComposerFocusToken, setChatComposerFocusToken] = useState(0);

	const {
		commits,
		branches,
		isLoading: isRepoLoading,
	} = useRepoData({ repoPath });

	const {
		baseRef,
		headRef,
		branchOptions,
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
		isSessionLoading,
		isHistoryLoading,
		isRunStarting,
		isRunCancelling,
		displayedSession,
		activeRun,
		reviewResult,
		reasoningTrace,
		isViewingHistory,
		selectedHistoryView,
		historySelectionLoadingRunId,
		historySelectionError,
		canStartReview,
		canCancelReview,
		hasCancelableRun,
		clearHistorySelection,
		selectHistoryReview,
		startReview,
		cancelCurrentRun,
	} = useReviewRunController({
		repoPath,
		baseRef,
		headRef,
	});

	const historyFilters = useReviewHistoryFilters(reviewHistory);
	const assistantEnabled = Boolean(repoPath && baseRef && headRef);
	const {
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
		isReviewVisible,
		isReviewRailOpen,
		isReviewFullscreen,
	} = useReviewLayoutState({
		assistantEnabled,
		activeRunId: activeRun?.id,
		reviewResult,
	});

	const {
		chatMessages,
		draft: chatDraft,
		setDraft: setChatDraft,
		draftCodeContexts,
		isChatLoading,
		chatError,
		isChatReady,
		sendDraft,
		injectSelection,
		removeDraftCodeContext,
		clearChatError,
	} = useReviewChatSession({
		sessionId: displayedSession?.id,
		activeRun,
		reviewResult,
		isViewingHistory,
	});

	const chatComposerNote =
		!assistantEnabled
			? "Select both branches to prepare Codex review chat."
			: !isChatReady || isSessionLoading
				? "Preparing Codex review chat for this compare target."
				: null;
	const isChatComposerDisabled = !assistantEnabled || !isChatReady || isSessionLoading;

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

	const reviewReferencePaths = useMemo(() => {
		const paths = new Set<string>();

		for (const fileChange of displayedSession?.file_changes ?? []) {
			const labelPath = getFileChangeLabelPath(fileChange);
			paths.add(labelPath);
			if (fileChange.new_path) {
				paths.add(fileChange.new_path);
			}
			if (fileChange.old_path) {
				paths.add(fileChange.old_path);
			}
		}

		return Array.from(paths);
	}, [displayedSession?.file_changes]);

	const canNavigateToFinding = useCallback(
		(finding: ReviewFinding) => availableFindingPaths.has(finding.file_path),
		[availableFindingPaths],
	);

	const handleReturnToLatestReview = useCallback(() => {
		clearHistorySelection();
		setReviewPanelMode(assistantEnabled ? "rail" : "collapsed");
	}, [assistantEnabled, clearHistorySelection, setReviewPanelMode]);

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

	const handleChatDraftChange = useCallback(
		(nextDraft: string) => {
			if (chatError) {
				clearChatError();
			}

			setChatDraft(nextDraft);
		},
		[chatError, clearChatError, setChatDraft],
	);

	const handleInjectSelection = useCallback(
		(selection: DiffSelectionContext) => {
			injectSelection(selection);
			setAssistantTab("chat");
			setReviewPanelMode("rail");
			setChatComposerFocusToken((current) => current + 1);
		},
		[injectSelection, setAssistantTab, setReviewPanelMode],
	);

	const handleChatCodeContextClick = useCallback(
		(context: ChatCodeContext) => {
			const focusContext = () => {
				diffWorkspaceRef.current?.focusLocation({
					filePath: context.filePath,
					newStart: context.side === "modified" ? context.startLine : null,
					oldStart: context.side === "original" ? context.startLine : null,
				});
			};

			if (reviewPanelMode === "fullscreen" && typeof window !== "undefined") {
				setReviewPanelMode("rail");
				window.requestAnimationFrame(() => {
					window.requestAnimationFrame(() => {
						focusContext();
					});
				});
				return;
			}

			focusContext();
		},
		[reviewPanelMode, setReviewPanelMode],
	);

	const handleAssistantReferenceClick = useCallback(
		(target: ReviewChatReferenceTarget) => {
			const matchingFileChange =
				displayedSession?.file_changes.find((fileChange) => {
					const knownPaths = new Set([
						getFileChangeLabelPath(fileChange),
						fileChange.new_path,
						fileChange.old_path,
					]);
					return knownPaths.has(target.filePath);
				}) ?? null;

			const focusReference = () => {
				if (!target.line) {
					diffWorkspaceRef.current?.focusLocation({
						filePath: target.filePath,
					});
					return;
				}

				const status = normalizeDiffFileStatus(matchingFileChange?.status);
				const isOriginalSideReference =
					(matchingFileChange?.old_path != null &&
						matchingFileChange.old_path === target.filePath &&
						matchingFileChange.new_path !== target.filePath) ||
					status === "deleted";

				diffWorkspaceRef.current?.focusLocation({
					filePath: target.filePath,
					newStart: isOriginalSideReference ? null : target.line,
					oldStart: isOriginalSideReference ? target.line : null,
				});
			};

			if (reviewPanelMode === "fullscreen" && typeof window !== "undefined") {
				setReviewPanelMode("rail");
				window.requestAnimationFrame(() => {
					window.requestAnimationFrame(() => {
						focusReference();
					});
				});
				return;
			}

			focusReference();
		},
		[displayedSession?.file_changes, reviewPanelMode, setReviewPanelMode],
	);

	const findingsLabel = reviewResult
		? `${reviewResult.findings.length} finding${reviewResult.findings.length === 1 ? "" : "s"}`
		: activeRun
			? formatLabel(activeRun.status)
			: "No review";

	const reviewTitleBarChrome = useMemo(
		() => ({
			trailing: (
				<ReviewTitleBarTrailing
					branchOptions={branchOptions}
					baseRef={baseRef}
					headRef={headRef}
					onBaseRefChange={handleBaseRefChange}
					onHeadRefChange={handleHeadRefChange}
					isRepoLoading={isRepoLoading}
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
				/>
			),
		}),
		[
			canCancelReview,
			canStartReview,
			branchOptions,
			handleBaseRefChange,
			handleHeadRefChange,
			baseRef,
			headRef,
			cancelCurrentRun,
			customInstructions,
			hasCancelableRun,
			isRepoLoading,
			isRunCancelling,
			isRunStarting,
			startReview,
		],
	);

	useEffect(() => {
		setDesktopTitleBarChrome(reviewTitleBarChrome);

		return () => {
			setDesktopTitleBarChrome((currentChrome) =>
				currentChrome === reviewTitleBarChrome ? null : currentChrome,
			);
		};
	}, [reviewTitleBarChrome, setDesktopTitleBarChrome]);

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

	const previousReviewsSection =
		repoPath && baseRef && headRef && reviewHistory.length > 0 ? (
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

	const assistantPanel = assistantEnabled ? (
		<ReviewAssistantPanel
			activeTab={assistantTab}
			onActiveTabChange={setAssistantTab}
			activeRun={activeRun}
			reviewResult={reviewResult}
			findingsLabel={findingsLabel}
			selectedFindingId={selectedFindingId}
			onSelectFinding={handleFindingSelect}
			canNavigateToFinding={canNavigateToFinding}
			reasoningTrace={reasoningTrace}
			chatMessages={chatMessages}
			chatDraft={chatDraft}
			draftCodeContexts={draftCodeContexts}
			onChatDraftChange={handleChatDraftChange}
			onSendChatMessage={() => {
				void sendDraft();
			}}
			onChatCodeContextClick={handleChatCodeContextClick}
			onAssistantReferenceClick={handleAssistantReferenceClick}
			onRemoveDraftCodeContext={removeDraftCodeContext}
			reviewReferencePaths={reviewReferencePaths}
			reviewReferenceRepoPath={repoPath}
			isChatLoading={isChatLoading}
			chatError={chatError}
			isChatComposerDisabled={isChatComposerDisabled}
			chatComposerNote={chatComposerNote}
			composerFocusToken={chatComposerFocusToken}
			isFullscreen={isReviewFullscreen}
			onToggleOpen={() => setReviewPanelMode("collapsed")}
			onToggleFullscreen={() =>
				setReviewPanelMode((current) =>
					current === "fullscreen" ? "rail" : "fullscreen",
				)
			}
		/>
	) : undefined;

	const mobileAssistantPanel = assistantEnabled ? (
		<div className="xl:hidden">
			{isReviewVisible ? (
				<ReviewAssistantPanel
					activeTab={assistantTab}
					onActiveTabChange={setAssistantTab}
					activeRun={activeRun}
					reviewResult={reviewResult}
					findingsLabel={findingsLabel}
					selectedFindingId={selectedFindingId}
					onSelectFinding={handleFindingSelect}
					canNavigateToFinding={canNavigateToFinding}
					reasoningTrace={reasoningTrace}
					chatMessages={chatMessages}
					chatDraft={chatDraft}
					draftCodeContexts={draftCodeContexts}
					onChatDraftChange={handleChatDraftChange}
					onSendChatMessage={() => {
						void sendDraft();
					}}
					onChatCodeContextClick={handleChatCodeContextClick}
					onAssistantReferenceClick={handleAssistantReferenceClick}
					onRemoveDraftCodeContext={removeDraftCodeContext}
					reviewReferencePaths={reviewReferencePaths}
					reviewReferenceRepoPath={repoPath}
					isChatLoading={isChatLoading}
					chatError={chatError}
					isChatComposerDisabled={isChatComposerDisabled}
					chatComposerNote={chatComposerNote}
					composerFocusToken={chatComposerFocusToken}
					isInline
					onToggleOpen={() => setReviewPanelMode("collapsed")}
					onToggleFullscreen={() => setReviewPanelMode("rail")}
				/>
			) : (
				<button
					type="button"
					className="workspace-panel flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-control/60"
					onClick={() => setReviewPanelMode("rail")}
				>
					<div>
						<div className="workspace-section-label">Assistant</div>
						<div className="mt-1 text-sm font-semibold text-text-primary">
							Show review chat and findings
						</div>
					</div>
					<PanelRightOpen className="size-4 text-text-secondary" />
				</button>
			)}
		</div>
	) : null;

	const collapsedAssistantBadge =
		assistantTab === "review"
			? reviewResult
				? String(reviewResult.findings.length)
				: activeRun
					? "…"
					: null
			: chatMessages.length > 0
				? String(chatMessages.length)
				: null;

	const desktopCollapsedAssistantRail = assistantEnabled ? (
		<button
			type="button"
			className="flex h-full w-full flex-col items-center justify-center gap-3 bg-transparent px-2 py-4 text-text-secondary transition-colors hover:bg-[rgba(255,255,255,0.04)]"
			onClick={() => setReviewPanelMode("rail")}
			aria-label="Show assistant"
			title="Show assistant"
		>
			{assistantTab === "review" ? (
				<Sparkles className="size-4" />
			) : (
				<MessageCircle className="size-4" />
			)}
			{collapsedAssistantBadge ? (
				<span className="rounded-full border border-[rgba(122,162,255,0.24)] bg-[rgba(122,162,255,0.12)] px-2 py-0.5 font-mono text-[10px] text-text-primary">
					{collapsedAssistantBadge}
				</span>
			) : null}
			<span className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-semibold tracking-[0.22em] text-text-tertiary uppercase">
				Assistant
			</span>
		</button>
	) : undefined;

	return (
		<DiffWorkspacePage
			spacing="compact"
			topSections={[previousReviewsSection]}
			bottomSections={[mobileAssistantPanel]}
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
					rightRail={assistantPanel}
					isRightRailOpen={assistantEnabled && isReviewRailOpen}
					isRightRailFullscreen={assistantEnabled && isReviewFullscreen}
					rightRailCollapsedSummary={desktopCollapsedAssistantRail}
					onInjectSelection={handleInjectSelection}
				/>
			}
		/>
	);
}
