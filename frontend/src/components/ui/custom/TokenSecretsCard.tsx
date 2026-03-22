import { KeyRound, ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { PanelHeader } from "@/components/ui/panel-header";
import { StatusPill } from "@/components/ui/status-pill";
import type {
  DesktopHealthStatus,
  DesktopSettingsStatus,
  ProviderProfileConfig,
} from "@/lib/definitions/desktop";

function getSecretStatus(
  profile: ProviderProfileConfig,
  desktopHealth: DesktopHealthStatus | null
) {
  if (profile.auth_mode === "none" || !profile.api_key_secret_ref) {
    return {
      label: "No auth required",
      tone: "neutral" as const,
    };
  }

  const secretPresent = Boolean(
    desktopHealth?.credentials.secretRefs?.[profile.api_key_secret_ref]
  );

  return secretPresent
    ? {
        label: "Stored in keychain",
        tone: "success" as const,
      }
    : {
        label: "Missing key",
        tone: "warning" as const,
      };
}

export function TokenSecretsCard({
  desktopSettingsStatus,
  desktopHealth,
}: {
  desktopSettingsStatus: DesktopSettingsStatus | null;
  desktopHealth: DesktopHealthStatus | null;
}) {
  const profiles = desktopSettingsStatus?.aiRuntimeConfig.profiles ?? [];

  return (
    <section className="workspace-panel-elevated space-y-5 p-5 sm:p-6">
      <PanelHeader
        eyebrow="Tokens & Secrets"
        title="Stored provider credentials"
        description="API keys stay in the local macOS keychain. Update them in Models & Providers, and leave a key blank there when you want to reuse the saved secret."
        actions={
          <StatusPill
            tone={profiles.some((profile) => profile.auth_mode !== "none") ? "accent" : "neutral"}
          >
            Local only
          </StatusPill>
        }
      />

      {profiles.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="size-4" />}
          title="No provider profiles configured yet"
          description="Add a model provider above and GitOdyssey will track whether its credential is already stored locally."
        />
      ) : (
        <div className="grid gap-3">
          {profiles.map((profile) => {
            const secretStatus = getSecretStatus(profile, desktopHealth);
            const capabilities = [
              profile.supports_text_generation ? "Text generation" : null,
              profile.supports_embeddings ? "Embeddings" : null,
            ].filter((value): value is string => Boolean(value));

            return (
              <div
                key={profile.id}
                className="workspace-panel flex flex-col gap-3 px-4 py-4 md:flex-row md:items-start md:justify-between"
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium text-text-primary">
                      {profile.label}
                    </div>
                    <StatusPill tone="neutral">
                      {profile.provider_type === "openai"
                        ? "OpenAI"
                        : "OpenAI-compatible"}
                    </StatusPill>
                  </div>

                  <p className="break-all text-sm leading-6 text-text-secondary">
                    {profile.base_url || "Uses the default provider base URL."}
                  </p>

                  {capabilities.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {capabilities.map((capability) => (
                        <StatusPill key={capability} tone="neutral">
                          {capability}
                        </StatusPill>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
                  <StatusPill
                    tone={secretStatus.tone}
                    icon={<ShieldCheck className="size-3" />}
                  >
                    {secretStatus.label}
                  </StatusPill>
                  {profile.api_key_secret_ref ? (
                    <div className="font-mono text-xs text-text-tertiary">
                      {profile.api_key_secret_ref}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
