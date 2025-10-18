import { SidebarGroup } from "../sidebar";
import type { Commit } from "@/lib/definitions/repo";

export default function SearchResults({
	filteredCommits,
	onCommitClick,
	query,
}: {
	filteredCommits: Commit[];
	onCommitClick: (sha: string) => void;
	query?: string;
}) {
	return (
		<SidebarGroup>
			<div className="px-3 py-2 h-full">
				<div className="mb-2">
					<h3 className="text-sm font-semibold text-white">
						Search Results ({filteredCommits.length})
					</h3>
					{query && (
						<div className="flex items-start gap-2 mt-1">
							<div
								className="bg-blue-600 text-white rounded-lg px-3 py-2 w-full font-bold"
								title={query}
							>
								<p className="text-xs whitespace-pre-wrap break-words">
									{query}
								</p>
							</div>
						</div>
					)}
				</div>
				<div className="space-y-2 overflow-y-auto custom-scrollbar">
					{filteredCommits.slice(0, 25).map((commit) => (
						<div
							key={commit.sha}
							className="p-2 bg-neutral-800/80 relative rounded-md border border-neutral-700 cursor-pointer hover:bg-neutral-800/20 transition-colors"
							onClick={() => onCommitClick?.(commit.sha)}
						>
							<div className="absolute top-2 left-2 text-xs text-gray-300 font-mono mb-1">
								{commit.sha.substring(0, 8)}
							</div>
							<div className="absolute top-2 right-2 text-xs text-gray-400">
								{new Date(commit.time * 1000).toLocaleDateString()}
							</div>
							<div className="text-xs text-white line-clamp-2 mt-6">
								{commit.message}
							</div>
						</div>
					))}
					{filteredCommits.length > 25 && (
						<div className="text-xs text-gray-400 text-center py-2">
							+{filteredCommits.length - 25} more commits
						</div>
					)}
				</div>
			</div>
		</SidebarGroup>
	);
}
