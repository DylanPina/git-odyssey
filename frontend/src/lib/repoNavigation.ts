import { matchPath } from "react-router-dom";

export type RepoWorkflowRoute = "repo" | "commit" | "review";

export function getRepoWorkflowRoute(pathname: string): RepoWorkflowRoute | null {
  if (matchPath("/repo/commit/:commitSha", pathname)) {
    return "commit";
  }

  if (matchPath("/repo/review", pathname)) {
    return "review";
  }

  if (matchPath("/repo", pathname)) {
    return "repo";
  }

  return null;
}

export function getHistoryIndex(): number {
  if (typeof window === "undefined") {
    return 0;
  }

  const index = window.history.state?.idx;
  return typeof index === "number" ? index : 0;
}
