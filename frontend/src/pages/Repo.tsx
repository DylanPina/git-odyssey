import { useParams, useNavigate } from "react-router-dom";
import CommitNode from "@/components/ui/custom/CommitNode";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { RepoSidebar } from "@/components/ui/custom/RepoSidebar";
import { useChat } from "@/hooks/useChat";
import { useRepoData } from "@/hooks/useRepoData";
import { useCommitGraph } from "@/hooks/useCommitGraph";
import { GraphView } from "@/components/ui/custom/GraphView";

const nodeTypes = {
	commit: CommitNode,
};

export function Repo() {
	const { owner, repo_name } = useParams();
	const navigate = useNavigate();

	// Data layer
	const { commits, branches, isLoading, isIngesting, ingestStatus } =
		useRepoData({
			owner,
			repoName: repo_name,
		});

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
		owner,
		repoName: repo_name,
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
					repoUrl={`https://github.com/${owner}/${repo_name}`}
					onSearchResults={handleSearchResults}
				/>
			</SidebarInset>
		</SidebarProvider>
	);
}
