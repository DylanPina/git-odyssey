import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  Folder,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { FileChange } from "@/lib/definitions/repo";
import {
  buildCommitFileTree,
  getAncestorFolderPaths,
  getFileChangeLabelPath,
  normalizeDiffFileStatus,
  type CommitFileTreeNode,
  type DiffFileStatus,
} from "@/lib/diff";

type CommitFileTreeProps = {
  files: FileChange[];
  totalFileCount: number;
  selectedFilePath: string | null;
  topContent?: ReactNode;
  isCollapsed?: boolean;
  hasActiveSearch?: boolean;
  forceExpandAll?: boolean;
  onToggleCollapsed?: () => void;
  onSelectFile: (path: string) => void;
};

function getStatusDotClass(status?: DiffFileStatus) {
  if (status === "added") {
    return "bg-success";
  }

  if (status === "deleted") {
    return "bg-danger";
  }

  if (status === "renamed") {
    return "bg-accent";
  }

  return "bg-text-tertiary";
}

function collectFolderPaths(nodes: CommitFileTreeNode[]): string[] {
  const folderPaths: string[] = [];

  const visit = (treeNodes: CommitFileTreeNode[]) => {
    treeNodes.forEach((node) => {
      if (node.kind === "folder") {
        folderPaths.push(node.path);
        visit(node.children);
      }
    });
  };

  visit(nodes);

  return folderPaths;
}

export function CommitFileTree({
  files,
  totalFileCount,
  selectedFilePath,
  topContent,
  isCollapsed = false,
  hasActiveSearch = false,
  forceExpandAll = false,
  onToggleCollapsed,
  onSelectFile,
}: CommitFileTreeProps) {
  const treeNodes = useMemo(
    () =>
      buildCommitFileTree(
        files.map((fileChange) => ({
          path: getFileChangeLabelPath(fileChange),
          status: normalizeDiffFileStatus(fileChange.status),
        })),
      ),
    [files],
  );
  const folderPaths = useMemo(() => collectFolderPaths(treeNodes), [treeNodes]);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (folderPaths.length === 0) {
      setOpenFolders({});
      return;
    }

    setOpenFolders((prev) => {
      const next: Record<string, boolean> = {};
      folderPaths.forEach((path) => {
        next[path] = prev[path] ?? true;
      });
      return next;
    });
  }, [folderPaths]);

  useEffect(() => {
    if (!selectedFilePath) {
      return;
    }

    const ancestorPaths = getAncestorFolderPaths(selectedFilePath);
    if (ancestorPaths.length === 0) {
      return;
    }

    setOpenFolders((prev) => {
      const next = { ...prev };
      ancestorPaths.forEach((path) => {
        next[path] = true;
      });
      return next;
    });
  }, [selectedFilePath]);

  const renderNodes = (nodes: CommitFileTreeNode[], depth = 0) =>
    nodes.map((node) => {
      const paddingLeft = `${0.75 + depth * 0.85}rem`;

      if (node.kind === "folder") {
        const isOpen = forceExpandAll || (openFolders[node.path] ?? true);

        return (
          <div key={node.id}>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-[12px] py-2 pr-2.5 text-left text-[13px] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-text-primary",
                isOpen ? "text-text-primary" : "text-text-secondary",
              )}
              style={{ paddingLeft }}
              onClick={() => {
                if (forceExpandAll) {
                  return;
                }

                setOpenFolders((prev) => ({
                  ...prev,
                  [node.path]: !(prev[node.path] ?? true),
                }));
              }}
              title={node.path}
            >
              <span className="flex size-4 items-center justify-center text-text-tertiary">
                {isOpen ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
              </span>
              {isOpen ? (
                <FolderOpen className="size-4 shrink-0 text-text-tertiary" />
              ) : (
                <Folder className="size-4 shrink-0 text-text-tertiary" />
              )}
              <span className="truncate">{node.name}</span>
            </button>

            {isOpen ? <div>{renderNodes(node.children, depth + 1)}</div> : null}
          </div>
        );
      }

      const isSelected = selectedFilePath === node.path;

      return (
        <button
          key={node.id}
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-[12px] py-2 pr-2.5 text-left text-[13px] transition-[background-color,color,box-shadow] duration-150",
            isSelected
              ? "bg-[rgba(122,162,255,0.14)] text-text-primary shadow-[inset_0_0_0_1px_rgba(122,162,255,0.22)]"
              : "text-text-secondary hover:bg-[rgba(255,255,255,0.04)] hover:text-text-primary",
          )}
          style={{ paddingLeft }}
          onClick={() => onSelectFile(node.path)}
          aria-current={isSelected ? "true" : undefined}
          title={node.path}
        >
          <span
            className={cn(
              "ml-1 size-2 shrink-0 rounded-full",
              getStatusDotClass(node.status),
            )}
          />
          <FileCode2 className="size-4 shrink-0 text-text-tertiary" />
          <span className="truncate font-mono text-[12px]">{node.name}</span>
        </button>
      );
    });

  const collapseButton = onToggleCollapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="toolbar"
          size="icon-sm"
          onClick={onToggleCollapsed}
          aria-label={isCollapsed ? "Expand file tree" : "Collapse file tree"}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isCollapsed ? "Expand file tree" : "Collapse file tree"}
      </TooltipContent>
    </Tooltip>
  ) : null;

  if (isCollapsed) {
    return (
      <aside className="flex min-h-[3.75rem] items-center justify-between gap-3 border-b border-border-subtle bg-[rgba(9,11,14,0.96)] px-3 py-2.5 xl:min-h-0 xl:w-[4.25rem] xl:min-w-[4.25rem] xl:flex-col xl:justify-start xl:border-b-0 xl:border-r xl:px-2 xl:py-3">
        {collapseButton}

        <div className="flex min-w-0 items-center gap-2 xl:hidden">
          <div className="workspace-section-label">Files</div>
          <div className="font-mono text-xs text-text-tertiary">
            {files.length} / {totalFileCount}
          </div>
          {hasActiveSearch ? (
            <span className="rounded-full border border-border-subtle bg-control px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-text-secondary">
              Filtered
            </span>
          ) : null}
        </div>

        <div className="hidden xl:flex xl:flex-1 xl:flex-col xl:items-center xl:justify-center xl:gap-3">
          {hasActiveSearch ? (
            <span className="size-2 rounded-full bg-accent" />
          ) : null}
          <span className="font-mono text-[11px] text-text-tertiary [writing-mode:vertical-rl] rotate-180">
            {files.length}/{totalFileCount}
          </span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex min-h-[15rem] flex-col overflow-hidden border-b border-border-subtle bg-[rgba(9,11,14,0.94)] xl:min-h-0 xl:w-[20rem] xl:min-w-[20rem] xl:border-b-0 xl:border-r">
      {topContent ? (
        <div className="border-b border-border-subtle px-3 py-3">{topContent}</div>
      ) : null}

      <div className="border-b border-border-subtle px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="workspace-section-label">Changed Files</div>
          <div className="flex items-center gap-2">
            <div className="font-mono text-[11px] text-text-tertiary">
              {files.length} / {totalFileCount}
            </div>
            {hasActiveSearch ? (
              <span className="rounded-full border border-border-subtle bg-control px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-text-secondary">
                Filtered
              </span>
            ) : null}
            {collapseButton}
          </div>
        </div>
      </div>

      <div className="workspace-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2.5">
        {treeNodes.length > 0 ? (
          <div>{renderNodes(treeNodes)}</div>
        ) : (
          <div className="px-3 py-4 text-sm text-text-secondary">
            No matching files.
          </div>
        )}
      </div>
    </aside>
  );
}

export default CommitFileTree;
