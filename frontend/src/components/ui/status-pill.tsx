import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type StatusTone = "neutral" | "accent" | "success" | "warning" | "danger";

const toneClasses: Record<StatusTone, string> = {
  neutral:
    "border-border-subtle bg-control text-text-secondary",
  accent:
    "border-[rgba(122,162,255,0.28)] bg-[rgba(122,162,255,0.12)] text-[#c7d8ff]",
  success:
    "border-[rgba(95,183,132,0.28)] bg-[rgba(95,183,132,0.12)] text-[#d5f2df]",
  warning:
    "border-[rgba(199,154,86,0.28)] bg-[rgba(199,154,86,0.12)] text-[#f1e1c4]",
  danger:
    "border-[rgba(210,107,107,0.28)] bg-[rgba(210,107,107,0.12)] text-[#ffdede]",
};

export function StatusPill({
  children,
  tone = "neutral",
  icon,
  pulse = false,
  mono = false,
  className,
}: {
  children: ReactNode;
  tone?: StatusTone;
  icon?: ReactNode;
  pulse?: boolean;
  mono?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none",
        toneClasses[tone],
        mono && "font-mono",
        className
      )}
    >
      {pulse && (
        <span
          className={cn(
            "size-1.5 rounded-full",
            tone === "accent" && "bg-accent",
            tone === "success" && "bg-success",
            tone === "warning" && "bg-warning",
            tone === "danger" && "bg-danger",
            tone === "neutral" && "bg-text-tertiary"
          )}
        />
      )}
      {icon}
      {children}
    </span>
  );
}
