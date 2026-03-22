import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "danger";

const toneMap: Record<
  Tone,
  { wrapper: string; icon: typeof Info }
> = {
  info: {
    wrapper:
      "border-[rgba(122,162,255,0.28)] bg-[rgba(122,162,255,0.1)] text-[#d9e6ff]",
    icon: Info,
  },
  success: {
    wrapper:
      "border-[rgba(95,183,132,0.28)] bg-[rgba(95,183,132,0.1)] text-[#d8f1e1]",
    icon: CheckCircle2,
  },
  warning: {
    wrapper:
      "border-[rgba(199,154,86,0.28)] bg-[rgba(199,154,86,0.1)] text-[#f1e1c4]",
    icon: AlertTriangle,
  },
  danger: {
    wrapper:
      "border-[rgba(210,107,107,0.32)] bg-[rgba(210,107,107,0.12)] text-[#ffdede]",
    icon: ShieldAlert,
  },
};

export function InlineBanner({
  tone = "info",
  title,
  description,
  className,
}: {
  tone?: Tone;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  const Icon = toneMap[tone].icon;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-[var(--radius-control)] border px-3 py-2.5",
        toneMap[tone].wrapper,
        className
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description ? (
          <p className="text-xs leading-5 opacity-85">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
