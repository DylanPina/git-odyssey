import { Database, Loader2 } from "lucide-react";

import { StatusPill } from "@/components/ui/status-pill";

export function LoadingOverlay({
  isVisible,
  isIngesting,
  ingestStatus,
  progressPercent,
  progressLabel,
  progressPhase,
  progressCompletedUnits,
  progressTotalUnits,
}: {
  isVisible: boolean;
  isIngesting?: boolean;
  ingestStatus?: string;
  progressPercent?: number | null;
  progressLabel?: string | null;
  progressPhase?: string | null;
  progressCompletedUnits?: number | null;
  progressTotalUnits?: number | null;
}) {
  if (!isVisible) return null;

  const Icon = isIngesting ? Database : Loader2;
  const showProgress = isIngesting && progressPercent != null;
  const progressDetail =
    showProgress &&
    progressCompletedUnits != null &&
    progressTotalUnits != null &&
    progressTotalUnits > 0
      ? progressPhase === "embedding"
        ? `Embedding batches ${progressCompletedUnits} / ${progressTotalUnits}`
        : `${progressCompletedUnits} / ${progressTotalUnits} completed`
      : null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/42 backdrop-blur-[2px]">
      <div className="workspace-panel-elevated max-w-md space-y-4 px-5 py-5 text-center">
        <div className="flex items-center justify-center">
          <div className="flex size-12 items-center justify-center rounded-full border border-border-subtle bg-control text-text-primary">
            <Icon className={isIngesting ? "size-5" : "size-5 animate-spin"} />
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium text-text-primary">
            {isIngesting ? "Loading repository data" : "Loading view"}
          </div>
          <p className="text-sm leading-6 text-text-secondary">
            {isIngesting
              ? "GitOdyssey is analyzing commits and preparing repository insights."
              : "Preparing this workspace view."}
          </p>
        </div>
        {showProgress ? (
          <div className="space-y-2 text-left">
            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.12em] text-text-secondary">
              <span>{progressLabel ?? ingestStatus ?? "Syncing repository"}</span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-control">
              <div
                className="h-full rounded-full bg-primary shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_0_18px_rgba(122,162,255,0.35)] transition-[width] duration-200 ease-out"
                style={{ width: `${Math.min(Math.max(progressPercent, 0), 100)}%` }}
              />
            </div>
            {progressDetail ? (
              <p className="text-xs leading-5 text-text-tertiary">{progressDetail}</p>
            ) : null}
          </div>
        ) : null}
        {ingestStatus ? (
          <div className="flex justify-center">
            <StatusPill tone={isIngesting ? "accent" : "neutral"}>
              {ingestStatus}
            </StatusPill>
          </div>
        ) : null}
      </div>
    </div>
  );
}
