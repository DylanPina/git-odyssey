import { ArrowLeft, ChevronsDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DesktopTitleBarAction } from "@/lib/desktop-titlebar-actions";
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
  showGoBack = false,
  onGoBack,
}: {
  meta: DesktopTitleBarMeta;
  actions?: DesktopTitleBarAction[];
  showGoBack?: boolean;
  onGoBack?: () => void;
}) {
  const platform = getDesktopPlatform();
  const title = [meta.scopeLabel, meta.detailTitle ?? meta.detailLabel]
    .filter(Boolean)
    .join(" · ");

  return (
    <header className="desktop-titlebar" data-platform={platform}>
      <div
        className="desktop-titlebar__safe-space desktop-titlebar__safe-space--leading"
        aria-hidden="true"
      />

      <div
        className="desktop-titlebar__content"
        title={title || meta.documentTitle}
      >
        <span className="desktop-titlebar__section">{meta.sectionLabel}</span>

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

      <div className="desktop-titlebar__trailing">
        <div className="desktop-titlebar__drag-spacer" aria-hidden="true" />

        {actions.length > 0 || showGoBack ? (
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

            {showGoBack ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant="toolbar"
                      size="toolbar-icon"
                      className="desktop-titlebar__action-button"
                      onClick={onGoBack}
                      disabled={!onGoBack}
                      aria-label="Go back"
                    >
                      <ArrowLeft className="size-4" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Go back</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        ) : null}

        <div
          className="desktop-titlebar__safe-space desktop-titlebar__safe-space--trailing"
          aria-hidden="true"
        />
      </div>
    </header>
  );
}
