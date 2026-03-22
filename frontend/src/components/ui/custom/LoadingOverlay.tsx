import { Database, Loader2 } from "lucide-react";

import { StatusPill } from "@/components/ui/status-pill";

export function LoadingOverlay({
  isVisible,
  isIngesting,
  ingestStatus,
}: {
  isVisible: boolean;
  isIngesting?: boolean;
  ingestStatus?: string;
}) {
  if (!isVisible) return null;

  const Icon = isIngesting ? Database : Loader2;

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
              ? "GitOdyssey is indexing repository history from disk. Large repositories can take a moment."
              : "Preparing this workspace view."}
          </p>
        </div>
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
