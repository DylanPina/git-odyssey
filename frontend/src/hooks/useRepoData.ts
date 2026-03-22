import { useCallback, useEffect, useMemo, useState } from "react";

import { getDesktopRepoSettings, getRepo, ingestRepo } from "@/api/api";
import type { DesktopRepoSettings } from "@/lib/definitions/desktop";
import type { Branch, Commit } from "@/lib/definitions/repo";
import { getRepoStableKey } from "@/lib/repoPaths";
import { repoCache } from "@/utils/repoCache";

type UseRepoDataArgs = {
  repoPath?: string | null;
};

type RefreshOptions = {
  force?: boolean;
};

type UseRepoData = {
  commits: Commit[];
  branches: Branch[];
  isLoading: boolean;
  isIngesting: boolean;
  ingestStatus: string;
  error: string | null;
  refresh: (options?: RefreshOptions) => Promise<void>;
};

function isRepoMissingError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message === "Repository not found";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to load repository.";
}

export function useRepoData({ repoPath }: UseRepoDataArgs): UseRepoData {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isIngesting, setIsIngesting] = useState<boolean>(false);
  const [ingestStatus, setIngestStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const cacheKey = useMemo(() => {
    if (!repoPath) {
      return null;
    }
    return getRepoStableKey(repoPath);
  }, [repoPath]);

  const updateRepoState = useCallback(
    (
      nextCommits: Commit[],
      nextBranches: Branch[],
      repoSettings: DesktopRepoSettings
    ) => {
      setCommits(nextCommits);
      setBranches(nextBranches);

      if (cacheKey && nextCommits.length > 0) {
        repoCache.set(cacheKey, {
          commits: nextCommits,
          branches: nextBranches,
          timestamp: Date.now(),
          repoSettings,
        });
      }
    },
    [cacheKey]
  );

  const loadRepoSettings = useCallback(async (): Promise<DesktopRepoSettings> => {
    if (!repoPath) {
      throw new Error("Repository settings require a repository path.");
    }

    return getDesktopRepoSettings(repoPath);
  }, [repoPath]);

  const ingestRepository = useCallback(
    async (
      force: boolean = false,
      repoSettings?: DesktopRepoSettings
    ): Promise<boolean> => {
      if (!repoPath) {
        return false;
      }

      const activeRepoSettings = repoSettings ?? (await loadRepoSettings());

      setIsIngesting(true);
      setError(null);
      setIngestStatus(
        force ? "Refreshing repository from disk..." : "Indexing repository from disk..."
      );

      try {
        const data = await ingestRepo(
          repoPath,
          activeRepoSettings.maxCommits,
          activeRepoSettings.contextLines,
          force
        );
        const fetchedCommits = (data?.commits ?? []) as Commit[];
        const fetchedBranches = (data?.branches ?? []) as Branch[];
        updateRepoState(fetchedCommits, fetchedBranches, activeRepoSettings);
        setIngestStatus(
          force ? "Repository refreshed successfully." : "Repository indexed successfully."
        );
        return true;
      } catch (ingestError) {
        setError(getErrorMessage(ingestError));
        return false;
      } finally {
        setIsIngesting(false);
      }
    },
    [loadRepoSettings, repoPath, updateRepoState]
  );

  const getRepository = useCallback(
    async (repoSettings?: DesktopRepoSettings): Promise<boolean> => {
      if (!repoPath) {
        return false;
      }

      const activeRepoSettings = repoSettings ?? (await loadRepoSettings());

      setIsLoading(true);
      setError(null);

      try {
        const response = await getRepo(repoPath, activeRepoSettings);
        const fetchedCommits = response.commits as Commit[];
        const fetchedBranches = response.branches as Branch[];
        updateRepoState(fetchedCommits, fetchedBranches, activeRepoSettings);
        return true;
      } catch (fetchError: unknown) {
        if (isRepoMissingError(fetchError)) {
          return false;
        }

        setCommits([]);
        setBranches([]);
        setError(getErrorMessage(fetchError));
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [loadRepoSettings, repoPath, updateRepoState]
  );

  const load = useCallback(
    async ({ force = false }: RefreshOptions = {}) => {
      if (!cacheKey || !repoPath) {
        setCommits([]);
        setBranches([]);
        setError(null);
        setIsLoading(false);
        return;
      }

      try {
        const repoSettings = await loadRepoSettings();

        if (force) {
          repoCache.clear(cacheKey);
          await ingestRepository(true, repoSettings);
          return;
        }

        const cached = repoCache.get(cacheKey);
        if (
          cached &&
          repoCache.isValid(cached) &&
          repoCache.matchesSettings(cached, repoSettings)
        ) {
          setCommits(cached.commits);
          setBranches(cached.branches);
          setError(null);
          const exists = await getRepository(repoSettings);
          if (!exists) {
            await ingestRepository(false, repoSettings);
          }
          return;
        }

        if (cached && repoCache.isValid(cached)) {
          repoCache.clear(cacheKey);
          await ingestRepository(true, repoSettings);
          return;
        }

        const exists = await getRepository(repoSettings);
        if (!exists) {
          await ingestRepository(false, repoSettings);
        }
      } catch (loadError) {
        setCommits([]);
        setBranches([]);
        setError(getErrorMessage(loadError));
        setIsLoading(false);
        setIsIngesting(false);
      }
    },
    [
      cacheKey,
      getRepository,
      ingestRepository,
      loadRepoSettings,
      repoPath,
    ]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(
    async (options?: RefreshOptions) => {
      await load(options);
    },
    [load]
  );

  return {
    commits,
    branches,
    isLoading,
    isIngesting,
    ingestStatus,
    error,
    refresh,
  };
}
