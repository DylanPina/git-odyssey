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
import { ReviewTitleBarTabs } from "@/pages/review/components/ReviewTitleBarTabs";
import { ReviewTitleBarTrailing } from "@/pages/review/components/ReviewTitleBarTrailing";
import { StatusPill } from "@/components/ui/status-pill";
import { useCommitDetails } from "@/hooks/useCommitDetails";
import { useRepoData } from "@/hooks/useRepoData";
import {
	formatCommitTimestamp,
	formatShortSha,
	getCommitAuthorLabel,
	getCommitTitle,
} from "@/lib/commitPresentation";
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
	getRepoDisplayName,
	readRepoPathFromSearchParams,
	readReviewTabIdFromSearchParams,
	readReviewTargetFromSearchParams,
} from "@/lib/repoPaths";
import {
	DETACHED_HEAD_LABEL,
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
import { getReviewTabShortcutDirection } from "@/pages/review/review-shortcuts";
import { useReviewHistoryFilters } from "@/pages/review/useReviewHistoryFilters";
import { useReviewChatSession } from "@/pages/review/useReviewChatSession";
import { useReviewLayoutState } from "@/pages/review/useReviewLayoutState";
import { useReviewRunController } from "@/pages/review/useReviewRunController";
import { useReviewTabs } from "@/pages/review/useReviewTabs";

function getShortcutTargetElement(target: EventTarget | null): Element | null {
	if (target instanceof Element) {
		return target;
	}

	if (target instanceof Node) {
		return target.parentElement;
	}

	return null;
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
	const element = getShortcutTargetElement(target);
	if (!element) {
		return false;
	}

	if (element.closest(".monaco-editor")) {
		return false;
	}

	if (element.closest("input, textarea, select")) {
		return true;
	}

	if (element.closest("[role='textbox'], [role='searchbox']")) {
		return true;
	}

	return element instanceof HTMLElement ? element.isContentEditable : false;
}

export function Review() {
	const navigate = useNavigate();
	const setDesktopTitleBarChrome = useDesktopTitleBarChrome();
	const [searchParams] = useSearchParams();
	const repoPath = readRepoPathFromSearchParams(searchParams);
	const routeTabId = useMemo(
		() => readReviewTabIdFromSearchParams(searchParams),
		[searchParams],
	);
	const reviewTarget = useMemo(
		() => readReviewTargetFromSearchParams(searchParams),
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
	const repoDisplayName = useMemo(
		() => (repoPath ? getRepoDisplayName(repoPath) : "Repository"),
		[repoPath],
	);
	const branchOptions = useMemo(
		() =>
			Array.from(
				new Set(
					branches
						.map((branch) => branch.name)
						.filter((name) => name && name !== DETACHED_HEAD_LABEL),
				),
			).sort((left, right) =>
				left.localeCompare(right, undefined, {
					numeric: true,
					sensitivity: "base",
				}),
			),
		[branches],
	);

	const {
		tabs,
		activeTab,
		activeTabId,
		activeTarget,
		activateTab,
		activateNextTab,
		activatePreviousTab,
		createCompareTab,
		closeTab,
		updateActiveCompareRefs,
		syncActiveTabSession,
	} = useReviewTabs({
		repoPath,
		reviewTarget,
		routeTabId,
		branches,
		commits,
		isRepoLoading,
		navigate,
	});
	const controllerTarget =
		activeTarget ??
		({
			mode: "compare",
			baseRef: "",
			headRef: "",
		} as const);
	const compareReviewTarget =
		controllerTarget.mode === "compare" ? controllerTarget : null;
	const commitReviewTarget =
		controllerTarget.mode === "commit" ? controllerTarget : null;
	const baseRef = compareReviewTarget?.baseRef ?? "";
	const headRef = compareReviewTarget?.headRef ?? "";

	const {
		session,
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
		targetMode: controllerTarget.mode,
		baseRef,
		headRef,
		commitSha: commitReviewTarget?.commitSha ?? null,
		sessionId: activeTab?.sessionId ?? null,
	});
	const {
		commit: targetCommit,
		isLoading: isCommitLoading,
		error: commitError,
	} = useCommitDetails({
		repoPath,
		commitSha: commitReviewTarget?.commitSha,
	});

	useEffect(() => {
		syncActiveTabSession(session);
	}, [session, syncActiveTabSession]);

	const historyFilters = useReviewHistoryFilters(reviewHistory);
	const assistantEnabled = Boolean(
		repoPath &&
			(controllerTarget.mode === "commit"
				? controllerTarget.commitSha
				: baseRef && headRef),
	);
	const {
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
		draftFindingContexts,
		isChatLoading,
		chatError,
		isChatReady,
		sendDraft,
		injectSelection,
		injectFinding,
		removeDraftCodeContext,
		removeDraftFindingContext,
		clearChatError,
	} = useReviewChatSession({
		sessionId: displayedSession?.id,
		activeRun,
		reviewResult,
		isViewingHistory,
	});
	const handleBaseRefChange = useCallback(
		(nextBaseRef: string) => {
			void updateActiveCompareRefs(nextBaseRef, headRef);
		},
		[headRef, updateActiveCompareRefs],
	);
	const handleHeadRefChange = useCallback(
		(nextHeadRef: string) => {
			void updateActiveCompareRefs(baseRef, nextHeadRef);
		},
		[baseRef, updateActiveCompareRefs],
	);

	const chatComposerNote =
		!assistantEnabled
			? controllerTarget.mode === "commit"
				? "Select a commit to prepare Codex review chat."
				: "Select both branches to prepare Codex review chat."
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

	const handleInjectFinding = useCallback(
		(finding: ReviewFinding) => {
			injectFinding(finding);
			setAssistantTab("chat");
			setReviewPanelMode("rail");
			setChatComposerFocusToken((current) => current + 1);
		},
		[injectFinding, setAssistantTab, setReviewPanelMode],
	);

	const toggleReviewRail = useCallback(() => {
		if (!assistantEnabled) {
			return;
		}

		setReviewPanelMode((current) =>
			current === "collapsed" ? "rail" : "collapsed",
		);
	}, [assistantEnabled, setReviewPanelMode]);

	const closeReviewRail = useCallback(() => {
		setReviewPanelMode("collapsed");
	}, [setReviewPanelMode]);

	const toggleReviewFullscreen = useCallback(() => {
		setReviewPanelMode((current) =>
			current === "fullscreen" ? "rail" : "fullscreen",
		);
	}, [setReviewPanelMode]);

	const restoreReviewRail = useCallback(() => {
		setReviewPanelMode("rail");
	}, [setReviewPanelMode]);

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

	const handleChatFindingContextClick = useCallback(
		(finding: ReviewFinding) => {
			setSelectedFindingId(finding.id);
			setAssistantTab("review");
			setReviewPanelMode("rail");
		},
		[setAssistantTab, setReviewPanelMode, setSelectedFindingId],
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
	const commitTitle = useMemo(
		() => getCommitTitle(targetCommit),
		[targetCommit],
	);
	const commitAuthorLabel = useMemo(
		() => getCommitAuthorLabel(targetCommit?.author),
		[targetCommit?.author],
	);
	const commitTimestampLabel = useMemo(
		() => formatCommitTimestamp(targetCommit?.time),
		[targetCommit?.time],
	);
	const displayedTargetMode = displayedSession?.target_mode ?? controllerTarget.mode;
	const displayedCommitSha =
		displayedSession?.commit_sha ??
		(controllerTarget.mode === "commit" ? controllerTarget.commitSha : null);

	const reviewTitleBarChrome = useMemo(
		() => ({
			center:
				repoPath && tabs.length > 0 ? (
					<ReviewTitleBarTabs
						repoLabel={repoDisplayName}
						tabs={tabs}
						activeTabId={activeTabId}
						onSelectTab={activateTab}
						onCloseTab={(tabId) => {
							void closeTab(tabId);
						}}
						onCreateTab={createCompareTab}
					/>
				) : undefined,
			trailing: (
				<ReviewTitleBarTrailing
					targetMode={controllerTarget.mode}
					branchOptions={branchOptions}
					baseRef={baseRef}
					headRef={headRef}
					commitSha={commitReviewTarget?.commitSha ?? null}
					onBaseRefChange={handleBaseRefChange}
					onHeadRefChange={handleHeadRefChange}
					isRepoLoading={isRepoLoading}
					canStartReview={canStartReview}
					canCancelReview={canCancelReview}
					hasCancelableRun={hasCancelableRun}
					isRunStarting={isRunStarting}
					isRunCancelling={isRunCancelling}
					reviewHistory={reviewHistory}
					filteredReviewHistory={historyFilters.filteredReviewHistory}
					filters={historyFilters}
					isViewingHistory={isViewingHistory}
					selectedHistoryRunId={selectedHistoryView?.entry.run_id}
					historySelectionLoadingRunId={historySelectionLoadingRunId}
					historyError={historyError}
					isHistoryLoading={isHistoryLoading}
					onReturnToLatestReview={handleReturnToLatestReview}
					onSelectHistoryReview={(entry) => {
						void handleSelectHistoryReview(entry);
					}}
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
			activeTabId,
			activateTab,
			canCancelReview,
			canStartReview,
			branchOptions,
			closeTab,
			commitReviewTarget?.commitSha,
			controllerTarget.mode,
			createCompareTab,
			handleBaseRefChange,
			handleHeadRefChange,
			handleReturnToLatestReview,
			handleSelectHistoryReview,
			baseRef,
			headRef,
			cancelCurrentRun,
			customInstructions,
			hasCancelableRun,
			historyError,
			historyFilters,
			historySelectionLoadingRunId,
			isHistoryLoading,
			isViewingHistory,
			isRepoLoading,
			isRunCancelling,
			isRunStarting,
			repoDisplayName,
			repoPath,
			reviewHistory,
			selectedHistoryView?.entry.run_id,
			startReview,
			tabs,
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

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				event.repeat ||
				event.isComposing ||
				!(event.metaKey || event.ctrlKey) ||
				isEditableShortcutTarget(event.target)
			) {
				return;
			}

			const tabShortcutDirection = getReviewTabShortcutDirection(event);
			if (tabShortcutDirection && tabs.length > 1) {
				event.preventDefault();
				if (tabShortcutDirection === "next") {
					activateNextTab();
				} else {
					activatePreviousTab();
				}
				return;
			}

			if (event.altKey || event.shiftKey) {
				return;
			}

			const key = event.key.toLowerCase();
			if (key === "b") {
				event.preventDefault();
				diffWorkspaceRef.current?.toggleFileTree();
				return;
			}

			if (key === "j" && assistantEnabled) {
				event.preventDefault();
				toggleReviewRail();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		activateNextTab,
		activatePreviousTab,
		assistantEnabled,
		tabs.length,
		toggleReviewRail,
	]);

	const changedFilesLabel = displayedSession
		? `${displayedSession.stats.files_changed} file${displayedSession.stats.files_changed === 1 ? "" : "s"} changed`
		: controllerTarget.mode === "commit"
			? "Commit diff"
			: "Review diff";
	const isDisplayedSessionLoading =
		historySelectionLoadingRunId !== null ||
		(!isViewingHistory && isSessionLoading) ||
		(controllerTarget.mode === "commit" && isCommitLoading);

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
				displayedTargetMode === "commit" ? (
					<>
						<span className="truncate text-text-primary">{commitTitle}</span>
						<span className="font-mono">
							{displayedCommitSha
								? formatShortSha(displayedCommitSha)
								: formatShortSha(targetCommit?.sha)}
						</span>
						<span>{commitAuthorLabel}</span>
						<span>{commitTimestampLabel}</span>
						{activeRun ? (
							<StatusPill tone={getRunStatusTone(activeRun.status)}>
								{formatLabel(activeRun.status)}
							</StatusPill>
						) : null}
						{reviewResult ? <span>{findingsLabel}</span> : null}
					</>
				) : (
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
				)
			}
		/>
	);

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
			draftFindingContexts={draftFindingContexts}
			onChatDraftChange={handleChatDraftChange}
			onSendChatMessage={() => {
				void sendDraft();
			}}
			onAddFindingToChat={handleInjectFinding}
			onChatCodeContextClick={handleChatCodeContextClick}
			onChatFindingContextClick={handleChatFindingContextClick}
			onAssistantReferenceClick={handleAssistantReferenceClick}
			onRemoveDraftCodeContext={removeDraftCodeContext}
			onRemoveDraftFindingContext={removeDraftFindingContext}
			reviewReferencePaths={reviewReferencePaths}
			reviewReferenceRepoPath={repoPath}
			isChatLoading={isChatLoading}
			chatError={chatError}
			isChatComposerDisabled={isChatComposerDisabled}
			chatComposerNote={chatComposerNote}
			composerFocusToken={chatComposerFocusToken}
			isFullscreen={isReviewFullscreen}
			onToggleOpen={closeReviewRail}
			onToggleFullscreen={toggleReviewFullscreen}
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
					draftFindingContexts={draftFindingContexts}
					onChatDraftChange={handleChatDraftChange}
					onSendChatMessage={() => {
						void sendDraft();
					}}
					onAddFindingToChat={handleInjectFinding}
					onChatCodeContextClick={handleChatCodeContextClick}
					onChatFindingContextClick={handleChatFindingContextClick}
					onAssistantReferenceClick={handleAssistantReferenceClick}
					onRemoveDraftCodeContext={removeDraftCodeContext}
					onRemoveDraftFindingContext={removeDraftFindingContext}
					reviewReferencePaths={reviewReferencePaths}
					reviewReferenceRepoPath={repoPath}
					isChatLoading={isChatLoading}
					chatError={chatError}
					isChatComposerDisabled={isChatComposerDisabled}
					chatComposerNote={chatComposerNote}
					composerFocusToken={chatComposerFocusToken}
					isInline
					onToggleOpen={closeReviewRail}
					onToggleFullscreen={restoreReviewRail}
				/>
			) : (
				<button
					type="button"
					className="workspace-panel flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-control/60"
					onClick={restoreReviewRail}
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
			onClick={restoreReviewRail}
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
			layout="fixed"
			bottomSections={[mobileAssistantPanel]}
			workspace={
				<DiffWorkspace
					ref={diffWorkspaceRef}
					repoPath={repoPath}
					viewerId={
						displayedSession
							? `review:${displayedSession.id}`
							: activeTab
								? `review:tab:${activeTab.id}`
								: "review"
					}
					files={displayedSession?.file_changes ?? []}
					isLoading={isDisplayedSessionLoading}
					error={
						!repoPath
							? "No Git project path was provided."
							: displayedSession
								? null
								: isViewingHistory
									? historySelectionError
									: controllerTarget.mode === "commit"
										? commitError ?? sessionError
										: sessionError
					}
					topContent={workspaceTopContent}
					fileSearchInputId="review-file-search-input"
					codeSearchInputId="review-code-search-input"
					emptyTitle={
						controllerTarget.mode === "commit"
							? "Select a commit to prepare a review session."
							: "Select two local branches to prepare a review session."
					}
					emptyDescription={
						controllerTarget.mode === "commit"
							? "GitOdyssey creates a persisted Codex review session for parent(commit)...commit and then runs the review in a disposable worktree."
							: "GitOdyssey creates a persisted Codex review session for merge-base(base, head)...head and then runs the review in a disposable worktree."
					}
					chromeDensity="compact"
					searchContext={
						controllerTarget.mode === "commit"
							? (commitReviewTarget?.searchContext ?? null)
							: null
					}
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
