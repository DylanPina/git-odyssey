import { GitCommit, ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import type { Citation } from "@/lib/definitions/chat";

interface CitationsProps {
  citedCommits: Citation[];
  onCommitClick?: (commitSha: string) => void;
  className?: string;
}

const CITATIONS_TOGGLE_KEY = "git-odyssey-citations-expanded";

export function Citations({
  citedCommits,
  onCommitClick,
  className,
}: CitationsProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CITATIONS_TOGGLE_KEY);
      if (stored !== null) {
        setIsExpanded(JSON.parse(stored));
      }
    } catch {
      // Ignore storage issues and keep the default.
    }
  }, []);

  const handleToggle = () => {
    const nextState = !isExpanded;
    setIsExpanded(nextState);
    try {
      localStorage.setItem(CITATIONS_TOGGLE_KEY, JSON.stringify(nextState));
    } catch {
      // Ignore storage issues and keep the current session state.
    }
  };

  const validCommits = citedCommits.filter(
    (commit) => commit?.sha && typeof commit.sha === "string"
  );

  if (validCommits.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-2 border-t border-border-subtle pt-3", className)}>
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary transition-colors hover:bg-control hover:text-text-secondary"
        title={isExpanded ? "Hide cited commits" : "Show cited commits"}
      >
        {isExpanded ? (
          <ChevronDown className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}
        <GitCommit className="size-4" />
        Cited Commits ({validCommits.length})
      </button>

      {isExpanded ? (
        <div className="space-y-2">
          {validCommits.map((citedCommit) => (
            <button
              key={citedCommit.sha}
              type="button"
              onClick={() => onCommitClick?.(citedCommit.sha)}
              className="workspace-panel flex w-full items-start justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-control/60"
              title={`View commit ${citedCommit.sha}`}
            >
              <div className="min-w-0">
                <div className="font-mono text-xs text-[#c7d8ff]">
                  {citedCommit.sha.substring(0, 8)}
                </div>
                {citedCommit.message ? (
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-text-secondary">
                    {citedCommit.message}
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 font-mono text-[11px] text-text-tertiary">
                {(100 * (citedCommit.similarity || 0)).toFixed(0)}%
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
