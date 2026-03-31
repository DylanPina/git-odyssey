import {
  getRepoDisplayName,
  readRepoPathFromSearchParams,
  readReviewTargetFromSearchParams,
} from "@/lib/repoPaths";
import {
  getReviewRefsStorageKey,
  getStoredReviewRefs,
} from "@/pages/review/review-storage";

const APP_NAME = "GitOdyssey";

export type DesktopTitleBarMeta = {
  sectionLabel: string | null;
  scopeLabel: string | null;
  detailLabel: string | null;
  detailTitle?: string | null;
  surface?: "default" | "transparent";
  documentTitle: string;
};

function buildDocumentTitle(...parts: Array<string | null | undefined>): string {
  return [...parts.filter(Boolean), APP_NAME].join(" · ");
}

export function resolveDesktopTitleBarMeta(
  pathname: string,
  searchParams: URLSearchParams
): DesktopTitleBarMeta {
  const repoPath = readRepoPathFromSearchParams(searchParams);
  const repoDisplayName = repoPath ? getRepoDisplayName(repoPath) : null;
  const repoPathDetail =
    repoPath && repoPath !== repoDisplayName ? repoPath : null;

  if (pathname === "/" || pathname === "/index.html") {
    return {
      sectionLabel: null,
      scopeLabel: null,
      detailLabel: null,
      surface: "transparent",
      documentTitle: buildDocumentTitle("Desktop"),
    };
  }

  if (pathname === "/repo/review") {
    const reviewTarget = readReviewTargetFromSearchParams(searchParams);
    const storedReviewRefs = getStoredReviewRefs(getReviewRefsStorageKey(repoPath));
    const baseRef =
      reviewTarget.mode === "compare"
        ? reviewTarget.baseRef ?? storedReviewRefs?.baseRef ?? null
        : null;
    const headRef =
      reviewTarget.mode === "compare"
        ? reviewTarget.headRef ?? storedReviewRefs?.headRef ?? null
        : null;
    const reviewRefLabel =
      reviewTarget.mode === "commit"
        ? `commit ${reviewTarget.commitSha.slice(0, 8)}`
        : baseRef && headRef
          ? `${baseRef} -> ${headRef}`
          : null;

    return {
      sectionLabel: null,
      scopeLabel: repoDisplayName ?? "Repository",
      detailLabel: reviewRefLabel ?? repoPathDetail,
      detailTitle: reviewRefLabel ?? repoPath,
      surface: "default",
      documentTitle: buildDocumentTitle("Review", repoDisplayName, reviewRefLabel),
    };
  }

  if (pathname === "/settings") {
    return {
      sectionLabel: "Settings",
      scopeLabel: repoDisplayName ?? "Local Workspace",
      detailLabel: repoPathDetail,
      detailTitle: repoPath,
      surface: "default",
      documentTitle: buildDocumentTitle("Settings", repoDisplayName),
    };
  }

  if (pathname === "/repo") {
    return {
      sectionLabel: null,
      scopeLabel: repoDisplayName ?? "Repository",
      detailLabel: repoPathDetail,
      detailTitle: repoPath,
      surface: "default",
      documentTitle: buildDocumentTitle("Repository", repoDisplayName),
    };
  }

  return {
    sectionLabel: "Workspace",
    scopeLabel: repoDisplayName,
    detailLabel: repoPathDetail,
    detailTitle: repoPath,
    surface: "default",
    documentTitle: buildDocumentTitle("Workspace", repoDisplayName),
  };
}
