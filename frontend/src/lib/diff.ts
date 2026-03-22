import type { FileChange, FileHunk } from "@/lib/definitions/repo";

export type DiffSearchScope = "all" | "files" | "code";
export type DiffNavigationTarget = {
  filePath: string;
  newStart?: number | null;
  oldStart?: number | null;
  token: number;
};

export type DiffFileStatus = "added" | "modified" | "deleted" | "renamed";

type DiffStatusTone = "neutral" | "accent" | "success" | "warning" | "danger";

export type CommitFileTreeItem = {
  path: string;
  status: DiffFileStatus;
};

export type CommitFileTreeNode = {
  id: string;
  kind: "folder" | "file";
  name: string;
  path: string;
  children: CommitFileTreeNode[];
  status?: DiffFileStatus;
};

export const DIFF_STATUS_ORDER: DiffFileStatus[] = [
  "added",
  "modified",
  "deleted",
  "renamed",
];

export function inferLanguage(path?: string): string | undefined {
	if (!path) return undefined;
	const ext = path.split(".").pop() || "";
	switch (ext) {
		case "ts":
		case "tsx":
			return "typescript";
		case "js":
		case "jsx":
			return "javascript";
		case "py":
			return "python";
		case "rb":
			return "ruby";
		case "go":
			return "go";
		case "rs":
			return "rust";
		case "java":
			return "java";
		case "cs":
			return "csharp";
		case "cpp":
		case "cc":
		case "cxx":
			return "cpp";
		case "c":
			return "c";
		case "json":
			return "json";
		case "yml":
		case "yaml":
			return "yaml";
		case "md":
			return "markdown";
		case "css":
			return "css";
		case "scss":
			return "scss";
		case "html":
			return "html";
		case "sql":
			return "sql";
		case "sh":
		case "bash":
			return "shell";
		default:
			return undefined;
	}
}

export function getFileChangeLabelPath(fileChange: FileChange): string {
  return fileChange.new_path || fileChange.old_path || "unknown";
}

export function normalizeDiffFileStatus(status?: string | null): DiffFileStatus {
  const normalized = (status || "").trim().toLowerCase();

  if (normalized === "added" || normalized === "copy" || normalized === "copied") {
    return "added";
  }

  if (normalized === "deleted") {
    return "deleted";
  }

  if (normalized === "renamed" || normalized === "rename") {
    return "renamed";
  }

  return "modified";
}

export function getDiffStatusLabel(status: DiffFileStatus): string {
  switch (status) {
    case "added":
      return "Added";
    case "deleted":
      return "Deleted";
    case "renamed":
      return "Renamed";
    default:
      return "Modified";
  }
}

export function getDiffStatusTone(status: DiffFileStatus): DiffStatusTone {
  if (status === "added") {
    return "success";
  }

  if (status === "deleted") {
    return "danger";
  }

  if (status === "renamed") {
    return "accent";
  }

  return "neutral";
}

export function getFileChangeSearchPaths(fileChange: FileChange): string[] {
  const paths = [fileChange.new_path, fileChange.old_path].filter(
    (path): path is string => Boolean(path)
  );

  if (paths.length === 0) {
    return ["unknown"];
  }

  return Array.from(new Set(paths));
}

function getSnapshotSearchText(fileChange: FileChange): string {
  return [
    fileChange.snapshot?.previous_snapshot?.content,
    fileChange.snapshot?.content,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

export function getFileChangeCodeSearchText(fileChange: FileChange): string {
  const hunkText = (fileChange.hunks || [])
    .map((hunk) => hunk.content?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n");

  if (hunkText) {
    return hunkText;
  }

  return getSnapshotSearchText(fileChange);
}

export function getFileChangeSearchText(
  fileChange: FileChange,
  scope: DiffSearchScope
): string {
  const fileText = getFileChangeSearchPaths(fileChange).join("\n");
  const codeText = getFileChangeCodeSearchText(fileChange);

  if (scope === "files") {
    return fileText;
  }

  if (scope === "code") {
    return codeText;
  }

  return [fileText, codeText]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

export function fileChangeMatchesQuery(
  fileChange: FileChange,
  query: string,
  scope: DiffSearchScope
): boolean {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return getFileChangeSearchText(fileChange, scope)
    .toLowerCase()
    .includes(normalizedQuery);
}

function sortTreeNodes(nodes: CommitFileTreeNode[]) {
  nodes.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "folder" ? -1 : 1;
    }

    return left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

  nodes.forEach((node) => {
    if (node.children.length > 0) {
      sortTreeNodes(node.children);
    }
  });
}

export function buildCommitFileTree(
  items: CommitFileTreeItem[]
): CommitFileTreeNode[] {
  const roots: CommitFileTreeNode[] = [];
  const nodeMap = new Map<string, CommitFileTreeNode>();

  items.forEach((item) => {
    const segments = item.path.split("/").filter(Boolean);

    if (segments.length === 0) {
      return;
    }

    let children = roots;
    let currentPath = "";

    segments.forEach((segment, index) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const isFile = index === segments.length - 1;
      const nodeId = `${isFile ? "file" : "folder"}:${currentPath}`;

      let node = nodeMap.get(nodeId);
      if (!node) {
        node = {
          id: nodeId,
          kind: isFile ? "file" : "folder",
          name: segment,
          path: currentPath,
          children: [],
          status: isFile ? item.status : undefined,
        };
        nodeMap.set(nodeId, node);
        children.push(node);
      }

      if (isFile) {
        node.status = item.status;
      }

      children = node.children;
    });
  });

  sortTreeNodes(roots);

  return roots;
}

export function getAncestorFolderPaths(path: string): string[] {
  const segments = path.split("/").filter(Boolean);
  const ancestors: string[] = [];
  let currentPath = "";

  segments.slice(0, -1).forEach((segment) => {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    ancestors.push(currentPath);
  });

  return ancestors;
}

export function formatHunkLabel(hunk: FileHunk): string {
	const oldRange = `${hunk.old_start}${hunk.old_lines ? "," + hunk.old_lines : ""}`;
	const newRange = `${hunk.new_start}${hunk.new_lines ? "," + hunk.new_lines : ""}`;
	return `-${oldRange} +${newRange}`;
}

export function findClosestHunk(
  hunks: FileHunk[],
  target: Pick<DiffNavigationTarget, "newStart" | "oldStart">
): FileHunk | null {
  if (hunks.length === 0) {
    return null;
  }

  const targetNew = target.newStart ?? null;
  const targetOld = target.oldStart ?? null;

  if (targetNew == null && targetOld == null) {
    return hunks[0];
  }

  let bestHunk: FileHunk | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  hunks.forEach((hunk) => {
    const newScore =
      targetNew == null ? Number.POSITIVE_INFINITY : Math.abs(hunk.new_start - targetNew);
    const oldScore =
      targetOld == null ? Number.POSITIVE_INFINITY : Math.abs(hunk.old_start - targetOld);
    const score = Math.min(newScore, oldScore);

    if (score < bestScore) {
      bestScore = score;
      bestHunk = hunk;
    }
  });

  return bestHunk ?? hunks[0];
}
