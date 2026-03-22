import { useEffect } from "react";
import { matchPath, useLocation, useNavigate } from "react-router-dom";

import {
  buildRepoRoute,
  readRepoPathFromSearchParams,
} from "@/lib/repoPaths";

type RepoWorkflowRoute = "repo" | "commit" | "review";
type NavigationShortcut = "back" | "forward";

function getRepoWorkflowRoute(pathname: string): RepoWorkflowRoute | null {
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

function getHistoryIndex(): number {
  const index = window.history.state?.idx;
  return typeof index === "number" ? index : 0;
}

function isMacPlatform(): boolean {
  const nav = navigator as Navigator & {
    userAgentData?: {
      platform?: string;
    };
  };
  const platform = nav.userAgentData?.platform ?? nav.platform ?? nav.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

function getTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }

  if (target instanceof Node) {
    return target.parentElement;
  }

  return null;
}

function isMonacoTarget(target: EventTarget | null): boolean {
  return Boolean(getTargetElement(target)?.closest(".monaco-editor"));
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = getTargetElement(target);
  if (!element) {
    return false;
  }

  // Monaco uses a hidden textarea even in our read-only diff viewer. We
  // explicitly allow those events so repo navigation still works while the
  // diff has focus.
  if (isMonacoTarget(target)) {
    return false;
  }

  if (element.closest("input, textarea, select")) {
    return true;
  }

  if (element.closest("[role='textbox'], [role='searchbox']")) {
    return true;
  }

  return element instanceof HTMLElement ? element.isContentEditable : false;
}

function getNavigationShortcut(
  event: KeyboardEvent,
  isMac: boolean,
): NavigationShortcut | null {
  if (event.repeat || event.isComposing) {
    return null;
  }

  if (isMac) {
    if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      if (event.code === "BracketLeft" || event.key === "[") {
        return "back";
      }

      if (event.code === "BracketRight" || event.key === "]") {
        return "forward";
      }
    }

    return null;
  }

  if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
    if (event.code === "BracketLeft" || event.key === "[") {
      return "back";
    }

    if (event.code === "BracketRight" || event.key === "]") {
      return "forward";
    }
  }

  if (event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
    if (event.key === "ArrowLeft") {
      return "back";
    }

    if (event.key === "ArrowRight") {
      return "forward";
    }
  }

  return null;
}

export function useRepoNavigationShortcuts() {
  const location = useLocation();
  const navigate = useNavigate();
  const route = getRepoWorkflowRoute(location.pathname);
  const repoPath = readRepoPathFromSearchParams(
    new URLSearchParams(location.search),
  );

  useEffect(() => {
    if (!route) {
      return;
    }

    const isMac = isMacPlatform();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented && !isMonacoTarget(event.target)) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      const shortcut = getNavigationShortcut(event, isMac);
      if (!shortcut) {
        return;
      }

      if (shortcut === "forward") {
        event.preventDefault();
        navigate(1);
        return;
      }

      const historyIndex = getHistoryIndex();
      if (historyIndex > 0) {
        event.preventDefault();
        navigate(-1);
        return;
      }

      if (route === "commit" || route === "review") {
        event.preventDefault();
        navigate(repoPath ? buildRepoRoute(repoPath) : "/", { replace: true });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, repoPath, route]);
}

export default useRepoNavigationShortcuts;
