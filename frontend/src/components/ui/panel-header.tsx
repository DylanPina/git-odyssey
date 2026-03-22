import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PanelHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? <p className="workspace-section-label">{eyebrow}</p> : null}
        <div className="text-[18px] font-semibold text-text-primary">{title}</div>
        {description ? (
          <p className="max-w-3xl text-sm leading-6 text-text-secondary">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
