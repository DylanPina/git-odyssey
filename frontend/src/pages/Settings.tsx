import { useSearchParams } from "react-router-dom";

import { RepoSettingsCard } from "@/components/ui/custom/RepoSettingsCard";
import { ReviewGuidelinesCard } from "@/components/ui/custom/ReviewGuidelinesCard";
import { DesktopSetupCard } from "@/components/ui/custom/DesktopSetupCard";
import { TokenSecretsCard } from "@/components/ui/custom/TokenSecretsCard";
import { useAuth } from "@/hooks/useAuth";
import { readRepoPathFromSearchParams } from "@/lib/repoPaths";

export function Settings() {
  const [searchParams] = useSearchParams();
  const repoPath = readRepoPathFromSearchParams(searchParams);
  const { desktopSettingsStatus, desktopHealth, isLoading, checkAuth } =
    useAuth();
  const isInitialLoading = isLoading && !desktopSettingsStatus && !desktopHealth;

  return (
    <div className="workspace-shell overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 px-4 py-8 lg:px-8">
        {isInitialLoading ? (
          <section className="workspace-panel-elevated p-5 sm:p-6">
            <div className="workspace-panel flex items-center gap-3 px-4 py-4 text-sm text-text-secondary">
              <span className="size-5 animate-spin rounded-full border-2 border-border-strong border-t-accent" />
              Loading local desktop settings...
            </div>
          </section>
        ) : (
          <>
            <DesktopSetupCard
              desktopSettingsStatus={desktopSettingsStatus}
              desktopHealth={desktopHealth}
              onCredentialsSaved={checkAuth}
              header={{
                eyebrow: "Models & Providers",
                title: "AI runtime and endpoints",
                description:
                  "Set the providers and model IDs GitOdyssey should use, then validate only when you want to test the current draft.",
              }}
            />

            <TokenSecretsCard
              desktopSettingsStatus={desktopSettingsStatus}
              desktopHealth={desktopHealth}
            />

            <ReviewGuidelinesCard
              desktopSettingsStatus={desktopSettingsStatus}
            />

            <RepoSettingsCard repoPath={repoPath} />
          </>
        )}
      </div>
    </div>
  );
}
