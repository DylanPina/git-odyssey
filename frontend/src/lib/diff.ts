import type { FileChange, FileHunk } from "@/lib/definitions/repo";

export type DiffNavigationTarget = {
  filePath: string;
  newStart?: number | null;
  oldStart?: number | null;
  token: number;
};

export type DiffViewerSide = "original" | "modified";
export type DiffFileStatus = "added" | "modified" | "deleted" | "renamed";
export type DiffSearchHighlightStrategy =
  | "exact_query"
  | "target_hunk"
  | "file_header"
  | "none";
export type DiffSearchContext = {
  query?: string | null;
  matchType: "commit" | "file_change" | "hunk";
  filePath?: string | null;
  newStart?: number | null;
  oldStart?: number | null;
  highlightStrategy: DiffSearchHighlightStrategy;
};

export type DiffCodeSearchMatch = {
  id: string;
  filePath: string;
  side: DiffViewerSide;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  startOffset: number;
  endOffset: number;
};

export type DiffSelectionContext = {
  filePath: string;
  side: DiffViewerSide;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  selectedText: string;
  language?: string;
};

export type DiffCodeSearchFileIndex = {
  original: DiffCodeSearchMatch[];
  modified: DiffCodeSearchMatch[];
  total: number;
};

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

export function getFileChangeDiffContents(fileChange: FileChange): {
  status: DiffFileStatus;
  original: string;
  modified: string;
} {
  const status = normalizeDiffFileStatus(fileChange.status);

  if (status === "added") {
    return {
      status,
      original: "",
      modified: fileChange.snapshot?.content || "",
    };
  }

  if (status === "deleted") {
    return {
      status,
      original: fileChange.snapshot?.content || "",
      modified: "",
    };
  }

  return {
    status,
    original: fileChange.snapshot?.previous_snapshot?.content || "",
    modified: fileChange.snapshot?.content || "",
  };
}

function getSnapshotSearchText(fileChange: FileChange): string {
  const { original, modified } = getFileChangeDiffContents(fileChange);

  return [original, modified]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

export function getFileChangeCodeSearchText(fileChange: FileChange): string {
  return getSnapshotSearchText(fileChange);
}

function findMatchesInText(
  text: string,
  query: string,
  filePath: string,
  side: DiffViewerSide,
): DiffCodeSearchMatch[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery || normalizedQuery.includes("\n")) {
    return [];
  }

  const normalizedText = text.replace(/\r\n?/g, "\n");
  const lines = normalizedText.split("\n");
  const matches: DiffCodeSearchMatch[] = [];
  let currentOffset = 0;

  lines.forEach((line, lineIndex) => {
    const lowerLine = line.toLowerCase();
    let searchOffset = 0;

    while (searchOffset <= lowerLine.length - normalizedQuery.length) {
      const matchOffset = lowerLine.indexOf(normalizedQuery, searchOffset);
      if (matchOffset === -1) {
        break;
      }

      const startOffset = currentOffset + matchOffset;
      const endOffset = startOffset + normalizedQuery.length;
      matches.push({
        id: `${filePath}:${side}:${lineIndex + 1}:${matchOffset}`,
        filePath,
        side,
        startLine: lineIndex + 1,
        startColumn: matchOffset + 1,
        endLine: lineIndex + 1,
        endColumn: matchOffset + normalizedQuery.length + 1,
        startOffset,
        endOffset,
      });
      searchOffset = matchOffset + Math.max(normalizedQuery.length, 1);
    }

    currentOffset += line.length + 1;
  });

  return matches;
}

export function buildFileChangeCodeSearchIndex(
  fileChange: FileChange,
  query: string,
): DiffCodeSearchFileIndex {
  const filePath = getFileChangeLabelPath(fileChange);
  const { original, modified } = getFileChangeDiffContents(fileChange);
  const originalMatches = findMatchesInText(original, query, filePath, "original");
  const modifiedMatches = findMatchesInText(modified, query, filePath, "modified");

  return {
    original: originalMatches,
    modified: modifiedMatches,
    total: originalMatches.length + modifiedMatches.length,
  };
}

function matchesQuery(value: string, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return value.toLowerCase().includes(normalizedQuery);
}

export function fileChangeMatchesFileQuery(
  fileChange: FileChange,
  query: string
): boolean {
  return matchesQuery(getFileChangeSearchPaths(fileChange).join("\n"), query);
}

export function fileChangeMatchesCodeQuery(
  fileChange: FileChange,
  query: string
): boolean {
  return buildFileChangeCodeSearchIndex(fileChange, query).total > 0;
}

export function fileChangeMatchesQueries(
  fileChange: FileChange,
  queries: { fileQuery?: string; codeQuery?: string }
): boolean {
  return (
    fileChangeMatchesFileQuery(fileChange, queries.fileQuery ?? "") &&
    fileChangeMatchesCodeQuery(fileChange, queries.codeQuery ?? "")
  );
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
