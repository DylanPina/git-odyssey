import {
  forwardRef,
  useCallback,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Search, X } from "lucide-react";

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
  fileChangeMatchesQueries,
  getFileChangeLabelPath,
  type DiffNavigationTarget,
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
};

function focusSearchInput(inputId: string) {
  const input = document.getElementById(inputId);
  if (input instanceof HTMLInputElement) {
    input.focus();
    input.select();
  }
}

function DiffSearchField({
  inputId,
  value,
  onChange,
  placeholder,
  density = "default",
  className,
}: {
  inputId: string;
  value: string;
  onChange: (nextValue: string) => void;
  placeholder: string;
  density?: "default" | "compact";
  className?: string;
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
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn("text-sm", isCompactChrome ? "px-1.5 py-3" : "px-2 py-3.5")}
      />

      <InputGroupAddon
        align="inline-end"
        className={cn(isCompactChrome ? "pr-1.5" : "pr-2")}
      >
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
  },
  ref,
) {
  const [fileQuery, setFileQuery] = useState("");
  const [codeQuery, setCodeQuery] = useState("");
  const deferredFileQuery = useDeferredValue(fileQuery);
  const deferredCodeQuery = useDeferredValue(codeQuery);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [isFileTreeCollapsed, setIsFileTreeCollapsed] = useState(false);
  const [navigationTarget, setNavigationTarget] =
    useState<DiffNavigationTarget | null>(null);
  const diffListScrollRef = useRef<HTMLDivElement | null>(null);
  const fileSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const normalizedFileQuery = deferredFileQuery.trim();
  const normalizedCodeQuery = deferredCodeQuery.trim();
  const hasActiveSearch =
    normalizedFileQuery.length > 0 || normalizedCodeQuery.length > 0;

  const filteredFiles = useMemo(
    () =>
      files.filter((fileChange) =>
        fileChangeMatchesQueries(fileChange, {
          fileQuery: normalizedFileQuery,
          codeQuery: normalizedCodeQuery,
        }),
      ),
    [files, normalizedFileQuery, normalizedCodeQuery],
  );

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
    fileSectionRefs.current = {};
  }, [viewerId]);

  useEffect(() => {
    if (!fileTreeCollapsible) {
      setIsFileTreeCollapsed(false);
    }
  }, [fileTreeCollapsible]);

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

  useImperativeHandle(
    ref,
    () => ({
      collapseAll,
      focusLocation,
    }),
    [collapseAll, focusLocation],
  );

  const hasFiles = files.length > 0;
  const isCompactChrome = chromeDensity === "compact";
  const headerPadding = isCompactChrome ? "px-4 py-3" : "px-4 py-4 sm:px-5";
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
      onChange={setCodeQuery}
      placeholder={codeSearchPlaceholder}
      density={chromeDensity}
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
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            {topContent ? (
              <div className="min-w-0 flex-1">{topContent}</div>
            ) : (
              <div className="hidden flex-1 xl:block" />
            )}

            {hasFiles ? (
              <div className="w-full xl:max-w-[22rem]">{codeSearch}</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="p-4 sm:p-5">
          <InlineBanner tone="danger" title={error} />
        </div>
      ) : hasFiles ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full min-h-0 flex-col xl:flex-row">
            <CommitFileTree
              files={filteredFiles}
              totalFileCount={files.length}
              selectedFilePath={selectedFilePath}
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

            <div className="min-h-0 flex-1 overflow-hidden bg-[linear-gradient(180deg,rgba(16,18,23,0.54),rgba(10,12,15,0.92))]">
              <div
                className={cn(
                  "h-full min-h-0 overflow-hidden",
                  isCompactChrome ? "p-3 sm:p-4" : "p-4 sm:p-5",
                )}
              >
                <div
                  ref={diffListScrollRef}
                  className="workspace-scrollbar h-full min-h-0 overflow-y-auto pr-0 xl:pr-1"
                >
                  {filteredFiles.length > 0 ? (
                    <div className={cn(isCompactChrome ? "space-y-3" : "space-y-4")}>
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
          </div>
        </div>
      ) : (
        <div className="p-4 sm:p-5">
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
