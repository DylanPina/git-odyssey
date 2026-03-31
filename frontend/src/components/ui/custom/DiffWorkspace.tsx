import {
  forwardRef,
  useCallback,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

import { CommitFilePanel } from "@/components/ui/custom/CommitFilePanel";
import { CommitFileTree } from "@/components/ui/custom/CommitFileTree";
import { LoadingOverlay } from "@/components/ui/custom/LoadingOverlay";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineBanner } from "@/components/ui/inline-banner";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  buildFileChangeCodeSearchIndex,
  fileChangeMatchesFileQuery,
  getFileChangeLabelPath,
  type DiffCodeSearchFileIndex,
  type DiffCodeSearchMatch,
  type DiffNavigationTarget,
  type DiffSelectionContext,
  type DiffSearchContext,
  type DiffViewerSide,
} from "@/lib/diff";
import type { FileChange, FileHunk } from "@/lib/definitions/repo";
import { cn } from "@/lib/utils";

type SummaryState = { loading: boolean; text?: string; error?: string };

export type DiffWorkspaceHandle = {
  collapseAll: () => void;
  focusLocation: (target: {
    filePath: string;
    newStart?: number | null;
    oldStart?: number | null;
  }) => void;
  toggleFileTree: () => void;
};

type DiffWorkspaceSummaryActions = {
  fileSummaries: Record<string, SummaryState>;
  summaryOpen: Record<string, boolean>;
  onToggleFileSummary: (summaryKey: string) => void;
  onSummarizeFile: (fileChange: FileChange) => void;
  hunkSummaries: Record<string, SummaryState>;
  hunkSummaryOpen: Record<string, boolean>;
  onToggleHunkSummary: (hunkKey: string) => void;
  onSummarizeHunk: (hunk: FileHunk) => void;
};

type DiffWorkspaceResizablePanel = {
  preferredWidth: number;
  defaultWidth: number;
  minWidth: number;
  onPreferredWidthChange: (width: number) => void;
};

type DiffWorkspaceDesktopResize = {
  minContentWidth: number;
  fileTree: DiffWorkspaceResizablePanel;
  rightRail: DiffWorkspaceResizablePanel;
};

type DiffWorkspaceProps = {
  repoPath?: string | null;
  viewerId: string;
  files: FileChange[];
  isLoading?: boolean;
  error?: string | null;
  topContent?: ReactNode;
  chromeDensity?: "default" | "compact";
  fileTreeCollapsible?: boolean;
  fileSearchInputId: string;
  codeSearchInputId: string;
  fileSearchPlaceholder?: string;
  codeSearchPlaceholder?: string;
  emptyTitle: string;
  emptyDescription?: string;
  summaryActions?: DiffWorkspaceSummaryActions;
  rightRail?: ReactNode;
  isRightRailOpen?: boolean;
  isRightRailFullscreen?: boolean;
  rightRailCollapsedSummary?: ReactNode;
  onInjectSelection?: (selection: DiffSelectionContext) => void;
  desktopResize?: DiffWorkspaceDesktopResize;
  searchContext?: DiffSearchContext | null;
};

const FILE_TREE_COLLAPSED_DESKTOP_WIDTH = 68;
const RIGHT_RAIL_COLLAPSED_DESKTOP_WIDTH = 60;
const DESKTOP_RESIZE_STEP = 16;

type DiffWorkspaceCodeNavigationTarget = DiffCodeSearchMatch & {
  token: number;
  focusEditor?: boolean;
};

type DiffWorkspaceContextHighlight = {
  filePath: string;
  side?: DiffViewerSide;
  line?: number | null;
  highlightStrategy: DiffSearchContext["highlightStrategy"];
};
type DiffMode = "inline" | "side-by-side";

function clampPanelWidth(width: number, minWidth: number, maxWidth: number) {
  return Math.min(maxWidth, Math.max(minWidth, width));
}

function resolveDesktopPanelWidths({
  availableWidth,
  minContentWidth,
  fileTree,
  rightRail,
}: {
  availableWidth: number | null;
  minContentWidth: number;
  fileTree: {
    isVisible: boolean;
    isExpanded: boolean;
    preferredWidth: number;
    minWidth: number;
  };
  rightRail: {
    isVisible: boolean;
    isExpanded: boolean;
    preferredWidth: number;
    minWidth: number;
  };
}) {
  let nextFileTreeWidth = fileTree.isVisible
    ? fileTree.isExpanded
      ? Math.max(fileTree.minWidth, fileTree.preferredWidth)
      : FILE_TREE_COLLAPSED_DESKTOP_WIDTH
    : 0;
  let nextRightRailWidth = rightRail.isVisible
    ? rightRail.isExpanded
      ? Math.max(rightRail.minWidth, rightRail.preferredWidth)
      : RIGHT_RAIL_COLLAPSED_DESKTOP_WIDTH
    : 0;

  if (availableWidth == null || availableWidth <= 0) {
    return {
      fileTree: nextFileTreeWidth,
      rightRail: nextRightRailWidth,
    };
  }

  const maxSidePanelWidth = Math.max(0, availableWidth - minContentWidth);
  let overflow = nextFileTreeWidth + nextRightRailWidth - maxSidePanelWidth;
  if (overflow <= 0) {
    return {
      fileTree: nextFileTreeWidth,
      rightRail: nextRightRailWidth,
    };
  }

  const expandedPanels: Array<{
    key: "fileTree" | "rightRail";
    width: number;
    minWidth: number;
  }> = [];

  if (fileTree.isVisible && fileTree.isExpanded) {
    expandedPanels.push({
      key: "fileTree",
      width: nextFileTreeWidth,
      minWidth: fileTree.minWidth,
    });
  }

  if (rightRail.isVisible && rightRail.isExpanded) {
    expandedPanels.push({
      key: "rightRail",
      width: nextRightRailWidth,
      minWidth: rightRail.minWidth,
    });
  }

  if (expandedPanels.length === 0) {
    return {
      fileTree: nextFileTreeWidth,
      rightRail: nextRightRailWidth,
    };
  }

  const totalReducibleWidth = expandedPanels.reduce(
    (sum, panel) => sum + (panel.width - panel.minWidth),
    0,
  );
  if (totalReducibleWidth <= 0) {
    return {
      fileTree: nextFileTreeWidth,
      rightRail: nextRightRailWidth,
    };
  }

  expandedPanels.forEach((panel, index) => {
    const reducibleWidth = panel.width - panel.minWidth;
    if (reducibleWidth <= 0 || overflow <= 0) {
      return;
    }

    const proportionalReduction =
      index === expandedPanels.length - 1
        ? overflow
        : (overflow * reducibleWidth) / totalReducibleWidth;
    const appliedReduction = Math.min(reducibleWidth, proportionalReduction);

    if (panel.key === "fileTree") {
      nextFileTreeWidth -= appliedReduction;
    } else {
      nextRightRailWidth -= appliedReduction;
    }

    overflow -= appliedReduction;
  });

  if (overflow > 0) {
    const fileTreeRemaining =
      fileTree.isVisible && fileTree.isExpanded
        ? nextFileTreeWidth - fileTree.minWidth
        : 0;
    const fileTreeReduction = Math.min(fileTreeRemaining, overflow);
    nextFileTreeWidth -= fileTreeReduction;
    overflow -= fileTreeReduction;
  }

  if (overflow > 0) {
    const rightRailRemaining =
      rightRail.isVisible && rightRail.isExpanded
        ? nextRightRailWidth - rightRail.minWidth
        : 0;
    const rightRailReduction = Math.min(rightRailRemaining, overflow);
    nextRightRailWidth -= rightRailReduction;
  }

  return {
    fileTree: nextFileTreeWidth,
    rightRail: nextRightRailWidth,
  };
}

function resolveResizablePanelMaxWidth({
  availableWidth,
  minContentWidth,
  otherPanelWidth,
  minWidth,
  fallbackWidth,
}: {
  availableWidth: number | null;
  minContentWidth: number;
  otherPanelWidth: number;
  minWidth: number;
  fallbackWidth: number;
}) {
  if (availableWidth == null || availableWidth <= 0) {
    return Math.max(minWidth, fallbackWidth);
  }

  return Math.max(
    minWidth,
    availableWidth - minContentWidth - otherPanelWidth,
  );
}

function focusSearchInput(inputId: string) {
  const input = document.getElementById(inputId);
  if (input instanceof HTMLInputElement) {
    input.focus();
    input.select();
  }
}

function isMacPlatform() {
  if (typeof navigator === "undefined") {
    return true;
  }

  const browserNavigator = navigator as Navigator & {
    userAgentData?: {
      platform?: string;
    };
  };
  const platform =
    browserNavigator.userAgentData?.platform ||
    browserNavigator.platform ||
    browserNavigator.userAgent;

  return /mac|iphone|ipad|ipod/i.test(platform);
}

function getCodeSearchShortcutLabel() {
  return isMacPlatform() ? "Cmd+Shift+F" : "Ctrl+Shift+F";
}

function sortCodeMatches(matches: DiffCodeSearchMatch[]): DiffCodeSearchMatch[] {
  return [...matches].sort((left, right) => {
    if (left.startLine !== right.startLine) {
      return left.startLine - right.startLine;
    }

    if (left.side !== right.side) {
      return left.side === "original" ? -1 : 1;
    }

    if (left.startColumn !== right.startColumn) {
      return left.startColumn - right.startColumn;
    }

    return left.id.localeCompare(right.id);
  });
}

function resolveContextHighlight(
  searchContext: DiffSearchContext | null | undefined,
  resolveFilePath: (filePath: string) => string | null,
): DiffWorkspaceContextHighlight | null {
  if (!searchContext?.filePath) {
    return null;
  }

  const resolvedPath = resolveFilePath(searchContext.filePath);
  if (!resolvedPath) {
    return null;
  }

  const side: DiffViewerSide | undefined =
    searchContext.newStart != null
      ? "modified"
      : searchContext.oldStart != null
        ? "original"
        : undefined;
  const line =
    side === "modified"
      ? searchContext.newStart ?? null
      : side === "original"
        ? searchContext.oldStart ?? null
        : null;

  return {
    filePath: resolvedPath,
    side,
    line,
    highlightStrategy: searchContext.highlightStrategy,
  };
}

function findInitialCodeMatchIndex(
  matches: DiffCodeSearchMatch[],
  searchContext: DiffSearchContext | null | undefined,
  resolveFilePath: (filePath: string) => string | null,
): number {
  if (matches.length === 0) {
    return -1;
  }

  if (!searchContext?.filePath) {
    return 0;
  }

  const resolvedPath = resolveFilePath(searchContext.filePath);
  if (!resolvedPath) {
    return 0;
  }

  const relevantMatches = matches
    .map((match, index) => ({ match, index }))
    .filter(({ match }) => match.filePath === resolvedPath);

  if (relevantMatches.length === 0) {
    return 0;
  }

  if (searchContext.newStart == null && searchContext.oldStart == null) {
    return relevantMatches[0].index;
  }

  const targetLine =
    searchContext.newStart ??
    searchContext.oldStart ??
    relevantMatches[0].match.startLine;
  const preferredSide: DiffViewerSide | null =
    searchContext.newStart != null
      ? "modified"
      : searchContext.oldStart != null
        ? "original"
        : null;

  let bestIndex = relevantMatches[0].index;
  let bestScore = Number.POSITIVE_INFINITY;

  relevantMatches.forEach(({ match, index }) => {
    const sidePenalty =
      preferredSide == null || match.side === preferredSide ? 0 : 0.5;
    const score = Math.abs(match.startLine - targetLine) + sidePenalty;
    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function DiffSearchField({
  inputId,
  value,
  onChange,
  placeholder,
  density = "default",
  className,
  onKeyDown,
  trailingContent,
  ariaKeyShortcuts,
}: {
  inputId: string;
  value: string;
  onChange: (nextValue: string) => void;
  placeholder: string;
  density?: "default" | "compact";
  className?: string;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  trailingContent?: ReactNode;
  ariaKeyShortcuts?: string;
}) {
  const isCompactChrome = density === "compact";

  return (
    <InputGroup
      className={cn(
        "border-border-strong bg-[rgba(11,13,16,0.78)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        isCompactChrome ? "min-h-11 rounded-[14px]" : "min-h-12 rounded-[16px]",
        className,
      )}
    >
      <InputGroupAddon className={cn(isCompactChrome ? "pl-2.5" : "pl-3")}>
        <InputGroupText className="text-text-secondary">
          <Search className="size-4" />
        </InputGroupText>
      </InputGroupAddon>

      <InputGroupInput
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-keyshortcuts={ariaKeyShortcuts}
        className={cn("text-sm", isCompactChrome ? "px-1.5 py-3" : "px-2 py-3.5")}
      />

      <InputGroupAddon
        align="inline-end"
        className={cn(
          "flex items-center gap-1",
          isCompactChrome ? "pr-1.5" : "pr-2",
        )}
      >
        {trailingContent}
        {value ? (
          <InputGroupButton
            size="icon-sm"
            aria-label={`Clear ${placeholder.toLowerCase()}`}
            onClick={() => onChange("")}
          >
            <X className="size-4" />
          </InputGroupButton>
        ) : null}
      </InputGroupAddon>
    </InputGroup>
  );
}

function DiffWorkspaceResizeHandle({
  label,
  side,
  currentWidth,
  minWidth,
  maxWidth,
  defaultWidth,
  onWidthChange,
}: {
  label: string;
  side: "left" | "right";
  currentWidth: number;
  minWidth: number;
  maxWidth: number;
  defaultWidth: number;
  onWidthChange: (width: number) => void;
}) {
  const dragStateRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);
  const cleanupDragRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      cleanupDragRef.current?.();
    },
    [],
  );

  return (
    <button
      type="button"
      role="separator"
      aria-label={`Resize ${label}`}
      aria-orientation="vertical"
      aria-valuemin={Math.round(minWidth)}
      aria-valuemax={Math.round(maxWidth)}
      aria-valuenow={Math.round(currentWidth)}
      title={`Drag to resize ${label.toLowerCase()}. Double-click to reset.`}
      onPointerDown={(event) => {
        if (maxWidth <= minWidth) {
          return;
        }

        event.preventDefault();

        const ownerWindow = event.currentTarget.ownerDocument.defaultView ?? window;
        const ownerDocument = event.currentTarget.ownerDocument;

        dragStateRef.current = {
          startX: event.clientX,
          startWidth: currentWidth,
        };
        ownerDocument.body.style.cursor = "col-resize";
        ownerDocument.body.style.userSelect = "none";

        const cleanup = () => {
          dragStateRef.current = null;
          ownerDocument.body.style.cursor = "";
          ownerDocument.body.style.userSelect = "";
          ownerWindow.removeEventListener("pointermove", handlePointerMove);
          ownerWindow.removeEventListener("pointerup", cleanup);
          ownerWindow.removeEventListener("pointercancel", cleanup);
          cleanupDragRef.current = null;
        };

        const handlePointerMove = (moveEvent: PointerEvent) => {
          const currentDrag = dragStateRef.current;
          if (!currentDrag) {
            return;
          }

          const delta = moveEvent.clientX - currentDrag.startX;
          const nextWidth =
            side === "right"
              ? currentDrag.startWidth - delta
              : currentDrag.startWidth + delta;

          onWidthChange(clampPanelWidth(nextWidth, minWidth, maxWidth));
        };

        cleanupDragRef.current = cleanup;
        ownerWindow.addEventListener("pointermove", handlePointerMove);
        ownerWindow.addEventListener("pointerup", cleanup);
        ownerWindow.addEventListener("pointercancel", cleanup);
      }}
      onDoubleClick={() =>
        onWidthChange(clampPanelWidth(defaultWidth, minWidth, maxWidth))
      }
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onWidthChange(
            clampPanelWidth(currentWidth - DESKTOP_RESIZE_STEP, minWidth, maxWidth),
          );
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          onWidthChange(
            clampPanelWidth(currentWidth + DESKTOP_RESIZE_STEP, minWidth, maxWidth),
          );
        }

        if (event.key === "Home") {
          event.preventDefault();
          onWidthChange(minWidth);
        }

        if (event.key === "End") {
          event.preventDefault();
          onWidthChange(maxWidth);
        }
      }}
      className={cn(
        "absolute inset-y-0 z-20 hidden w-5 cursor-col-resize touch-none items-stretch justify-center outline-none transition-colors xl:flex",
        side === "right" ? "-left-2.5" : "-right-2.5",
        "after:absolute after:inset-y-4 after:left-1/2 after:w-px after:-translate-x-1/2 after:rounded-full after:bg-transparent after:transition-colors",
        "hover:after:bg-[rgba(122,162,255,0.4)] focus-visible:after:bg-[rgba(122,162,255,0.45)]",
      )}
    />
  );
}

export const DiffWorkspace = forwardRef<
  DiffWorkspaceHandle,
  DiffWorkspaceProps
>(function DiffWorkspace(
  {
    repoPath,
    viewerId,
    files,
    isLoading = false,
    error = null,
    topContent,
    chromeDensity = "default",
    fileTreeCollapsible = false,
    fileSearchInputId,
    codeSearchInputId,
    fileSearchPlaceholder = "Filter files...",
    codeSearchPlaceholder = "Search within code",
    emptyTitle,
    emptyDescription,
    summaryActions,
    rightRail,
    isRightRailOpen = false,
    isRightRailFullscreen = false,
    rightRailCollapsedSummary,
    onInjectSelection,
    desktopResize,
    searchContext = null,
  },
  ref,
) {
  const [fileQuery, setFileQuery] = useState("");
  const [codeQuery, setCodeQuery] = useState("");
  const [diffMode, setDiffMode] = useState<DiffMode>("side-by-side");
  const deferredFileQuery = useDeferredValue(fileQuery);
  const deferredCodeQuery = useDeferredValue(codeQuery);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [isFileTreeCollapsed, setIsFileTreeCollapsed] = useState(false);
  const [navigationTarget, setNavigationTarget] =
    useState<DiffNavigationTarget | null>(null);
  const [codeNavigationTarget, setCodeNavigationTarget] =
    useState<DiffWorkspaceCodeNavigationTarget | null>(null);
  const [selectedCodeMatchId, setSelectedCodeMatchId] = useState<string | null>(null);
  const [activeCodeMatchId, setActiveCodeMatchId] = useState<string | null>(null);
  const desktopWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const diffListScrollRef = useRef<HTMLDivElement | null>(null);
  const fileSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const appliedSearchContextKeyRef = useRef<string | null>(null);
  const shouldAutoNavigateToCodeMatchRef = useRef(false);
  const [desktopWorkspaceWidth, setDesktopWorkspaceWidth] = useState<number | null>(
    null,
  );

  const normalizedFileQuery = deferredFileQuery.trim();
  const normalizedCodeQuery = deferredCodeQuery.trim();
  const hasActiveSearch =
    normalizedFileQuery.length > 0 || normalizedCodeQuery.length > 0;
  const codeSearchIndexByPath = useMemo(() => {
    if (!normalizedCodeQuery) {
      return new Map<string, DiffCodeSearchFileIndex>();
    }

    const next = new Map<string, DiffCodeSearchFileIndex>();
    files.forEach((fileChange) => {
      const labelPath = getFileChangeLabelPath(fileChange);
      next.set(
        labelPath,
        buildFileChangeCodeSearchIndex(fileChange, normalizedCodeQuery),
      );
    });
    return next;
  }, [files, normalizedCodeQuery]);

  const filteredFiles = useMemo(
    () =>
      files.filter((fileChange) => {
        if (!fileChangeMatchesFileQuery(fileChange, normalizedFileQuery)) {
          return false;
        }

        if (!normalizedCodeQuery) {
          return true;
        }

        return (
          codeSearchIndexByPath.get(getFileChangeLabelPath(fileChange))?.total ?? 0
        ) > 0;
      }),
    [codeSearchIndexByPath, files, normalizedFileQuery, normalizedCodeQuery],
  );
  const flattenedCodeMatches = useMemo(() => {
    if (!normalizedCodeQuery) {
      return [] as DiffCodeSearchMatch[];
    }

    const matches: DiffCodeSearchMatch[] = [];
    filteredFiles.forEach((fileChange) => {
      const labelPath = getFileChangeLabelPath(fileChange);
      const fileMatches = codeSearchIndexByPath.get(labelPath);
      if (!fileMatches) {
        return;
      }

      matches.push(
        ...sortCodeMatches([
          ...fileMatches.original,
          ...fileMatches.modified,
        ]),
      );
    });

    return matches;
  }, [codeSearchIndexByPath, filteredFiles, normalizedCodeQuery]);
  const codeMatchCountsByFile = useMemo(() => {
    const counts: Record<string, number> = {};

    if (!normalizedCodeQuery) {
      return counts;
    }

    filteredFiles.forEach((fileChange) => {
      const labelPath = getFileChangeLabelPath(fileChange);
      counts[labelPath] = codeSearchIndexByPath.get(labelPath)?.total ?? 0;
    });

    return counts;
  }, [codeSearchIndexByPath, filteredFiles, normalizedCodeQuery]);
  const codeSearchMatchById = useMemo(
    () =>
      new Map(flattenedCodeMatches.map((match) => [match.id, match] as const)),
    [flattenedCodeMatches],
  );
  const activeCodeMatch = activeCodeMatchId
    ? codeSearchMatchById.get(activeCodeMatchId) ?? null
    : null;
  const hasFiles = files.length > 0;

  useEffect(() => {
    const nextExpanded: Record<string, boolean> = {};
    files.forEach((fileChange) => {
      nextExpanded[getFileChangeLabelPath(fileChange)] = true;
    });
    setExpanded(nextExpanded);
  }, [files, viewerId]);

  useEffect(() => {
    setFileQuery("");
    setCodeQuery("");
    setSelectedFilePath(null);
    setNavigationTarget(null);
    setCodeNavigationTarget(null);
    setSelectedCodeMatchId(null);
    setActiveCodeMatchId(null);
    shouldAutoNavigateToCodeMatchRef.current = false;
    appliedSearchContextKeyRef.current = null;
    fileSectionRefs.current = {};
  }, [viewerId]);

  useEffect(() => {
    if (!fileTreeCollapsible) {
      setIsFileTreeCollapsed(false);
    }
  }, [fileTreeCollapsible]);

  useEffect(() => {
    if (!desktopResize) {
      setDesktopWorkspaceWidth(null);
      return;
    }

    const workspaceElement = desktopWorkspaceRef.current;
    if (!workspaceElement || !hasFiles) {
      return;
    }

    const updateWidth = () => {
      setDesktopWorkspaceWidth(workspaceElement.getBoundingClientRect().width);
    };

    updateWidth();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        updateWidth();
      });
      observer.observe(workspaceElement);

      return () => observer.disconnect();
    }

    const ownerWindow = workspaceElement.ownerDocument.defaultView ?? window;
    ownerWindow.addEventListener("resize", updateWidth);
    return () => ownerWindow.removeEventListener("resize", updateWidth);
  }, [desktopResize, hasFiles]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return;
      }

      if (event.key.toLowerCase() !== "k") {
        return;
      }

      event.preventDefault();

      if (fileTreeCollapsible && isFileTreeCollapsed) {
        setIsFileTreeCollapsed(false);
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            focusSearchInput(fileSearchInputId);
          });
        });
        return;
      }

      window.requestAnimationFrame(() => {
        focusSearchInput(fileSearchInputId);
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fileSearchInputId, fileTreeCollapsible, isFileTreeCollapsed]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.altKey) {
        return;
      }

      if (event.key.toLowerCase() !== "f") {
        return;
      }

      event.preventDefault();

      window.requestAnimationFrame(() => {
        focusSearchInput(codeSearchInputId);
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [codeSearchInputId]);

  useEffect(() => {
    const visiblePaths = filteredFiles.map((fileChange) =>
      getFileChangeLabelPath(fileChange),
    );

    setSelectedFilePath((prev) => {
      if (prev && visiblePaths.includes(prev)) {
        return prev;
      }

      return visiblePaths[0] ?? null;
    });
  }, [filteredFiles]);

  const scrollToFile = useCallback((path: string) => {
    const container = diffListScrollRef.current;
    const target = fileSectionRefs.current[path];

    if (!container || !target) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = targetRect.top - containerRect.top + container.scrollTop - 12;

    container.scrollTo({
      top: Math.max(0, top),
      behavior: "smooth",
    });
  }, []);

  const handleSelectFile = useCallback(
    (path: string) => {
      setSelectedFilePath(path);
      setExpanded((prev) => ({
        ...prev,
        [path]: true,
      }));

      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          scrollToFile(path);
        });
        return;
      }

      scrollToFile(path);
    },
    [scrollToFile],
  );

  const resolveFilePath = useCallback(
    (filePath: string) => {
      const match = files.find((fileChange) => {
        const knownPaths = new Set([
          getFileChangeLabelPath(fileChange),
          fileChange.new_path,
          fileChange.old_path,
        ]);
        return knownPaths.has(filePath);
      });

      return match ? getFileChangeLabelPath(match) : null;
    },
    [files],
  );
  const contextHighlight = useMemo(
    () => resolveContextHighlight(searchContext, resolveFilePath),
    [resolveFilePath, searchContext],
  );

  const navigateToCodeMatch = useCallback(
    (
      match: DiffCodeSearchMatch,
      options?: {
        focusEditor?: boolean;
      },
    ) => {
      setSelectedCodeMatchId(match.id);
      setActiveCodeMatchId(match.id);
      setCodeNavigationTarget({
        ...match,
        token: Date.now(),
        focusEditor: options?.focusEditor ?? false,
      });
      handleSelectFile(match.filePath);
    },
    [handleSelectFile],
  );

  useEffect(() => {
    if (!normalizedCodeQuery) {
      setSelectedCodeMatchId(null);
      setActiveCodeMatchId(null);
      setCodeNavigationTarget(null);
      return;
    }

    if (filteredFiles.length === 0) {
      return;
    }

    setExpanded((prev) => {
      const next = { ...prev };
      filteredFiles.forEach((fileChange) => {
        next[getFileChangeLabelPath(fileChange)] = true;
      });
      return next;
    });
  }, [filteredFiles, normalizedCodeQuery]);

  useEffect(() => {
    if (!normalizedCodeQuery) {
      setSelectedCodeMatchId(null);
      setActiveCodeMatchId(null);
      setCodeNavigationTarget(null);
      shouldAutoNavigateToCodeMatchRef.current = false;
      return;
    }

    if (flattenedCodeMatches.length === 0) {
      setSelectedCodeMatchId(null);
      setActiveCodeMatchId(null);
      setCodeNavigationTarget(null);
      if (hasFiles) {
        shouldAutoNavigateToCodeMatchRef.current = false;
      }
      return;
    }

    if (selectedCodeMatchId && codeSearchMatchById.has(selectedCodeMatchId)) {
      if (!shouldAutoNavigateToCodeMatchRef.current) {
        return;
      }
    } else {
      const initialMatchIndex = findInitialCodeMatchIndex(
        flattenedCodeMatches,
        searchContext,
        resolveFilePath,
      );
      const initialMatch =
        flattenedCodeMatches[Math.max(initialMatchIndex, 0)] ??
        flattenedCodeMatches[0];
      if (initialMatch) {
        setSelectedCodeMatchId(initialMatch.id);
      }
      if (!shouldAutoNavigateToCodeMatchRef.current) {
        return;
      }
    }

    if (!shouldAutoNavigateToCodeMatchRef.current) {
      return;
    }

    const initialMatchIndex = findInitialCodeMatchIndex(
      flattenedCodeMatches,
      searchContext,
      resolveFilePath,
    );
    const initialMatch =
      flattenedCodeMatches[Math.max(initialMatchIndex, 0)] ??
      flattenedCodeMatches[0];
    if (initialMatch) {
      navigateToCodeMatch(initialMatch);
    }
    shouldAutoNavigateToCodeMatchRef.current = false;
  }, [
    codeSearchMatchById,
    flattenedCodeMatches,
    navigateToCodeMatch,
    hasFiles,
    normalizedCodeQuery,
    resolveFilePath,
    selectedCodeMatchId,
    searchContext,
  ]);

  useEffect(() => {
    if (!searchContext) {
      return;
    }

    const searchContextKey = JSON.stringify(searchContext);
    if (appliedSearchContextKeyRef.current === searchContextKey) {
      return;
    }
    appliedSearchContextKeyRef.current = searchContextKey;

    const resolvedPath = searchContext.filePath
      ? resolveFilePath(searchContext.filePath)
      : null;

    setFileQuery("");
    if (
      searchContext.highlightStrategy === "exact_query" &&
      searchContext.query?.trim()
    ) {
      shouldAutoNavigateToCodeMatchRef.current = true;
      setSelectedCodeMatchId(null);
      setActiveCodeMatchId(null);
      setCodeNavigationTarget(null);
      setCodeQuery(searchContext.query.trim());
    } else {
      setCodeQuery("");
      setSelectedCodeMatchId(null);
      setActiveCodeMatchId(null);
      setCodeNavigationTarget(null);
      shouldAutoNavigateToCodeMatchRef.current = false;
    }

    if (!resolvedPath) {
      return;
    }

    handleSelectFile(resolvedPath);

    if (
      searchContext.highlightStrategy !== "exact_query" &&
      (searchContext.newStart != null || searchContext.oldStart != null)
    ) {
      setNavigationTarget({
        filePath: resolvedPath,
        newStart: searchContext.newStart ?? null,
        oldStart: searchContext.oldStart ?? null,
        token: Date.now(),
      });
    }
  }, [handleSelectFile, resolveFilePath, searchContext]);

  const collapseAll = useCallback(() => {
    setExpanded((prev) => {
      const next = { ...prev };

      filteredFiles.forEach((fileChange) => {
        next[getFileChangeLabelPath(fileChange)] = false;
      });

      return next;
    });
  }, [filteredFiles]);

  const focusLocation = useCallback(
    (target: {
      filePath: string;
      newStart?: number | null;
      oldStart?: number | null;
    }) => {
      const resolvedPath = resolveFilePath(target.filePath);
      if (!resolvedPath) {
        return;
      }

      setFileQuery("");
      setCodeQuery("");
      setCodeNavigationTarget(null);
      setSelectedCodeMatchId(null);
      setActiveCodeMatchId(null);
      setExpanded((prev) => ({
        ...prev,
        [resolvedPath]: true,
      }));
      setNavigationTarget({
        filePath: resolvedPath,
        newStart: target.newStart ?? null,
        oldStart: target.oldStart ?? null,
        token: Date.now(),
      });
      handleSelectFile(resolvedPath);
    },
    [handleSelectFile, resolveFilePath],
  );
  const toggleFileTree = useCallback(() => {
    if (!fileTreeCollapsible) {
      return;
    }

    setIsFileTreeCollapsed((current) => !current);
  }, [fileTreeCollapsible]);

  useImperativeHandle(
    ref,
    () => ({
      collapseAll,
      focusLocation,
      toggleFileTree,
    }),
    [collapseAll, focusLocation, toggleFileTree],
  );
  const selectedCodeMatch = selectedCodeMatchId
    ? codeSearchMatchById.get(selectedCodeMatchId) ?? null
    : null;
  const selectedCodeMatchIndex = useMemo(() => {
    if (!selectedCodeMatch) {
      return -1;
    }

    return flattenedCodeMatches.findIndex(
      (match) => match.id === selectedCodeMatch.id,
    );
  }, [flattenedCodeMatches, selectedCodeMatch]);

  const moveSelectedCodeMatch = useCallback(
    (direction: 1 | -1) => {
      if (flattenedCodeMatches.length === 0) {
        return;
      }

      const currentIndex =
        selectedCodeMatchIndex >= 0
          ? selectedCodeMatchIndex
          : direction > 0
            ? -1
            : flattenedCodeMatches.length;
      const nextIndex =
        (currentIndex + direction + flattenedCodeMatches.length) %
        flattenedCodeMatches.length;
      const nextMatch = flattenedCodeMatches[nextIndex];
      if (nextMatch) {
        navigateToCodeMatch(nextMatch);
      }
    },
    [flattenedCodeMatches, navigateToCodeMatch, selectedCodeMatchIndex],
  );

  const jumpToSelectedCodeMatch = useCallback(() => {
    if (flattenedCodeMatches.length === 0) {
      return;
    }

    const nextMatch =
      selectedCodeMatch ??
      flattenedCodeMatches[0] ??
      null;
    if (nextMatch) {
      navigateToCodeMatch(nextMatch, { focusEditor: true });
    }
  }, [flattenedCodeMatches, navigateToCodeMatch, selectedCodeMatch]);

  const clearCodeSearch = useCallback(
    (input?: HTMLInputElement | null) => {
      shouldAutoNavigateToCodeMatchRef.current = false;
      setCodeQuery("");
      setSelectedCodeMatchId(null);
      setActiveCodeMatchId(null);
      setCodeNavigationTarget(null);
      input?.blur();
    },
    [],
  );

  const handleCodeSearchKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowUp") {
        if (flattenedCodeMatches.length === 0) {
          return;
        }
        event.preventDefault();
        moveSelectedCodeMatch(-1);
        return;
      }

      if (event.key === "ArrowDown") {
        if (flattenedCodeMatches.length === 0) {
          return;
        }
        event.preventDefault();
        moveSelectedCodeMatch(1);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        clearCodeSearch(event.currentTarget);
        return;
      }

      if (event.key !== "Enter" || flattenedCodeMatches.length === 0) {
        return;
      }

      event.preventDefault();
      jumpToSelectedCodeMatch();
    },
    [
      clearCodeSearch,
      flattenedCodeMatches.length,
      jumpToSelectedCodeMatch,
      moveSelectedCodeMatch,
    ],
  );

  const isCompactChrome = chromeDensity === "compact";
  const hasDesktopResize = Boolean(desktopResize);
  const isDesktopFileTreeVisible = !isRightRailFullscreen;
  const isDesktopFileTreeExpanded = isDesktopFileTreeVisible && !isFileTreeCollapsed;
  const isDesktopRightRailVisible =
    Boolean(rightRail || rightRailCollapsedSummary) && !isRightRailFullscreen;
  const isDesktopRightRailExpanded =
    isDesktopRightRailVisible && isRightRailOpen;
  const desktopPanelWidths = useMemo(
    () =>
      resolveDesktopPanelWidths({
        availableWidth: hasDesktopResize ? desktopWorkspaceWidth : null,
        minContentWidth: desktopResize?.minContentWidth ?? 0,
        fileTree: {
          isVisible: isDesktopFileTreeVisible,
          isExpanded: isDesktopFileTreeExpanded,
          preferredWidth: desktopResize?.fileTree.preferredWidth ?? 0,
          minWidth: desktopResize?.fileTree.minWidth ?? 0,
        },
        rightRail: {
          isVisible: isDesktopRightRailVisible,
          isExpanded: isDesktopRightRailExpanded,
          preferredWidth: desktopResize?.rightRail.preferredWidth ?? 0,
          minWidth: desktopResize?.rightRail.minWidth ?? 0,
        },
      }),
    [
      desktopResize,
      desktopWorkspaceWidth,
      hasDesktopResize,
      isDesktopFileTreeExpanded,
      isDesktopFileTreeVisible,
      isDesktopRightRailExpanded,
      isDesktopRightRailVisible,
    ],
  );
  const fileTreeResizeMaxWidth = resolveResizablePanelMaxWidth({
    availableWidth: hasDesktopResize ? desktopWorkspaceWidth : null,
    minContentWidth: desktopResize?.minContentWidth ?? 0,
    otherPanelWidth: desktopPanelWidths.rightRail,
    minWidth: desktopResize?.fileTree.minWidth ?? 0,
    fallbackWidth:
      desktopResize?.fileTree.preferredWidth ?? desktopPanelWidths.fileTree,
  });
  const rightRailResizeMaxWidth = resolveResizablePanelMaxWidth({
    availableWidth: hasDesktopResize ? desktopWorkspaceWidth : null,
    minContentWidth: desktopResize?.minContentWidth ?? 0,
    otherPanelWidth: desktopPanelWidths.fileTree,
    minWidth: desktopResize?.rightRail.minWidth ?? 0,
    fallbackWidth:
      desktopResize?.rightRail.preferredWidth ?? desktopPanelWidths.rightRail,
  });
  const rightRailStyle =
    hasDesktopResize && isDesktopRightRailVisible
      ? ({
          width: `${desktopPanelWidths.rightRail}px`,
          minWidth: `${desktopPanelWidths.rightRail}px`,
        } as CSSProperties)
      : undefined;
  const headerPadding = isCompactChrome ? "px-3 py-2.5" : "px-4 py-4 sm:px-5";
  const codeSearchShortcutLabel = useMemo(() => getCodeSearchShortcutLabel(), []);
  const codeSearchFieldPlaceholder = `${codeSearchPlaceholder} (${codeSearchShortcutLabel})`;
  const fileTreeSearch = (
    <DiffSearchField
      inputId={fileSearchInputId}
      value={fileQuery}
      onChange={setFileQuery}
      placeholder={fileSearchPlaceholder}
      density={chromeDensity}
    />
  );
  const codeSearch = (
    <DiffSearchField
      inputId={codeSearchInputId}
      value={codeQuery}
      onChange={(nextValue) => {
        shouldAutoNavigateToCodeMatchRef.current = false;
        setSelectedCodeMatchId(null);
        setActiveCodeMatchId(null);
        setCodeNavigationTarget(null);
        setCodeQuery(nextValue);
      }}
      onKeyDown={handleCodeSearchKeyDown}
      placeholder={codeSearchFieldPlaceholder}
      density={chromeDensity}
      ariaKeyShortcuts="Meta+Shift+F Control+Shift+F"
      trailingContent={
        normalizedCodeQuery ? (
          <>
            <span className="min-w-[3.5rem] text-right font-mono text-[11px] text-text-tertiary">
              {flattenedCodeMatches.length > 0 && selectedCodeMatchIndex >= 0
                ? `${selectedCodeMatchIndex + 1}/${flattenedCodeMatches.length}`
                : flattenedCodeMatches.length === 0
                  ? "0"
                  : `${flattenedCodeMatches.length}`}
            </span>
            <InputGroupButton
              size="icon-sm"
              aria-label="Previous code match"
              disabled={flattenedCodeMatches.length === 0}
              onClick={() => moveSelectedCodeMatch(-1)}
            >
              <ChevronUp className="size-4" />
            </InputGroupButton>
            <InputGroupButton
              size="icon-sm"
              aria-label="Next code match"
              disabled={flattenedCodeMatches.length === 0}
              onClick={() => moveSelectedCodeMatch(1)}
            >
              <ChevronDown className="size-4" />
            </InputGroupButton>
          </>
        ) : null
      }
    />
  );

  return (
    <div className="workspace-panel relative flex h-full flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(17,20,24,0.98),rgba(11,13,17,0.96))]">
      <LoadingOverlay isVisible={Boolean(isLoading)} />

      {topContent || hasFiles ? (
        <div
          className={cn(
            "border-b border-border-subtle bg-[rgba(10,12,16,0.88)]",
            headerPadding,
          )}
        >
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            {topContent ? (
              <div className="min-w-0 flex-1">{topContent}</div>
            ) : (
              <div className="hidden flex-1 xl:block" />
            )}

            {hasFiles ? (
              <div
                className={cn(
                  "w-full xl:max-w-[20rem]",
                  isRightRailFullscreen ? "xl:hidden" : undefined,
                )}
              >
                {codeSearch}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="p-3 sm:p-4">
          <InlineBanner tone="danger" title={error} />
        </div>
      ) : hasFiles ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <div
            ref={desktopWorkspaceRef}
            className="flex h-full min-h-0 flex-col xl:flex-row"
          >
            <div
              className={cn(
                "relative shrink-0",
                isRightRailFullscreen ? "xl:hidden" : undefined,
              )}
            >
              <CommitFileTree
                files={filteredFiles}
                totalFileCount={files.length}
                selectedFilePath={selectedFilePath}
                codeSearchMatchCounts={codeMatchCountsByFile}
                desktopWidth={
                  hasDesktopResize ? desktopPanelWidths.fileTree : undefined
                }
                topContent={fileTreeSearch}
                isCollapsed={fileTreeCollapsible && isFileTreeCollapsed}
                hasActiveSearch={hasActiveSearch}
                forceExpandAll={hasActiveSearch}
                onToggleCollapsed={
                  fileTreeCollapsible
                    ? () => setIsFileTreeCollapsed((current) => !current)
                    : undefined
                }
                onSelectFile={handleSelectFile}
              />
              {desktopResize && isDesktopFileTreeExpanded ? (
                <DiffWorkspaceResizeHandle
                  label="file tree"
                  side="left"
                  currentWidth={desktopPanelWidths.fileTree}
                  minWidth={desktopResize.fileTree.minWidth}
                  maxWidth={fileTreeResizeMaxWidth}
                  defaultWidth={desktopResize.fileTree.defaultWidth}
                  onWidthChange={desktopResize.fileTree.onPreferredWidthChange}
                />
              ) : null}
            </div>

            <div
              className={cn(
                "min-h-0 flex-1 overflow-hidden bg-[linear-gradient(180deg,rgba(16,18,23,0.54),rgba(10,12,15,0.92))]",
                isRightRailFullscreen ? "xl:hidden" : undefined,
              )}
            >
              <div
                className={cn(
                  "h-full min-h-0 overflow-hidden",
                  isCompactChrome ? "p-2.5 sm:p-3" : "p-4 sm:p-5",
                )}
              >
                <div
                  ref={diffListScrollRef}
                  className="workspace-scrollbar h-full min-h-0 overflow-y-auto pr-0.5"
                >
                  {filteredFiles.length > 0 ? (
                    <div className={cn(isCompactChrome ? "space-y-2" : "space-y-4")}>
                      {filteredFiles.map((fileChange) => {
                        const labelPath = getFileChangeLabelPath(fileChange);
                        const isExpanded = expanded[labelPath] ?? true;
                        const summaryKey =
                          fileChange.id != null
                            ? String(fileChange.id)
                            : labelPath;

                        return (
                          <div
                            key={`${viewerId}-${labelPath}`}
                            ref={(node) => {
                              fileSectionRefs.current[labelPath] = node;
                            }}
                            className="scroll-mt-4"
                            onMouseDownCapture={() =>
                              setSelectedFilePath(labelPath)
                            }
                            onFocusCapture={() =>
                              setSelectedFilePath(labelPath)
                            }
                          >
                            <CommitFilePanel
                              repoPath={repoPath}
                              viewerId={viewerId}
                              fileChange={fileChange}
                              isExpanded={isExpanded}
                              onToggleExpanded={() =>
                                setExpanded((prev) => ({
                                  ...prev,
                                  [labelPath]: !(prev[labelPath] ?? true),
                                }))
                              }
                              fileSummary={
                                summaryActions?.fileSummaries[summaryKey]
                              }
                              isFileSummaryOpen={
                                summaryActions?.summaryOpen[summaryKey] ?? false
                              }
                              onToggleFileSummary={
                                summaryActions
                                  ? () =>
                                      summaryActions.onToggleFileSummary(
                                        summaryKey,
                                      )
                                  : undefined
                              }
                              onSummarizeFile={
                                summaryActions
                                  ? () =>
                                      summaryActions.onSummarizeFile(fileChange)
                                  : undefined
                              }
                              hunkSummaries={summaryActions?.hunkSummaries}
                              hunkSummaryOpen={summaryActions?.hunkSummaryOpen}
                              onToggleHunkSummary={
                                summaryActions?.onToggleHunkSummary
                              }
                              onSummarizeHunk={summaryActions?.onSummarizeHunk}
                              isSelected={selectedFilePath === labelPath}
                              navigationTarget={
                                navigationTarget?.filePath === labelPath
                                  ? navigationTarget
                                  : null
                              }
                              codeSearchIndex={
                                codeSearchIndexByPath.get(labelPath) ?? null
                              }
                              activeCodeMatch={
                                activeCodeMatch?.filePath === labelPath
                                  ? activeCodeMatch
                                  : null
                              }
                              codeNavigationTarget={
                                codeNavigationTarget?.filePath === labelPath
                                  ? codeNavigationTarget
                                  : null
                              }
                              onCodeNavigationTargetHandled={() =>
                                setCodeNavigationTarget((current) =>
                                  current?.filePath === labelPath
                                    ? null
                                    : current,
                                )
                              }
                              searchMatchCount={
                                codeMatchCountsByFile[labelPath] ?? 0
                              }
                              contextHighlight={
                                contextHighlight?.filePath === labelPath
                                  ? contextHighlight
                                  : null
                              }
                              onInjectSelection={onInjectSelection}
                              diffMode={diffMode}
                              onDiffModeChange={setDiffMode}
                              onNavigationTargetHandled={() =>
                                setNavigationTarget((current) =>
                                  current?.filePath === labelPath
                                    ? null
                                    : current,
                                )
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState
                      icon={<Search className="size-5" />}
                      title="No matching files"
                      description="Try a broader file filter or search for a different code snippet."
                      className="h-full justify-center rounded-[18px] border border-dashed border-border-subtle bg-[rgba(255,255,255,0.02)]"
                    />
                  )}
                </div>
              </div>
            </div>

            {isDesktopRightRailVisible ? (
              <div
                style={rightRailStyle}
                className={cn(
                  "relative hidden min-h-0 shrink-0 border-l border-border-subtle bg-[linear-gradient(180deg,rgba(11,14,19,0.98),rgba(8,10,14,0.94))] xl:flex",
                  isRightRailFullscreen
                    ? "w-full min-w-0 grow shrink border-l-0"
                    : hasDesktopResize
                      ? undefined
                      : isRightRailOpen
                      ? "w-[24rem]"
                      : "w-[3.75rem]",
                )}
              >
                {desktopResize && isDesktopRightRailExpanded ? (
                  <DiffWorkspaceResizeHandle
                    label="review panel"
                    side="right"
                    currentWidth={desktopPanelWidths.rightRail}
                    minWidth={desktopResize.rightRail.minWidth}
                    maxWidth={rightRailResizeMaxWidth}
                    defaultWidth={desktopResize.rightRail.defaultWidth}
                    onWidthChange={desktopResize.rightRail.onPreferredWidthChange}
                  />
                ) : null}
                <div className="relative min-h-0 flex-1 overflow-hidden">
                  {rightRail ? (
                    <div
                      aria-hidden={!isRightRailOpen}
                      className={cn(
                        "absolute inset-0 min-h-0 transition-opacity duration-75 ease-out",
                        isRightRailOpen
                          ? "pointer-events-auto opacity-100"
                          : "pointer-events-none opacity-0",
                      )}
                    >
                      {rightRail}
                    </div>
                  ) : null}
                  {rightRailCollapsedSummary ? (
                    <div
                      aria-hidden={isRightRailOpen}
                      className={cn(
                        "absolute inset-0 min-h-0 transition-opacity duration-75 ease-out",
                        isRightRailOpen
                          ? "pointer-events-none opacity-0"
                          : "pointer-events-auto opacity-100",
                      )}
                    >
                      {rightRailCollapsedSummary}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="p-3 sm:p-4">
          <InlineBanner
            tone="info"
            title={emptyTitle}
            description={emptyDescription}
          />
        </div>
      )}
    </div>
  );
});

DiffWorkspace.displayName = "DiffWorkspace";

export default DiffWorkspace;
