import { ChevronRight, Database, LogOut, RefreshCw, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getRepoPathBreadcrumbs } from "@/lib/repoPaths";

type RepoToolbarProps = {
  repoPath?: string | null;
  isLoading?: boolean;
  isIngesting?: boolean;
  ingestStatus?: string;
  onExit?: () => void;
  onClearFilters?: () => void;
  onRefresh?: () => void;
};

function getRepoBreadcrumbs(repoPath?: string | null) {
  if (!repoPath) {
    return [{ label: "Repository", current: true }];
  }

  const segments = getRepoPathBreadcrumbs(repoPath);

  return segments.map((segment, index) => ({
    label: segment,
    current: index === segments.length - 1,
  }));
}

export function RepoToolbar({
  repoPath,
  isLoading,
  isIngesting,
  ingestStatus,
  onExit,
  onClearFilters,
  onRefresh,
}: RepoToolbarProps) {
  const breadcrumbs = getRepoBreadcrumbs(repoPath);

  const statusTone = isIngesting
    ? "accent"
    : isLoading
      ? "accent"
      : ingestStatus
        ? "success"
        : "neutral";
  const statusLabel = isIngesting
    ? "Refreshing"
    : isLoading
      ? "Fetching"
      : ingestStatus
        ? "Ready"
        : "Idle";

  return (
    <header className="workspace-header-frame sticky top-0 z-20 flex h-[var(--header-height)] items-center gap-3 overflow-hidden px-3 py-2 backdrop-blur-md">
      <div className="flex shrink-0 items-center gap-2">
        <SidebarTrigger />
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden whitespace-nowrap"
            title={repoPath ?? undefined}
          >
            {breadcrumbs.map((crumb, index) => (
              <div
                key={`${crumb.label}-${index}`}
                className="flex min-w-0 shrink items-center gap-1.5 overflow-hidden"
              >
                {index > 0 ? (
                  <ChevronRight className="size-3 shrink-0 text-text-tertiary" />
                ) : null}
                <span
                  className={[
                    "block truncate font-mono text-sm leading-none",
                    crumb.current
                      ? "max-w-[18rem] text-text-primary"
                      : "max-w-[10rem] text-text-tertiary",
                  ].join(" ")}
                >
                  {crumb.label}
                </span>
              </div>
            ))}
          </div>
        </TooltipTrigger>
        {repoPath ? <TooltipContent>{repoPath}</TooltipContent> : null}
      </Tooltip>

      <div className="flex shrink-0 items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="toolbar"
                size="toolbar-icon"
                onClick={onClearFilters}
                disabled={!onClearFilters}
                aria-label="Show all commits"
              >
                <RotateCcw className="size-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Show all commits</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="toolbar"
                size="toolbar-icon"
                onClick={onRefresh}
                disabled={!onRefresh || isIngesting}
                aria-label="Refresh from disk"
              >
                <RefreshCw className="size-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Refresh from disk</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <StatusPill
                tone={statusTone}
                pulse={Boolean(isLoading || isIngesting)}
                icon={<Database className="size-3" />}
                className="cursor-default"
              >
                {statusLabel}
              </StatusPill>
            </div>
          </TooltipTrigger>
          <TooltipContent>{ingestStatus || "Repository status"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="toolbar"
                size="toolbar-icon"
                onClick={onExit}
                disabled={!onExit}
                aria-label="Exit repository"
              >
                <LogOut className="size-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Exit</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
