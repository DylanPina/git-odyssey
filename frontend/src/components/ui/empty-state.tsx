import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "workspace-panel flex flex-col items-start gap-3 px-4 py-5 text-left",
        className
      )}
    >
      {icon ? (
        <div className="flex size-10 items-center justify-center rounded-[12px] border border-border-subtle bg-control text-text-secondary">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <div className="text-sm font-medium text-text-primary">{title}</div>
        {description ? (
          <p className="text-sm leading-6 text-text-secondary">{description}</p>
        ) : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
