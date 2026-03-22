import { Search } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { SidebarGroup } from "@/components/ui/sidebar";
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
  const visibleCommits = filteredCommits.slice(0, 25);

  return (
    <SidebarGroup className="min-h-0 min-w-0 flex-1 py-4">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-x-hidden">
        <div className="space-y-2">
          <div className="workspace-section-label">
            {query ? "Search Results" : "Visible Commits"}
          </div>
          <div className="text-sm font-medium text-text-primary">
            {filteredCommits.length} commit{filteredCommits.length === 1 ? "" : "s"}
          </div>
        </div>

        {query ? (
          <div className="workspace-panel flex min-w-0 items-start gap-3 overflow-hidden px-3 py-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-border-subtle bg-control text-text-secondary">
              <Search className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-tertiary">
                Query
              </div>
              <div className="mt-1 break-words text-sm leading-6 text-text-secondary">
                {query}
              </div>
            </div>
          </div>
        ) : null}

        {visibleCommits.length === 0 ? (
          <EmptyState
            icon={<Search className="size-4" />}
            title={query ? "No matching commits" : "No commits available"}
            description={
              query
                ? "Try a different phrase, path, SHA fragment, or summary term."
                : "Once repository history is available, matching commits will show up here."
            }
          />
        ) : (
          <div className="workspace-scrollbar min-h-0 min-w-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto pr-1">
            {visibleCommits.map((commit) => (
              <button
                key={commit.sha}
                type="button"
                className="workspace-panel flex min-w-0 w-full items-start justify-between gap-3 overflow-hidden px-3 py-3 text-left transition-colors hover:bg-control/60"
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
            {filteredCommits.length > 25 ? (
              <div className="px-1 text-xs text-text-tertiary">
                Showing the first 25 matches. {filteredCommits.length - 25} more commit
                {filteredCommits.length - 25 === 1 ? "" : "s"} remain in the current result set.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </SidebarGroup>
  );
}
