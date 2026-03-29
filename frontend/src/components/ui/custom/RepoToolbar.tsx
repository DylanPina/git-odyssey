import {
  Database,
  Filter as FilterIcon,
  GitPullRequest,
  LogOut,
  PanelLeftIcon,
  RefreshCw,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import Filters from "@/components/ui/custom/Filters";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { FilterFormData } from "@/lib/filter-utils";

export type RepoViewMode = "graph" | "list";

type RepoTitleBarTrailingProps = {
  viewMode?: RepoViewMode;
  filters: FilterFormData;
  hasActiveFilters?: boolean;
  canResetScope?: boolean;
  branchOptions?: string[];
  isLoading?: boolean;
  isIngesting?: boolean;
  ingestStatus?: string;
  onExit?: () => void;
  onClearFilters?: () => void;
  onFiltersChange?: (filters: FilterFormData) => void;
  onRefresh?: () => void;
  onReview?: () => void;
  onViewModeChange?: (viewMode: RepoViewMode) => void;
};

export function RepoTitleBarLeading({
  onToggleSidebar,
}: {
  onToggleSidebar?: () => void;
}) {
  return (
    <Button
      variant="toolbar"
      size="toolbar-icon"
      onClick={onToggleSidebar}
      disabled={!onToggleSidebar}
      aria-label="Toggle Sidebar"
      aria-keyshortcuts="Meta+B Control+B"
    >
      <PanelLeftIcon className="size-4" />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
}

export function RepoTitleBarTrailing({
  viewMode,
  filters,
  hasActiveFilters = false,
  canResetScope = false,
  branchOptions = [],
  isLoading,
  isIngesting,
  ingestStatus,
  onExit,
  onClearFilters,
  onFiltersChange,
  onRefresh,
  onReview,
  onViewModeChange,
}: RepoTitleBarTrailingProps) {
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

  const handleViewModeChange = (nextViewMode: string) => {
    if (!onViewModeChange) {
      return;
    }

    if (nextViewMode === "graph" || nextViewMode === "list") {
      onViewModeChange(nextViewMode);
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      {viewMode ? (
        <ToggleGroup
          type="single"
          size="sm"
          value={viewMode}
          onValueChange={handleViewModeChange}
          aria-label="Repository view mode"
        >
          <ToggleGroupItem value="graph" aria-label="Graph view">
            Graph
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view">
            List
          </ToggleGroupItem>
        </ToggleGroup>
      ) : null}

      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              variant="toolbar"
              size="toolbar-icon"
              onClick={onReview}
              disabled={!onReview}
              aria-label="Open review page"
            >
              <GitPullRequest className="size-4" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Review branches</TooltipContent>
      </Tooltip>

      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant={hasActiveFilters ? "accent" : "toolbar"}
                size="toolbar-icon"
                aria-label="Open commit filters"
              >
                <FilterIcon className="size-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Filters</TooltipContent>
        </Tooltip>
        <PopoverContent
          align="end"
          collisionPadding={16}
          className="flex w-[min(28rem,calc(100vw-2rem))] max-h-(--radix-popover-content-available-height) flex-col overflow-hidden p-0"
        >
          <div className="shrink-0 border-b border-border-subtle px-4 py-4">
            <div className="workspace-section-label">Filters</div>
            <p className="mt-1 text-sm font-medium text-text-primary">
              Narrow the visible commit set
            </p>
          </div>
          <div className="workspace-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
            <Filters
              values={filters}
              onChange={onFiltersChange}
              branches={branchOptions}
            />
          </div>
          <div className="shrink-0 border-t border-border-subtle px-4 py-4">
            <Button
              variant="toolbar"
              size="sm"
              className="w-full justify-center gap-2"
              onClick={onClearFilters}
              disabled={!onClearFilters || !canResetScope}
            >
              <RotateCcw className="size-4" />
              Reset Filters
            </Button>
            <p className="mt-2 text-xs leading-5 text-text-tertiary">
              Clears active filters and returns the repository to the full
              commit view.
            </p>
          </div>
        </PopoverContent>
      </Popover>

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
  );
}
