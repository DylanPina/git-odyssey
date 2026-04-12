import { ArrowLeft, FolderGit2, Settings2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { RepoSettingsCard } from "@/components/ui/custom/RepoSettingsCard";
import { ReviewGuidelinesCard } from "@/components/ui/custom/ReviewGuidelinesCard";
import { DesktopSetupCard } from "@/components/ui/custom/DesktopSetupCard";
import { TokenSecretsCard } from "@/components/ui/custom/TokenSecretsCard";
import { Button } from "@/components/ui/button";
import { PanelHeader } from "@/components/ui/panel-header";
import { StatusPill } from "@/components/ui/status-pill";
import { useAuth } from "@/hooks/useAuth";
import {
  buildRepoRoute,
  getRepoDisplayName,
  readRepoPathFromSearchParams,
} from "@/lib/repoPaths";

export function Settings() {
  const [searchParams] = useSearchParams();
  const repoPath = readRepoPathFromSearchParams(searchParams);
  const { desktopSettingsStatus, desktopHealth, isLoading, checkAuth } = useAuth();
  const isInitialLoading = isLoading && !desktopSettingsStatus && !desktopHealth;

  return (
    <div className="workspace-shell overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 px-4 py-8 lg:px-8">
        <section className="workspace-panel-elevated space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="toolbar" size="toolbar" asChild>
              <Link to={repoPath ? buildRepoRoute(repoPath) : "/"}>
                <ArrowLeft className="size-4" />
                {repoPath ? "Back To Repo" : "Back Home"}
              </Link>
            </Button>

            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="accent" icon={<Settings2 className="size-3" />}>
                Unified settings
              </StatusPill>
              {repoPath ? (
                <StatusPill tone="neutral" icon={<FolderGit2 className="size-3" />}>
                  {getRepoDisplayName(repoPath)}
                </StatusPill>
              ) : null}
            </div>
          </div>

          <PanelHeader
            title="Settings"
            description="Manage models, provider credentials, saved tokens, and repository indexing defaults from one place."
          />

          {isInitialLoading ? (
            <div className="workspace-panel flex items-center gap-3 px-4 py-4 text-sm text-text-secondary">
              <span className="size-5 animate-spin rounded-full border-2 border-border-strong border-t-accent" />
              Loading local desktop settings...
            </div>
          ) : null}
        </section>

        {!isInitialLoading ? (
          <>
            <DesktopSetupCard
              desktopSettingsStatus={desktopSettingsStatus}
              desktopHealth={desktopHealth}
              onCredentialsSaved={checkAuth}
              header={{
                eyebrow: "Models & Providers",
                title: "Configure AI runtime and endpoints",
                description:
                  "Choose the providers, model IDs, and saved credentials GitOdyssey should use for chat, summaries, and semantic search.",
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
        ) : null}
      </div>
    </div>
  );
}
