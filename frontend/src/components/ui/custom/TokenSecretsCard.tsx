import { ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { PanelHeader } from "@/components/ui/panel-header";
import { StatusPill } from "@/components/ui/status-pill";
import type {
  DesktopHealthStatus,
  DesktopSettingsStatus,
} from "@/lib/definitions/desktop";

export function TokenSecretsCard({
  desktopSettingsStatus,
  desktopHealth,
}: {
  desktopSettingsStatus: DesktopSettingsStatus | null;
  desktopHealth: DesktopHealthStatus | null;
}) {
  const googleStatus =
    desktopHealth?.ai.google ?? desktopSettingsStatus?.ai.google ?? null;
  const projectId =
    googleStatus?.projectId ??
    desktopSettingsStatus?.aiRuntimeConfig.google_project_id ??
    null;
  const location =
    googleStatus?.location ??
    desktopSettingsStatus?.aiRuntimeConfig.google_location ??
    "us-central1";

  return (
    <section className="workspace-panel-elevated space-y-5 p-5 sm:p-6">
      <PanelHeader
        eyebrow="Google Credentials"
        title="Application Default Credentials"
        description="GitOdyssey uses your local Google Cloud ADC identity and does not store provider secrets."
        actions={
          <StatusPill tone={googleStatus?.adcReady ? "success" : "warning"}>
            {googleStatus?.adcReady ? "ADC ready" : "ADC check"}
          </StatusPill>
        }
      />

      {projectId ? (
        <div className="workspace-panel flex flex-col gap-3 px-4 py-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-medium text-text-primary">
                {projectId}
              </div>
              <StatusPill tone="accent">{location}</StatusPill>
            </div>
            <p className="break-all text-sm leading-6 text-text-secondary">
              {googleStatus?.message ??
                "Google AI calls will use the ADC account configured on this machine."}
            </p>
          </div>

          <StatusPill
            tone={googleStatus?.adcReady ? "success" : "warning"}
            icon={<ShieldCheck className="size-3" />}
          >
            {googleStatus?.adcReady ? "Authenticated" : "Needs ADC"}
          </StatusPill>
        </div>
      ) : (
        <EmptyState
          title="No Google project configured yet"
          description="Add a project ID and region above, then validate the selected targets."
        />
      )}
    </section>
  );
}
