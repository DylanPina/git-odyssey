import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { CommitListView } from "@/components/ui/custom/CommitListView";
import CommitNode from "@/components/ui/custom/CommitNode";
import { GraphView } from "@/components/ui/custom/GraphView";
import { RepoSidebar } from "@/components/ui/custom/RepoSidebar";
import {
	RepoTitleBarLeading,
	RepoTitleBarTrailing,
	type RepoViewMode,
} from "@/components/ui/custom/RepoToolbar";
import { InlineBanner } from "@/components/ui/inline-banner";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { useChat } from "@/hooks/useChat";
import { useCommitGraph } from "@/hooks/useCommitGraph";
import { useRepoData } from "@/hooks/useRepoData";
import { useSidebarTab } from "@/hooks/useSidebarTab";
import {
	buildReviewRoute,
	readRepoPathFromSearchParams,
} from "@/lib/repoPaths";
import { useDesktopTitleBarChrome } from "@/lib/desktop-titlebar-actions";
import {
	getReviewRefsStorageKey,
	getStoredReviewRefs,
} from "@/pages/review/review-storage";

const nodeTypes = {
	commit: CommitNode,
};

const REPO_SEARCH_INPUT_ID = "repo-search-input";
const REPO_VIEW_MODE_STORAGE_KEY = "git-odyssey-repo-view-mode";

function loadRepoViewMode(): RepoViewMode {
	if (typeof window === "undefined") {
		return "graph";
	}

	try {
		const stored = window.localStorage.getItem(REPO_VIEW_MODE_STORAGE_KEY);
		if (stored === "graph" || stored === "list") {
			return stored;
		}
	} catch {
		// Ignore storage issues and keep the default.
	}

	return "graph";
}

function focusRepoSearchInput(remainingAttempts = 4) {
	const input = document.getElementById(REPO_SEARCH_INPUT_ID);
	if (input instanceof HTMLInputElement) {
		input.focus();
		input.select();
		return;
	}

	if (remainingAttempts <= 0) {
		return;
	}

	window.requestAnimationFrame(() => {
		focusRepoSearchInput(remainingAttempts - 1);
	});
}

function RepoWorkspace() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const [viewMode, setViewMode] = useState<RepoViewMode>(() => loadRepoViewMode());
	const previousViewModeRef = useRef<RepoViewMode | null>(null);
	const shouldZoomFirstNodeOnGraphInitRef = useRef(false);
	const { isMobile, setOpen, setOpenMobile, toggleSidebar } = useSidebar();
	const setDesktopTitleBarChrome = useDesktopTitleBarChrome();
	const { setSelectedTab } = useSidebarTab();
	const repoPath = readRepoPathFromSearchParams(searchParams);

	const {
		commits,
		branches,
		isLoading,
		isIngesting,
		ingestStatus,
		ingestProgressPercent,
		ingestProgressPhase,
		ingestProgressLabel,
		ingestProgressCompletedUnits,
		ingestProgressTotalUnits,
		error,
		refresh,
	} = useRepoData({
		repoPath,
	});
	const pageError = repoPath ? error : "No Git project path was provided.";

	const {
		nodes,
		edges,
		filteredCommits,
		filters,
		hasActiveFilters,
		focusedCommitSha,
		searchQuery,
		lastSearchQuery,
		searchResults,
		searchMaxResults,
		searchTotalRankedResults,
		searchTotalRelevantResults,
		hasMoreRelevantSearchResults,
		isSearchLoading,
		setSearchQuery,
		executeSearch,
		loadMoreSearchResults,
		layoutDirection,
		toggleLayoutDirection,
		onNodesChange,
		onEdgesChange,
		onConnect,
		handleCommitClick,
		handleCommitSummaryUpdate,
		handleFiltersChange,
		handleClearFilters,
		reactFlowInstanceRef,
	} = useCommitGraph({ repoPath, commits, branches });

	const { chatMessages, isChatLoading, chatError, sendMessage } = useChat({
		repoPath,
		filteredCommits,
	});

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
				return;
			}

			if (event.key.toLowerCase() !== "k") {
				return;
			}

			event.preventDefault();
			setSelectedTab("search");

			if (isMobile) {
				setOpenMobile(true);
			} else {
				setOpen(true);
			}

			window.requestAnimationFrame(() => {
				focusRepoSearchInput();
			});
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isMobile, setOpen, setOpenMobile, setSelectedTab]);

	useEffect(() => {
		try {
			window.localStorage.setItem(REPO_VIEW_MODE_STORAGE_KEY, viewMode);
		} catch {
			// Ignore storage issues and keep the current session state.
		}
	}, [viewMode]);

	useEffect(() => {
		if (viewMode !== "graph") {
			reactFlowInstanceRef.current = null;
		}
	}, [reactFlowInstanceRef, viewMode]);

	useEffect(() => {
		if (
			previousViewModeRef.current === "list" &&
			viewMode === "graph" &&
			!focusedCommitSha
		) {
			shouldZoomFirstNodeOnGraphInitRef.current = true;
		}

		previousViewModeRef.current = viewMode;
	}, [focusedCommitSha, viewMode]);

	const canResetScope =
		hasActiveFilters || Boolean(searchQuery.trim()) || Boolean(lastSearchQuery);
	const defaultVisibleCommitSha = filteredCommits[0]?.sha ?? nodes[0]?.id;
	const branchOptions = useMemo(
		() => branches.map((branch) => branch.name),
		[branches],
	);
	const handleExit = useCallback(() => {
		navigate("/");
	}, [navigate]);
	const handleRefresh = useCallback(() => {
		void refresh({ force: true });
	}, [refresh]);
	const handleReview = useCallback(() => {
		if (!repoPath) {
			return;
		}

		const storedReviewRefs = getStoredReviewRefs(getReviewRefsStorageKey(repoPath));
		navigate(
			buildReviewRoute(repoPath, {
				mode: "compare",
				baseRef: storedReviewRefs?.baseRef ?? null,
				headRef: storedReviewRefs?.headRef ?? null,
			}),
		);
	}, [navigate, repoPath]);
	const desktopTitleBarChrome = useMemo(
		() => ({
			leading: <RepoTitleBarLeading onToggleSidebar={toggleSidebar} />,
			trailing: (
				<RepoTitleBarTrailing
					viewMode={viewMode}
					filters={filters}
					hasActiveFilters={hasActiveFilters}
					canResetScope={canResetScope}
					branchOptions={branchOptions}
					isLoading={isLoading}
					isIngesting={isIngesting}
					ingestStatus={ingestStatus}
					ingestProgressPercent={ingestProgressPercent}
					ingestProgressLabel={ingestProgressLabel}
					onExit={handleExit}
					onClearFilters={handleClearFilters}
					onFiltersChange={handleFiltersChange}
					onRefresh={handleRefresh}
					onReview={repoPath ? handleReview : undefined}
					onViewModeChange={setViewMode}
				/>
			),
		}),
		[
			branchOptions,
			canResetScope,
			filters,
			handleClearFilters,
			handleExit,
			handleFiltersChange,
			handleRefresh,
			handleReview,
			hasActiveFilters,
			ingestStatus,
			ingestProgressLabel,
			ingestProgressPercent,
			isIngesting,
			isLoading,
			repoPath,
			toggleSidebar,
			viewMode,
		],
	);

	useEffect(() => {
		setDesktopTitleBarChrome(desktopTitleBarChrome);

		return () => {
			setDesktopTitleBarChrome((currentChrome) =>
				currentChrome === desktopTitleBarChrome ? null : currentChrome,
			);
		};
	}, [desktopTitleBarChrome, setDesktopTitleBarChrome]);

	return (
		<>
			<RepoSidebar
				repoPath={repoPath}
				allCommitsCount={commits.length}
				filteredCommits={filteredCommits}
				searchResults={searchResults}
				searchMaxResults={searchMaxResults}
				searchQuery={searchQuery}
				lastSearchQuery={lastSearchQuery}
				searchTotalRankedResults={searchTotalRankedResults}
				searchTotalRelevantResults={searchTotalRelevantResults}
				hasMoreRelevantSearchResults={hasMoreRelevantSearchResults}
				onSearchQueryChange={setSearchQuery}
				onSearch={executeSearch}
				onLoadMoreSearchResults={loadMoreSearchResults}
				searchInputId={REPO_SEARCH_INPUT_ID}
				isSearchLoading={isSearchLoading}
				onCommitClick={handleCommitClick}
				chatMessages={chatMessages}
				isChatLoading={isChatLoading}
				chatError={chatError}
				onSendChatMessage={sendMessage}
			/>

			<SidebarInset className="overflow-hidden bg-transparent">
				<div className="flex h-full flex-col overflow-hidden">
					<div className="min-h-0 flex-1">
						<div className="workspace-panel relative flex h-full flex-col overflow-hidden">
							{pageError ? (
								<div className="p-4">
									<InlineBanner tone="danger" title={pageError} />
								</div>
							) : null}

							<div className="relative min-h-0 flex-1">
								{viewMode === "graph" ? (
									<GraphView
										nodes={nodes}
										edges={edges}
										nodeTypes={nodeTypes}
										onNodesChange={onNodesChange}
										onEdgesChange={onEdgesChange}
										onConnect={onConnect}
										onNodeClick={(_event, node) => {
											handleCommitClick(node.id);
										}}
										onInit={(instance) => {
											reactFlowInstanceRef.current = instance;
											window.requestAnimationFrame(() => {
												if (focusedCommitSha) {
													instance.fitView({
														nodes: [{ id: focusedCommitSha }],
														padding: 0.3,
														duration: 0,
													});
													return;
												}

												if (
													shouldZoomFirstNodeOnGraphInitRef.current &&
													defaultVisibleCommitSha
												) {
													shouldZoomFirstNodeOnGraphInitRef.current = false;
													instance.fitView({
														nodes: [{ id: defaultVisibleCommitSha }],
														padding: 0.3,
														duration: 0,
													});
													return;
												}

												shouldZoomFirstNodeOnGraphInitRef.current = false;

												instance.fitView({ padding: 0.2, duration: 0 });
											});
										}}
										isLoading={isLoading}
										isIngesting={isIngesting}
										ingestStatus={ingestStatus}
										ingestProgressPercent={ingestProgressPercent}
										ingestProgressPhase={ingestProgressPhase}
										ingestProgressLabel={ingestProgressLabel}
										ingestProgressCompletedUnits={ingestProgressCompletedUnits}
										ingestProgressTotalUnits={ingestProgressTotalUnits}
										layoutDirection={layoutDirection}
										toggleLayoutDirection={toggleLayoutDirection}
									/>
								) : (
									<CommitListView
										commits={filteredCommits}
										repoPath={repoPath}
										focusedCommitSha={focusedCommitSha}
										isLoading={isLoading}
										isIngesting={isIngesting}
										ingestStatus={ingestStatus}
										ingestProgressPercent={ingestProgressPercent}
										ingestProgressPhase={ingestProgressPhase}
										ingestProgressLabel={ingestProgressLabel}
										ingestProgressCompletedUnits={ingestProgressCompletedUnits}
										ingestProgressTotalUnits={ingestProgressTotalUnits}
										onCommitSummaryUpdate={handleCommitSummaryUpdate}
									/>
								)}

							</div>
						</div>
					</div>
				</div>
			</SidebarInset>
		</>
	);
}

export function Repo() {
	return (
		<SidebarProvider maxWidthRatio={0.5}>
			<RepoWorkspace />
		</SidebarProvider>
	);
}
