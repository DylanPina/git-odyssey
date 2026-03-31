import { useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { EmptyState } from "@/components/ui/empty-state";
import { SidebarGroup } from "@/components/ui/sidebar";
import { SearchResultDiffPreview } from "@/components/ui/custom/SearchResultDiffPreview";
import type {
  FilterDisplayMatch,
  FilterSearchResult,
} from "@/lib/definitions/api";
import type { Commit } from "@/lib/definitions/repo";
import type { DiffSearchContext } from "@/lib/diff";
import { buildReviewRoute } from "@/lib/repoPaths";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlightedText(
  value: string,
  query?: string,
  enabled = false,
): ReactNode {
  const normalizedQuery = query?.trim();
  if (!enabled || !normalizedQuery) {
    return value;
  }

  const parts = value.split(new RegExp(`(${escapeRegExp(normalizedQuery)})`, "gi"));
  return parts.map((part, index) =>
    part.toLowerCase() === normalizedQuery.toLowerCase() ? (
      <mark key={`${part}-${index}`} className="workspace-search-highlight">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

function getMatchBadge(match?: FilterDisplayMatch | null): string | null {
  if (!match) {
    return null;
  }

  if (match.highlight_strategy === "exact_query") {
    return null;
  }

  if (match.match_type === "hunk") {
    return "Hunk Match";
  }

  if (match.match_type === "file_change") {
    return "File Match";
  }

  return "Commit Match";
}

function getSearchContext(
  result: FilterSearchResult,
  query?: string,
): DiffSearchContext | null {
  const match = result.display_match;
  if (!match) {
    return null;
  }

  return {
    query: query?.trim() || null,
    matchType: match.match_type,
    filePath: match.file_path ?? null,
    newStart: match.new_start ?? null,
    oldStart: match.old_start ?? null,
    highlightStrategy: match.highlight_strategy,
  };
}

export default function SearchResults(props: {
  allCommitsCount: number;
  repoPath?: string | null;
  filteredCommits: Commit[];
  searchResults?: FilterSearchResult[];
  onCommitClick: (sha: string) => void;
  query?: string;
}) {
  const {
    allCommitsCount,
    repoPath,
    filteredCommits,
    searchResults = [],
    onCommitClick,
    query,
  } = props;
  const navigate = useNavigate();
  const commitBySha = useMemo(
    () =>
      new Map(filteredCommits.map((commit) => [commit.sha, commit] as const)),
    [filteredCommits],
  );
  const hasSearchResults = Boolean(query?.trim());
  const visibleSearchResults = searchResults.slice(0, 25);
  const visibleCommits = filteredCommits.slice(0, 25);
  const displayedCount = hasSearchResults ? searchResults.length : filteredCommits.length;
  const totalCount = Math.max(allCommitsCount, displayedCount);

  return (
    <SidebarGroup className="min-h-0 min-w-0 flex-1 pt-4">
      <div className="workspace-scrollbar flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto pr-1">
        <div className="text-sm text-text-primary">
          Showing {displayedCount} of {totalCount} commits
        </div>

        {displayedCount === 0 ? (
          <EmptyState
            title="No matching commits"
            description="Try a different phrase, path, SHA fragment, or summary term."
          />
        ) : hasSearchResults ? (
          <div className="space-y-2">
            {visibleSearchResults.map((result) => {
              const commit = commitBySha.get(result.sha);
              const match = result.display_match;
              const badgeLabel = getMatchBadge(match);
              const shouldHighlightPreview =
                match?.highlight_strategy === "exact_query";
              const preview = match?.preview?.trim() || null;
              const isDiffPreview = match?.preview_kind === "diff";
              const handleOpenResult = () => {
                if (!repoPath) {
                  onCommitClick(result.sha);
                  return;
                }

                navigate(
                  buildReviewRoute(repoPath, {
                    mode: "commit",
                    commitSha: result.sha,
                    searchContext: getSearchContext(result, query),
                  }),
                );
              };

              return (
                <button
                  key={result.sha}
                  type="button"
                  className="workspace-panel flex w-full min-w-0 flex-col gap-2 overflow-hidden px-3 py-3 text-left transition-colors hover:bg-control/60"
                  onClick={handleOpenResult}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-xs text-[#c7d8ff]">
                        {result.sha.substring(0, 8)}
                      </div>
                      <div className="mt-1 line-clamp-2 text-sm leading-6 text-text-primary">
                        {commit?.message || `Commit ${result.sha.substring(0, 8)}`}
                      </div>
                    </div>
                    <div className="shrink-0 font-mono text-[11px] text-text-tertiary">
                      {commit?.time
                        ? new Date(commit.time * 1000).toLocaleDateString()
                        : null}
                    </div>
                  </div>

                  {badgeLabel || match?.file_path ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {badgeLabel ? (
                        <span className="rounded-full border border-[rgba(122,162,255,0.24)] bg-[rgba(122,162,255,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-primary">
                          {badgeLabel}
                        </span>
                      ) : null}
                      {match?.file_path ? (
                        <span className="truncate font-mono text-[11px] text-text-secondary">
                          {match.file_path}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {preview ? (
                    isDiffPreview ? (
                      <SearchResultDiffPreview value={preview} />
                    ) : (
                      <div className="line-clamp-3 text-xs leading-5 text-text-secondary">
                        {renderHighlightedText(preview, query, shouldHighlightPreview)}
                      </div>
                    )
                  ) : null}
                </button>
              );
            })}

            {displayedCount > 25 ? (
              <div className="px-1 text-xs text-text-tertiary">
                Showing the first 25 matches. {displayedCount - 25} more commit
                {displayedCount - 25 === 1 ? "" : "s"} remain in the current
                result set.
              </div>
            ) : null}
          </div>
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
