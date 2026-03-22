import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

type WorkspaceBreadcrumb = {
  label: ReactNode;
  muted?: boolean;
  mono?: boolean;
  title?: string;
};

export function WorkspaceHeader({
  leading,
  breadcrumbs,
  title,
  subtitle,
  actions,
  className,
}: {
  leading?: ReactNode;
  breadcrumbs?: WorkspaceBreadcrumb[];
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-[var(--header-height)] items-center gap-4 px-4 py-2 backdrop-blur-md",
        className
      )}
    >
      {leading ? <div className="flex shrink-0 items-center gap-2">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        {breadcrumbs?.length ? (
          <div className="flex items-center gap-1.5 overflow-hidden text-[11px] text-text-tertiary">
            {breadcrumbs.map((crumb, index) => (
              <div
                key={`${index}-${crumb.title ?? String(index)}`}
                className="flex min-w-0 items-center gap-1.5"
                title={crumb.title}
              >
                {index > 0 ? <ChevronRight className="size-3 shrink-0" /> : null}
                <span
                  className={cn(
                    "truncate",
                    crumb.muted ? "text-text-tertiary" : "text-text-secondary",
                    crumb.mono && "font-mono"
                  )}
                >
                  {crumb.label}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="truncate text-[15px] font-semibold text-text-primary">{title}</div>
        {subtitle ? (
          <div className="truncate text-xs text-text-secondary">{subtitle}</div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
