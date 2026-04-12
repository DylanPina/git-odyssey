import type { DiffSearchContext } from "@/lib/diff";

export type MonacoSide = "original" | "modified";
export type ReviewRouteTarget =
  | {
      mode: "compare";
      baseRef?: string | null;
      headRef?: string | null;
    }
  | {
      mode: "commit";
      commitSha: string;
      searchContext?: DiffSearchContext | null;
    };

export function normalizeRepoPath(repoPath: string): string {
  const normalized = repoPath.replace(/\\/g, "/");
  if (normalized === "/") {
    return normalized;
  }
  return normalized.replace(/\/+$/, "");
}

export function getRepoDisplayName(repoPath: string): string {
  const normalized = normalizeRepoPath(repoPath);
  const segments = normalized.split("/").filter(Boolean);
  const name = segments[segments.length - 1] ?? normalized;
  return name.endsWith(".git") ? name.slice(0, -4) : name;
}

export function getRepoPathBreadcrumbs(repoPath: string): string[] {
  const normalized = normalizeRepoPath(repoPath);
  if (normalized === "/") {
    return [normalized];
  }

  return normalized.split("/").filter(Boolean);
}

export function getRepoStableKey(repoPath: string): string {
  return encodeURIComponent(normalizeRepoPath(repoPath));
}

export function buildRepoRoute(repoPath: string): string {
  const params = new URLSearchParams({ path: normalizeRepoPath(repoPath) });
  return `/repo?${params.toString()}`;
}

function appendCommitSearchContext(
  params: URLSearchParams,
  searchContext?: DiffSearchContext | null,
): void {
  if (!searchContext) {
    return;
  }

  params.set("match_type", searchContext.matchType);
  params.set("highlight_strategy", searchContext.highlightStrategy);

  if (searchContext.query?.trim()) {
    params.set("search", searchContext.query.trim());
  }

  if (searchContext.filePath) {
    params.set("match_file", searchContext.filePath);
  }

  if (searchContext.newStart != null) {
    params.set("match_new_start", String(searchContext.newStart));
  }

  if (searchContext.oldStart != null) {
    params.set("match_old_start", String(searchContext.oldStart));
  }
}

function parseOptionalLineNumber(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildReviewRoute(
  repoPath: string,
  target: ReviewRouteTarget,
  options?: {
    tabId?: string | null;
  },
): string {
  const params = new URLSearchParams({ path: normalizeRepoPath(repoPath) });
  const tabId = String(options?.tabId || "").trim();

  if (tabId) {
    params.set("tab", tabId);
  }

  if (target.mode === "commit") {
    params.set("commit", target.commitSha);
    appendCommitSearchContext(params, target.searchContext);
  } else {
    if (target.baseRef) {
      params.set("base", target.baseRef);
    }

    if (target.headRef) {
      params.set("head", target.headRef);
    }
  }

  return `/repo/review?${params.toString()}`;
}

export function buildSettingsRoute(repoPath?: string | null): string {
  if (!repoPath) {
    return "/settings";
  }

  const params = new URLSearchParams({ path: normalizeRepoPath(repoPath) });
  return `/settings?${params.toString()}`;
}

export function readRepoPathFromSearchParams(
  searchParams: URLSearchParams
): string | null {
  const repoPath = searchParams.get("path");
  return repoPath ? normalizeRepoPath(repoPath) : null;
}

export function readReviewRefsFromSearchParams(searchParams: URLSearchParams): {
  baseRef: string | null;
  headRef: string | null;
} {
  return {
    baseRef: searchParams.get("base"),
    headRef: searchParams.get("head"),
  };
}

export function readReviewTabIdFromSearchParams(
  searchParams: URLSearchParams
): string | null {
  const tabId = searchParams.get("tab")?.trim();
  return tabId || null;
}

export function readReviewTargetFromSearchParams(
  searchParams: URLSearchParams,
): ReviewRouteTarget {
  const commitSha = searchParams.get("commit")?.trim();
  if (commitSha) {
    return {
      mode: "commit",
      commitSha,
      searchContext: readCommitSearchContextFromSearchParams(searchParams),
    };
  }

  const { baseRef, headRef } = readReviewRefsFromSearchParams(searchParams);
  return {
    mode: "compare",
    baseRef,
    headRef,
  };
}

export function readCommitSearchContextFromSearchParams(
  searchParams: URLSearchParams,
): DiffSearchContext | null {
  const matchType = searchParams.get("match_type");
  const highlightStrategy = searchParams.get("highlight_strategy");

  if (
    (matchType !== "commit" &&
      matchType !== "file_change" &&
      matchType !== "hunk") ||
    (highlightStrategy !== "exact_query" &&
      highlightStrategy !== "target_hunk" &&
      highlightStrategy !== "file_header" &&
      highlightStrategy !== "none")
  ) {
    return null;
  }

  return {
    query: searchParams.get("search"),
    matchType,
    filePath: searchParams.get("match_file"),
    newStart: parseOptionalLineNumber(searchParams.get("match_new_start")),
    oldStart: parseOptionalLineNumber(searchParams.get("match_old_start")),
    highlightStrategy,
  };
}

export function buildMonacoModelUri(
  repoPath: string,
  revisionId: string,
  filePath: string,
  side: MonacoSide
): string {
  const repoKey = getRepoStableKey(repoPath);
  const revisionKey = encodeURIComponent(revisionId);
  const fileKey = encodeURIComponent(filePath);
  return `file:///git-odyssey/${repoKey}/${revisionKey}/${fileKey}?side=${side}`;
}
