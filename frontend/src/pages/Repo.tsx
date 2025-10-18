import { useParams, useNavigate } from "react-router-dom";
import { useRepoData } from "../hooks/useRepoData";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { useCommitGraph } from "@/hooks/useCommitGraph";
import { GraphView } from "@/components/ui/custom/GraphView";
import CommitNode from "@/components/ui/custom/CommitNode";

const nodeTypes = {
	commit: CommitNode,
};

export function Repo() {
	const { owner, repo_name } = useParams();

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

	return (
		<SidebarProvider>
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
