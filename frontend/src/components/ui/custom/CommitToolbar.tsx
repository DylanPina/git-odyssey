import { ChevronRight, ChevronsDown, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getRepoPathBreadcrumbs } from "@/lib/repoPaths";

type CommitToolbarProps = {
  repoPath?: string | null;
  shortSha?: string;
  detailLabel?: string;
  onExit?: () => void;
  onCollapseAll?: () => void;
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

export function CommitToolbar({
  repoPath,
  shortSha,
  detailLabel,
  onExit,
  onCollapseAll,
}: CommitToolbarProps) {
  const breadcrumbs = getRepoBreadcrumbs(repoPath);
  const commitLabel = detailLabel || shortSha || null;
  const breadcrumbTitle =
    repoPath && commitLabel
      ? `${repoPath} @ ${commitLabel}`
      : repoPath || commitLabel || "Repository";

  return (
    <header className="workspace-header-frame sticky top-0 z-20 flex h-[var(--header-height)] items-center gap-3 overflow-hidden px-3 py-2 backdrop-blur-md">
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden whitespace-nowrap"
            title={breadcrumbTitle}
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
            {commitLabel ? (
              <>
                <ChevronRight className="size-3 shrink-0 text-text-tertiary" />
                <span className="shrink-0 font-mono text-sm leading-none text-text-primary">
                  {commitLabel}
                </span>
              </>
            ) : null}
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
                onClick={onCollapseAll}
                disabled={!onCollapseAll}
                aria-label="Collapse all files"
              >
                <ChevronsDown className="size-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Collapse all files</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="toolbar"
                size="toolbar-icon"
                onClick={onExit}
                disabled={!onExit}
                aria-label="Exit commit view"
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

export default CommitToolbar;
