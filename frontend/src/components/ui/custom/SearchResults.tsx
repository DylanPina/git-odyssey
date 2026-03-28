import { EmptyState } from "@/components/ui/empty-state";
import { SidebarGroup } from "@/components/ui/sidebar";
import type { Commit } from "@/lib/definitions/repo";

export default function SearchResults({
	allCommitsCount,
	filteredCommits,
	onCommitClick,
	query: _query,
}: {
	allCommitsCount: number;
	filteredCommits: Commit[];
	onCommitClick: (sha: string) => void;
	query?: string;
}) {
	const visibleCommits = filteredCommits.slice(0, 25);
	const displayedCount = filteredCommits.length;
	const totalCount = Math.max(allCommitsCount, displayedCount);

	return (
		<SidebarGroup className="min-h-0 min-w-0 flex-1 pt-4">
			<div className="workspace-scrollbar flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto pr-1">
				<div className="text-sm text-text-primary">
					Showing {displayedCount} of {totalCount} commits
				</div>

				{visibleCommits.length === 0 ? (
					<EmptyState
						title="No matching commits"
						description="Try a different phrase, path, SHA fragment, or summary term."
					/>
				) : (
					<div className="space-y-2">
						{visibleCommits.map((commit) => (
							<button
								key={commit.sha}
								type="button"
								className="workspace-panel flex w-full min-w-0 items-start justify-between gap-3 overflow-hidden px-3 py-3 text-left transition-colors hover:bg-control/60"
								onClick={() => onCommitClick?.(commit.sha)}
							>
								<div className="min-w-0 flex-1">
									<div className="font-mono text-xs text-[#c7d8ff]">
										{commit.sha.substring(0, 8)}
									</div>
									<div className="mt-1 line-clamp-2 text-sm leading-6 text-text-primary">
										{commit.message}
									</div>
								</div>
								<div className="shrink-0 font-mono text-[11px] text-text-tertiary">
									{new Date(commit.time * 1000).toLocaleDateString()}
								</div>
							</button>
						))}
						{displayedCount > 25 ? (
							<div className="px-1 text-xs text-text-tertiary">
								Showing the first 25 matches. {displayedCount - 25} more commit
								{displayedCount - 25 === 1 ? "" : "s"} remain in the current
								result set.
							</div>
						) : null}
					</div>
				)}
			</div>
		</SidebarGroup>
	);
}
