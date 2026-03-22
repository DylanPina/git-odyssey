export type MonacoSide = "original" | "modified";

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

export function buildCommitRoute(repoPath: string, commitSha: string): string {
  const params = new URLSearchParams({ path: normalizeRepoPath(repoPath) });
  return `/repo/commit/${commitSha}?${params.toString()}`;
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

export function buildMonacoModelUri(
  repoPath: string,
  commitSha: string,
  filePath: string,
  side: MonacoSide
): string {
  const repoKey = getRepoStableKey(repoPath);
  const fileKey = encodeURIComponent(filePath);
  return `file:///git-odyssey/${repoKey}/${commitSha}/${fileKey}?side=${side}`;
}
