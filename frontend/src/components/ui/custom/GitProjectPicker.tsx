import { useCallback, useEffect, useState } from "react";
import { FolderOpen, Loader2, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { deleteRepo, getRecentProjects, pickGitProject } from "@/api/api";
import { Button } from "@/components/ui/button";
import type { GitProjectSummary } from "@/lib/definitions/desktop";
import { buildRepoRoute, getRepoStableKey } from "@/lib/repoPaths";
import { repoCache } from "@/utils/repoCache";

const browseButtonClass =
  "h-11 rounded-full border border-[#bccdff]/46 bg-[linear-gradient(180deg,#93adff_0%,#8097ff_100%)] px-5 font-mono font-medium tracking-[0.01em] text-[#07101f] shadow-[0_0_0_1px_rgba(240,245,255,0.06),inset_0_1px_0_rgba(255,255,255,0.18),0_0_10px_rgba(122,162,255,0.1)] hover:border-[#d3ddff]/56 hover:bg-[linear-gradient(180deg,#9db6ff_0%,#8aa0ff_100%)] hover:shadow-[0_0_0_1px_rgba(245,248,255,0.08),inset_0_1px_0_rgba(255,255,255,0.22),0_0_12px_rgba(122,162,255,0.14)] active:bg-[linear-gradient(180deg,#88a2ff_0%,#7890ff_100%)] sm:min-w-32";

export function GitProjectPicker() {
  const navigate = useNavigate();
  const [recentProjects, setRecentProjects] = useState<GitProjectSummary[]>([]);
  const [isPicking, setIsPicking] = useState(false);
  const [deletingRepoPath, setDeletingRepoPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRecentProjects = useCallback(async () => {
    try {
      const projects = await getRecentProjects();
      setRecentProjects(projects);
      setError(null);
    } catch (recentError) {
      const message =
        recentError instanceof Error
          ? recentError.message
          : "Failed to load recent Git projects.";
      setError(message);
    }
  }, []);

  useEffect(() => {
    void loadRecentProjects();
  }, [loadRecentProjects]);

  const openProject = useCallback(
    (repoPath: string) => {
      navigate(buildRepoRoute(repoPath));
    },
    [navigate]
  );

  const handleBrowse = useCallback(async () => {
    setIsPicking(true);
    setError(null);

    try {
      const project = await pickGitProject();
      if (!project) {
        return;
      }

      await loadRecentProjects();
      openProject(project.path);
    } catch (pickError) {
      const message =
        pickError instanceof Error
          ? pickError.message
          : "Failed to choose a Git project.";
      setError(message);
    } finally {
      setIsPicking(false);
    }
  }, [loadRecentProjects, openProject]);

  const handleDeleteProject = useCallback(
    async (project: GitProjectSummary) => {
      const shouldDelete = window.confirm(
        `Delete ${project.name} from GitOdyssey?\n\nThis will remove the repository index, embeddings, review data, recent-project entry, and cached UI data for this repo.`
      );
      if (!shouldDelete) {
        return;
      }

      setDeletingRepoPath(project.path);
      setError(null);

      try {
        await deleteRepo(project.path);
        repoCache.clear(getRepoStableKey(project.path));
        await loadRecentProjects();
      } catch (deleteError) {
        const message =
          deleteError instanceof Error
            ? deleteError.message
            : "Failed to delete the repository.";
        setError(message);
      } finally {
        setDeletingRepoPath(null);
      }
    },
    [loadRecentProjects]
  );

  return (
    <div className="workspace-panel relative isolate space-y-6 overflow-hidden border-white/10 bg-[rgba(10,14,21,0.74)] p-6 shadow-[0_30px_90px_rgba(3,8,20,0.34),inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-md sm:p-7">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(122,162,255,0.07),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.025),transparent_24%)]"
      />

      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <h2 className="font-sans text-base font-semibold tracking-[-0.03em] text-text-primary">
            Open a repository
          </h2>
          <p className="font-mono text-sm font-normal tracking-[0.01em] text-text-secondary">
            Pick any folder inside a Git repository.
          </p>
        </div>
        <Button
          onClick={() => void handleBrowse()}
          disabled={isPicking}
          variant="accent"
          className={browseButtonClass}
        >
          {isPicking ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Browsing
            </>
          ) : (
            <>
              <FolderOpen className="size-4 -translate-y-px" />
              Browse
            </>
          )}
        </Button>
      </div>

      {error ? (
        <div className="relative z-10 rounded-[var(--radius-control)] border border-[rgba(210,107,107,0.28)] bg-[rgba(210,107,107,0.1)] px-3 py-2 font-mono text-sm font-normal tracking-[0.01em] text-[rgba(255,223,223,0.96)]">
          {error}
        </div>
      ) : null}

      {recentProjects.length > 0 ? (
        <div className="relative z-10 space-y-3">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(255,255,255,0.6)]">
            Recent
          </div>

          <div className="space-y-1.5 rounded-[calc(var(--radius-panel)-2px)] border border-white/[0.08] bg-black/10 p-2">
            {recentProjects.map((project) => (
              <div
                key={project.path}
                className="group flex items-start gap-2 rounded-[12px] border border-transparent px-2 py-2 transition-[background-color,border-color,box-shadow] duration-150 hover:border-white/[0.09] hover:bg-white/[0.045] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
              >
                <button
                  type="button"
                  onClick={() => openProject(project.path)}
                  className="flex min-w-0 flex-1 items-start rounded-[10px] px-2 py-2 text-left font-mono tracking-[0.01em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7aa2ff]/35"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-text-primary transition-colors group-hover:text-white group-focus-visible:text-white">
                      {project.name}
                    </div>
                    <div className="mt-1.5 truncate text-xs leading-5 text-[rgba(255,255,255,0.56)] transition-colors group-hover:text-[rgba(255,255,255,0.74)] group-focus-visible:text-[rgba(255,255,255,0.74)]">
                      {project.path}
                    </div>
                  </div>
                </button>
                <Button
                  type="button"
                  variant="toolbar"
                  size="toolbar-icon"
                  aria-label={`Delete ${project.name}`}
                  disabled={deletingRepoPath === project.path}
                  onClick={() => void handleDeleteProject(project)}
                  className="mt-1 shrink-0 text-[rgba(255,255,255,0.56)] hover:text-[rgba(255,130,130,0.96)]"
                >
                  {deletingRepoPath === project.path ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="relative z-10 rounded-[var(--radius-panel)] border border-dashed border-white/[0.08] bg-black/10 px-4 py-6 font-mono text-sm font-normal tracking-[0.01em] text-[rgba(255,255,255,0.58)]">
          No recent repositories.
        </div>
      )}
    </div>
  );
}
