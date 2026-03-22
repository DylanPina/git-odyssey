import { useEffect, useMemo, useRef } from "react";
import { ArrowUpRight, List } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { CommitSummaryButton } from "@/components/ui/custom/CommitSummaryButton";
import { LoadingOverlay } from "@/components/ui/custom/LoadingOverlay";
import { EmptyState } from "@/components/ui/empty-state";
import type { Commit } from "@/lib/definitions/repo";
import { buildCommitRoute } from "@/lib/repoPaths";
import { cn } from "@/lib/utils";

type CommitListViewProps = {
  commits: Commit[];
  repoPath?: string | null;
  focusedCommitSha: string | null;
  isLoading: boolean;
  isIngesting: boolean;
  ingestStatus: string;
  onCommitClick: (commitSha: string) => void;
  onCommitSummaryUpdate: (commitSha: string, summary: string) => void;
};

function getCommitMessageParts(message?: string | null) {
  const lines = (message || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    subject: lines[0] || null,
    body: lines.slice(1).join(" ") || null,
  };
}

function formatCommitTime(timestamp?: number | null) {
  if (!timestamp) {
    return "Unknown date";
  }

  return new Date(timestamp * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function CommitMetaItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-full border border-border-subtle bg-control px-2.5 py-1 text-xs text-text-secondary">
      <span className="text-text-tertiary">{label}:</span>{" "}
      <span
        className={cn(
          "break-all",
          mono ? "font-mono text-[11px] text-text-primary" : "text-text-primary"
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function CommitListView({
  commits,
  repoPath,
  focusedCommitSha,
  isLoading,
  isIngesting,
  ingestStatus,
  onCommitClick,
  onCommitSummaryUpdate,
}: CommitListViewProps) {
  const navigate = useNavigate();
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});

  const sortedCommits = useMemo(
    () =>
      [...commits].sort((left, right) => {
        const timeDifference = (right.time || 0) - (left.time || 0);
        if (timeDifference !== 0) {
          return timeDifference;
        }

        return left.sha.localeCompare(right.sha);
      }),
    [commits]
  );

  useEffect(() => {
    if (!focusedCommitSha) {
      return;
    }

    rowRefs.current[focusedCommitSha]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [focusedCommitSha, sortedCommits]);

  return (
    <div className="relative h-full">
      <div className="workspace-scrollbar h-full overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
        {sortedCommits.length === 0 ? (
          <div className="flex min-h-full items-center justify-center py-8">
            <EmptyState
              icon={<List className="size-4" />}
              title="No visible commits"
              description="Try clearing filters or searching with a broader phrase to bring matching commits back into view."
              className="max-w-md items-center text-center"
            />
          </div>
        ) : (
          <div className="space-y-3">
            {sortedCommits.map((commit) => {
              const { subject, body } = getCommitMessageParts(commit.message);
              const authorLabel = commit.author || "Unknown author";
              const emailLabel = commit.email?.trim() || null;
              const parentLabel =
                commit.parents.length > 0 ? commit.parents.join(", ") : "none";
              const effectiveRepoPath = repoPath || commit.repo_path;
              const isSelected = focusedCommitSha === commit.sha;

              return (
                <article
                  key={commit.sha}
                  ref={(node) => {
                    rowRefs.current[commit.sha] = node;
                  }}
                  role="button"
                  tabIndex={0}
                  data-selected={isSelected}
                  aria-pressed={isSelected}
                  onClick={() => onCommitClick(commit.sha)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onCommitClick(commit.sha);
                    }
                  }}
                  className="workspace-panel commit-list-row scroll-mt-4 cursor-pointer px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-sm font-medium leading-6 text-text-primary sm:text-[15px]">
                        {subject || `Commit ${commit.sha.slice(0, 12)}`}
                      </div>
                      {body ? (
                        <div className="mt-1 line-clamp-2 text-sm leading-6 text-text-secondary">
                          {body}
                        </div>
                      ) : null}
                    </div>

                    <div
                      className="flex shrink-0 items-center gap-2"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <CommitSummaryButton
                        sha={commit.sha}
                        summary={commit.summary}
                        onUpdateSummary={onCommitSummaryUpdate}
                      />

                      <Button
                        variant="toolbar"
                        size="sm"
                        onClick={() =>
                          navigate(buildCommitRoute(effectiveRepoPath, commit.sha))
                        }
                        aria-label={`Open commit ${commit.sha}`}
                        title={`Open commit ${commit.sha}`}
                      >
                        Open commit
                        <ArrowUpRight className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="commit-list-meta mt-3">
                    <CommitMetaItem label="SHA" value={commit.sha} mono />
                    <CommitMetaItem label="Author" value={authorLabel} />
                    {emailLabel ? (
                      <CommitMetaItem label="Email" value={emailLabel} mono />
                    ) : null}
                    <CommitMetaItem
                      label="Date"
                      value={formatCommitTime(commit.time)}
                    />
                    <CommitMetaItem
                      label="Repo"
                      value={commit.repo_path}
                      mono
                    />
                    <CommitMetaItem label="Parents" value={parentLabel} mono />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <LoadingOverlay
        isVisible={isLoading || isIngesting}
        isIngesting={isIngesting}
        ingestStatus={ingestStatus}
      />
    </div>
  );
}
