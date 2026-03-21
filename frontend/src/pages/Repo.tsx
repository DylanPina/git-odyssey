import { useNavigate, useSearchParams } from "react-router-dom";
import CommitNode from "@/components/ui/custom/CommitNode";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { RepoSidebar } from "@/components/ui/custom/RepoSidebar";
import { useChat } from "@/hooks/useChat";
import { useRepoData } from "@/hooks/useRepoData";
import { useCommitGraph } from "@/hooks/useCommitGraph";
import { RepoToolbar } from "@/components/ui/custom/RepoToolbar";
import { GraphView } from "@/components/ui/custom/GraphView";
import { readRepoPathFromSearchParams } from "@/lib/repoPaths";

const nodeTypes = {
	commit: CommitNode,
};

export function Repo() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const repoPath = readRepoPathFromSearchParams(searchParams);

	// Data layer
	const { commits, branches, isLoading, isIngesting, ingestStatus, error, refresh } =
		useRepoData({
			repoPath,
		});
	const pageError = repoPath ? error : "No Git project path was provided.";

	// Graph/view layer
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

	// Chat functionality
	const { chatMessages, isChatLoading, chatError, sendMessage } = useChat({
		repoPath,
		filteredCommits,
	});

	return (
		<SidebarProvider>
			<RepoSidebar
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
			<SidebarInset className="w-screen h-screen relative">
				<RepoToolbar
					repoPath={repoPath}
					isLoading={isLoading}
					isIngesting={isIngesting}
					ingestStatus={ingestStatus}
					onExit={() => navigate("/")}
					onClearFilters={handleClearFilters}
					onRefresh={() => void refresh({ force: true })}
				/>
				{pageError && (
					<div className="absolute top-20 left-4 z-10 max-w-xl rounded-lg border border-red-400/30 bg-red-950/50 px-4 py-3 text-sm text-red-200">
						{pageError}
					</div>
				)}
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
					repoPath={repoPath ?? ""}
					onSearchResults={handleSearchResults}
				/>
			</SidebarInset>
		</SidebarProvider>
	);
}
