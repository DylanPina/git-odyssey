import { matchPath } from "react-router-dom";

import {
  getRepoDisplayName,
  readRepoPathFromSearchParams,
  readReviewRefsFromSearchParams,
} from "@/lib/repoPaths";

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
  const commitMatch = matchPath("/repo/commit/:commitSha", pathname);

  if (pathname === "/" || pathname === "/index.html") {
    return {
      sectionLabel: null,
      scopeLabel: null,
      detailLabel: null,
      surface: "transparent",
      documentTitle: buildDocumentTitle("Desktop"),
    };
  }

  if (commitMatch) {
    const commitSha = commitMatch.params.commitSha ?? null;
    const shortSha = commitSha ? commitSha.slice(0, 8) : null;

    return {
      sectionLabel: null,
      scopeLabel: repoDisplayName ?? "Repository",
      detailLabel: shortSha,
      detailTitle: commitSha,
      surface: "default",
      documentTitle: buildDocumentTitle(
        shortSha ? `Commit ${shortSha}` : "Commit",
        repoDisplayName
      ),
    };
  }

  if (pathname === "/repo/review") {
    const { baseRef, headRef } = readReviewRefsFromSearchParams(searchParams);
    const reviewRefLabel = baseRef && headRef ? `${baseRef} -> ${headRef}` : null;

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
