import { ArrowLeft, ArrowRight, ChevronsDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type {
  DesktopTitleBarAction,
  DesktopTitleBarChrome,
} from "@/lib/desktop-titlebar-actions";
import type { DesktopTitleBarMeta } from "@/lib/desktop-titlebar";

type DesktopPlatform = "macos" | "windows" | "linux" | "unknown";

function getDesktopPlatform(): DesktopPlatform {
  if (typeof navigator === "undefined") {
    return "unknown";
  }

  const browserNavigator = navigator as Navigator & {
    userAgentData?: {
      platform?: string;
    };
  };
  const platformLabel =
    browserNavigator.userAgentData?.platform || browserNavigator.platform || "";
  const normalizedPlatform = platformLabel.toLowerCase();

  if (normalizedPlatform.includes("mac")) {
    return "macos";
  }

  if (normalizedPlatform.includes("win")) {
    return "windows";
  }

  if (normalizedPlatform.includes("linux")) {
    return "linux";
  }

  return "unknown";
}

function renderTitleBarActionIcon(action: DesktopTitleBarAction) {
  if (action.id === "collapse-all-files") {
    return <ChevronsDown className="size-4" />;
  }

  return null;
}

export function DesktopTitleBar({
  meta,
  actions = [],
  chrome,
  navigation,
}: {
  meta: DesktopTitleBarMeta;
  actions?: DesktopTitleBarAction[];
  chrome?: DesktopTitleBarChrome | null;
  navigation?: {
    canGoBack: boolean;
    canGoForward: boolean;
    onGoBack: () => void;
    onGoForward: () => void;
  } | null;
}) {
  const platform = getDesktopPlatform();
  const title = [meta.scopeLabel, meta.detailTitle ?? meta.detailLabel]
    .filter(Boolean)
    .join(" · ");
  const { leading, trailing } = chrome ?? {};

  return (
    <header
      className="desktop-titlebar"
      data-platform={platform}
      data-surface={meta.surface ?? "default"}
    >
      <div className="desktop-titlebar__side desktop-titlebar__side--leading">
        <div
          className="desktop-titlebar__safe-space desktop-titlebar__safe-space--leading"
          aria-hidden="true"
        />

        {leading || navigation ? (
          <div className="desktop-titlebar__start">
            {leading ? (
              <div className="desktop-titlebar__leading">{leading}</div>
            ) : null}

            {navigation ? (
              <div className="desktop-titlebar__navigation">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        variant="toolbar"
                        size="toolbar-icon"
                        className="desktop-titlebar__action-button"
                        onClick={navigation.onGoBack}
                        disabled={!navigation.canGoBack}
                        aria-label="Go back"
                      >
                        <ArrowLeft className="size-4" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Go back</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        variant="toolbar"
                        size="toolbar-icon"
                        className="desktop-titlebar__action-button"
                        onClick={navigation.onGoForward}
                        disabled={!navigation.canGoForward}
                        aria-label="Go forward"
                      >
                        <ArrowRight className="size-4" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Go forward</TooltipContent>
                </Tooltip>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="desktop-titlebar__center">
        <div
          className="desktop-titlebar__content"
          title={title || meta.documentTitle}
        >
          {meta.sectionLabel ? (
            <span className="desktop-titlebar__section">{meta.sectionLabel}</span>
          ) : null}

          {meta.scopeLabel ? (
            <span className="desktop-titlebar__scope">{meta.scopeLabel}</span>
          ) : null}

          {meta.detailLabel ? (
            <>
              <span className="desktop-titlebar__dot" aria-hidden="true" />
              <span className="desktop-titlebar__detail">{meta.detailLabel}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="desktop-titlebar__side desktop-titlebar__side--trailing">
        <div className="desktop-titlebar__trailing">
          {trailing ? (
            <div className="desktop-titlebar__slot desktop-titlebar__slot--trailing">
              {trailing}
            </div>
          ) : null}

          {actions.length > 0 ? (
            <div className="desktop-titlebar__actions">
              {actions.map((action) => (
                <Tooltip key={action.id}>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        variant="toolbar"
                        size="toolbar-icon"
                        className="desktop-titlebar__action-button"
                        onClick={action.onClick}
                        disabled={action.disabled}
                        aria-label={action.label}
                      >
                        {renderTitleBarActionIcon(action)}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{action.label}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          ) : null}
        </div>

        <div
          className="desktop-titlebar__safe-space desktop-titlebar__safe-space--trailing"
          aria-hidden="true"
        />
      </div>
    </header>
  );
}
