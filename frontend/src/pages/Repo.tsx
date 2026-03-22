import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import CommitNode from "@/components/ui/custom/CommitNode";
import { GraphView } from "@/components/ui/custom/GraphView";
import { RepoSidebar } from "@/components/ui/custom/RepoSidebar";
import { RepoToolbar } from "@/components/ui/custom/RepoToolbar";
import Search from "@/components/ui/custom/Search";
import { InlineBanner } from "@/components/ui/inline-banner";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { useChat } from "@/hooks/useChat";
import { useCommitGraph } from "@/hooks/useCommitGraph";
import { useRepoData } from "@/hooks/useRepoData";
import { useSidebarTab } from "@/hooks/useSidebarTab";
import { readRepoPathFromSearchParams } from "@/lib/repoPaths";

const nodeTypes = {
	commit: CommitNode,
};

const REPO_SEARCH_INPUT_ID = "repo-search-input";

function focusRepoSearchInput() {
	const input = document.getElementById(REPO_SEARCH_INPUT_ID);
	if (input instanceof HTMLInputElement) {
		input.focus();
		input.select();
	}
}

function RepoWorkspace() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { isMobile, setOpen, setOpenMobile } = useSidebar();
	const { setSelectedTab } = useSidebarTab();
	const repoPath = readRepoPathFromSearchParams(searchParams);

	const {
		commits,
		branches,
		isLoading,
		isIngesting,
		ingestStatus,
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
		lastSearchQuery,
		layoutDirection,
		toggleLayoutDirection,
		onNodesChange,
		onEdgesChange,
		onConnect,
		handleCommitClick,
		handleFiltersChange,
		handleSearchResults,
		handleClearFilters,
		reactFlowInstanceRef,
	} = useCommitGraph({ commits, branches });

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

	return (
		<>
			<RepoSidebar
				repoPath={repoPath}
				filteredCommits={filteredCommits}
				filteredBranches={branches}
				lastSearchQuery={lastSearchQuery}
				onFiltersChange={handleFiltersChange}
				onCommitClick={handleCommitClick}
				chatMessages={chatMessages}
				isChatLoading={isChatLoading}
				chatError={chatError}
				onSendChatMessage={sendMessage}
			/>

			<SidebarInset className="overflow-hidden bg-transparent">
				<div className="flex h-full flex-col overflow-hidden">
					<RepoToolbar
						repoPath={repoPath}
						isLoading={isLoading}
						isIngesting={isIngesting}
						ingestStatus={ingestStatus}
						onExit={() => navigate("/")}
						onClearFilters={handleClearFilters}
						onRefresh={() => void refresh({ force: true })}
					/>

					<div className="min-h-0 flex-1 pt-4">
						<div className="workspace-panel relative flex h-full flex-col overflow-hidden">
							{pageError ? (
								<div className="p-4">
									<InlineBanner tone="danger" title={pageError} />
								</div>
							) : null}

							<div className="relative min-h-0 flex-1">
								<GraphView
									nodes={nodes}
									edges={edges}
									nodeTypes={nodeTypes}
									onNodesChange={onNodesChange}
									onEdgesChange={onEdgesChange}
									onConnect={onConnect}
									onInit={(instance) => {
										reactFlowInstanceRef.current = instance;
									}}
									isLoading={isLoading}
									isIngesting={isIngesting}
									ingestStatus={ingestStatus}
									layoutDirection={layoutDirection}
									toggleLayoutDirection={toggleLayoutDirection}
								/>

								<div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-4">
									<div className="pointer-events-auto w-full max-w-3xl">
										<Search
											inputId={REPO_SEARCH_INPUT_ID}
											repoPath={repoPath ?? ""}
											onSearchResults={handleSearchResults}
										/>
									</div>
								</div>
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
		<SidebarProvider>
			<RepoWorkspace />
		</SidebarProvider>
	);
}
