import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowUpRight,
  FolderCog,
  FolderOpen,
  History,
  Loader2,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import {
  getDesktopRepoSettings,
  getRecentProjects,
  pickGitProject,
  saveDesktopRepoSettings,
} from "@/api/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineBanner } from "@/components/ui/inline-banner";
import { Input } from "@/components/ui/input";
import { PanelHeader } from "@/components/ui/panel-header";
import { StatusPill } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_DESKTOP_REPO_SETTINGS,
  type GitProjectSummary,
} from "@/lib/definitions/desktop";
import {
  buildRepoRoute,
  buildSettingsRoute,
  getRepoDisplayName,
} from "@/lib/repoPaths";

type RepoSettingsFormState = {
  maxCommits: string;
  contextLines: string;
  pullRequestGuidelines: string;
};

function buildInitialState() {
  return {
    maxCommits: String(DEFAULT_DESKTOP_REPO_SETTINGS.maxCommits),
    contextLines: String(DEFAULT_DESKTOP_REPO_SETTINGS.contextLines),
    pullRequestGuidelines: DEFAULT_DESKTOP_REPO_SETTINGS.pullRequestGuidelines,
  };
}

function parseMaxCommits(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseContextLines(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function RepoSettingsCard({ repoPath }: { repoPath?: string | null }) {
  const navigate = useNavigate();
  const [recentProjects, setRecentProjects] = useState<GitProjectSummary[]>([]);
  const [formState, setFormState] = useState<RepoSettingsFormState>(() =>
    buildInitialState(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPickingRepo, setIsPickingRepo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const repoLabel = useMemo(
    () => (repoPath ? getRepoDisplayName(repoPath) : null),
    [repoPath],
  );

  const loadRecentProjects = useCallback(async () => {
    try {
      const projects = await getRecentProjects();
      setRecentProjects(projects);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Failed to load recent repositories.";
      setError(message);
    }
  }, []);

  useEffect(() => {
    void loadRecentProjects();
  }, [loadRecentProjects]);

  useEffect(() => {
    const loadRepoSettings = async () => {
      if (!repoPath) {
        setFormState(buildInitialState());
        setError(null);
        setFeedback(null);
        return;
      }

      setIsLoading(true);
      setError(null);
      setFeedback(null);

      try {
        const repoSettings = await getDesktopRepoSettings(repoPath);
        setFormState({
          maxCommits: String(repoSettings.maxCommits),
          contextLines: String(repoSettings.contextLines),
          pullRequestGuidelines: repoSettings.pullRequestGuidelines,
        });
      } catch (loadError) {
        const message =
          loadError instanceof Error
            ? loadError.message
            : "Failed to load repository settings.";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    void loadRepoSettings();
  }, [repoPath]);

  const handlePickRepo = useCallback(async () => {
    setIsPickingRepo(true);
    setError(null);

    try {
      const project = await pickGitProject();
      if (!project) {
        return;
      }

      await loadRecentProjects();
      navigate(buildSettingsRoute(project.path));
    } catch (pickError) {
      const message =
        pickError instanceof Error
          ? pickError.message
          : "Failed to choose a Git repository.";
      setError(message);
    } finally {
      setIsPickingRepo(false);
    }
  }, [loadRecentProjects, navigate]);

  const handleSave = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!repoPath) {
        setError("Choose a repository before saving repo-specific settings.");
        return;
      }

      const maxCommits = parseMaxCommits(formState.maxCommits);
      const contextLines = parseContextLines(formState.contextLines);

      if (maxCommits == null) {
        setError("Max commits must be a whole number greater than zero.");
        return;
      }

      if (contextLines == null) {
        setError(
          "Context lines must be a whole number that is zero or higher.",
        );
        return;
      }

      setIsSaving(true);
      setError(null);
      setFeedback(null);

      try {
        const savedSettings = await saveDesktopRepoSettings({
          repoPath,
          maxCommits,
          contextLines,
          pullRequestGuidelines: formState.pullRequestGuidelines,
        });
        setFormState({
          maxCommits: String(savedSettings.maxCommits),
          contextLines: String(savedSettings.contextLines),
          pullRequestGuidelines: savedSettings.pullRequestGuidelines,
        });
        setFeedback(
          "Saved. Indexing applies on the next refresh or reindex, and review guidance applies on the next run.",
        );
      } catch (saveError) {
        const message =
          saveError instanceof Error
            ? saveError.message
            : "Failed to save repository settings.";
        setError(message);
      } finally {
        setIsSaving(false);
      }
    },
    [
      formState.contextLines,
      formState.maxCommits,
      formState.pullRequestGuidelines,
      repoPath,
    ],
  );

  return (
    <section className="workspace-panel-elevated space-y-5 p-5 sm:p-6">
      <PanelHeader
        eyebrow="Repository Settings"
        title="Per-repo indexing and review defaults"
        description="Adjust history depth, diff context, and repo-specific review guidance for the selected repository."
        actions={
          <StatusPill tone={repoPath ? "accent" : "neutral"}>
            {repoPath ? "Repo selected" : "No repo selected"}
          </StatusPill>
        }
      />

      {error ? <InlineBanner tone="danger" title={error} /> : null}

      {!repoPath ? (
        <div className="space-y-4">
          <EmptyState
            icon={<FolderCog className="size-4" />}
            title="Choose a repository to edit repo-specific settings"
            description="Global AI settings work without a selected repository. Pick a repo here when you want to control its ingest defaults and repo-specific review guidance."
            action={
              <Button
                type="button"
                variant="accent"
                onClick={() => void handlePickRepo()}
                disabled={isPickingRepo}
              >
                {isPickingRepo ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Choosing
                  </>
                ) : (
                  <>
                    <FolderOpen className="size-4" />
                    Choose Repository
                  </>
                )}
              </Button>
            }
          />

          {recentProjects.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-text-tertiary">
                <History className="size-4" />
                Recent Repositories
              </div>
              <div className="workspace-panel overflow-hidden">
                {recentProjects.map((project) => (
                  <button
                    key={project.path}
                    type="button"
                    onClick={() => navigate(buildSettingsRoute(project.path))}
                    className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition-[background-color,border-color,color] duration-150 hover:bg-control/70"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-text-primary">
                        {project.name}
                      </div>
                      <div className="mt-1 truncate font-mono text-xs text-text-tertiary">
                        {project.path}
                      </div>
                    </div>
                    <StatusPill tone="neutral">Use repo</StatusPill>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="workspace-panel flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-medium text-text-primary">
                  {repoLabel}
                </div>
                <StatusPill tone="neutral">Scoped to this repo</StatusPill>
              </div>
              <p className="break-all font-mono text-xs leading-5 text-text-tertiary">
                {repoPath}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                type="button"
                variant="subtle"
                onClick={() => void handlePickRepo()}
                disabled={isPickingRepo}
              >
                {isPickingRepo ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Choosing
                  </>
                ) : (
                  <>
                    <FolderOpen className="size-4" />
                    Change Repo
                  </>
                )}
              </Button>
              <Button type="button" variant="toolbar" asChild>
                <Link to={buildRepoRoute(repoPath)}>
                  <ArrowUpRight className="size-4" />
                  Open Repo
                </Link>
              </Button>
              <Button
                type="button"
                variant="toolbar"
                onClick={() => navigate(buildSettingsRoute())}
              >
                App-wide only
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="workspace-panel flex items-center gap-3 px-4 py-4 text-sm text-text-secondary">
              <Loader2 className="size-4 animate-spin" />
              Loading repository settings...
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSave}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5 text-sm text-text-secondary">
                  <span>Max commits</span>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={formState.maxCommits}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        maxCommits: event.target.value,
                      }))
                    }
                  />
                  <p className="text-xs leading-5 text-text-tertiary">
                    Controls how much repository history GitOdyssey indexes for
                    this repo.
                  </p>
                </label>

                <label className="space-y-1.5 text-sm text-text-secondary">
                  <span>Diff context lines</span>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={formState.contextLines}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        contextLines: event.target.value,
                      }))
                    }
                  />
                  <p className="text-xs leading-5 text-text-tertiary">
                    Controls how many unchanged lines the diff viewer keeps
                    visible around each change, and the diff context GitOdyssey
                    stores for this repo.
                  </p>
                </label>
              </div>

              <label className="space-y-1.5 text-sm text-text-secondary">
                <span>Repo-specific review guidelines</span>
                <Textarea
                  value={formState.pullRequestGuidelines}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      pullRequestGuidelines: event.target.value,
                    }))
                  }
                  placeholder="Example: Be extra strict about migration safety and backwards compatibility for this repository."
                  className="min-h-32"
                />
                <p className="text-xs leading-5 text-text-tertiary">
                  These rules are appended after the app-wide review guidelines
                  for this repository only.
                </p>
              </label>

              <div className="flex flex-wrap gap-3">
                <Button type="submit" variant="accent" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Saving
                    </>
                  ) : (
                    "Save Repository Settings"
                  )}
                </Button>
                {feedback ? (
                  <div className="flex items-center text-sm text-[#d5f2df]">
                    {feedback}
                  </div>
                ) : null}
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
