import { useCallback, useEffect, useState } from "react";
import { FolderOpen, Loader2, History } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { getRecentProjects, pickGitProject } from "@/api/api";
import { Button } from "@/components/ui/button";
import type { GitProjectSummary } from "@/lib/definitions/desktop";
import { buildRepoRoute } from "@/lib/repoPaths";

export function GitProjectPicker() {
  const navigate = useNavigate();
  const [recentProjects, setRecentProjects] = useState<GitProjectSummary[]>([]);
  const [isPicking, setIsPicking] = useState(false);
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

  return (
    <div className="w-full max-w-2xl rounded-3xl border border-white/15 bg-slate-950/60 p-5 text-left shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">
            Git Project
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Open a local repository
          </h2>
          <p className="mt-2 text-sm text-white/60">
            Browse to any folder inside a repository and GitOdyssey will resolve
            the repo root automatically.
          </p>
        </div>
        <Button
          onClick={() => void handleBrowse()}
          disabled={isPicking}
          className="bg-cyan-500 text-slate-950 hover:bg-cyan-300"
        >
          {isPicking ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Browsing
            </>
          ) : (
            <>
              <FolderOpen className="h-4 w-4" />
              Browse
            </>
          )}
        </Button>
      </div>

      {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

      <div className="mt-6">
        <div className="mb-3 flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-white/45">
          <History className="h-4 w-4" />
          Recent Projects
        </div>
        {recentProjects.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-white/50">
            No recent Git projects yet. Choose one with Browse to get started.
          </div>
        ) : (
          <div className="grid gap-3">
            {recentProjects.map((project) => (
              <button
                key={project.path}
                type="button"
                onClick={() => openProject(project.path)}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left transition-colors hover:bg-white/10 hover:border-white/20"
              >
                <div className="text-base font-medium text-white">{project.name}</div>
                <div className="mt-1 break-all font-mono text-xs text-white/55">
                  {project.path}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
