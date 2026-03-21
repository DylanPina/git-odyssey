import { useCallback, useEffect, useMemo, useState } from "react";

import { getRepo, ingestRepo } from "@/api/api";
import type { Branch, Commit } from "@/lib/definitions/repo";
import { getRepoStableKey } from "@/lib/repoPaths";
import { repoCache } from "@/utils/repoCache";

const MAX_COMMITS = 50;
const CONTEXT_LINES = 3;

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
    (nextCommits: Commit[], nextBranches: Branch[]) => {
      setCommits(nextCommits);
      setBranches(nextBranches);

      if (cacheKey && nextCommits.length > 0) {
        repoCache.set(cacheKey, {
          commits: nextCommits,
          branches: nextBranches,
          timestamp: Date.now(),
        });
      }
    },
    [cacheKey]
  );

  const ingestRepository = useCallback(
    async (force: boolean = false): Promise<boolean> => {
      if (!repoPath) {
        return false;
      }

      setIsIngesting(true);
      setError(null);
      setIngestStatus(
        force ? "Refreshing repository from disk..." : "Indexing repository from disk..."
      );

      try {
        const data = await ingestRepo(repoPath, MAX_COMMITS, CONTEXT_LINES, force);
        const fetchedCommits = (data?.commits ?? []) as Commit[];
        const fetchedBranches = (data?.branches ?? []) as Branch[];
        updateRepoState(fetchedCommits, fetchedBranches);
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
    [repoPath, updateRepoState]
  );

  const getRepository = useCallback(async (): Promise<boolean> => {
    if (!repoPath) {
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await getRepo(repoPath);
      const fetchedCommits = response.commits as Commit[];
      const fetchedBranches = response.branches as Branch[];
      updateRepoState(fetchedCommits, fetchedBranches);
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
  }, [repoPath, updateRepoState]);

  const load = useCallback(
    async ({ force = false }: RefreshOptions = {}) => {
      if (!cacheKey || !repoPath) {
        setCommits([]);
        setBranches([]);
        setError(null);
        setIsLoading(false);
        return;
      }

      if (force) {
        repoCache.clear(cacheKey);
        await ingestRepository(true);
        return;
      }

      const cached = repoCache.get(cacheKey);
      if (cached && repoCache.isValid(cached)) {
        setCommits(cached.commits);
        setBranches(cached.branches);
        setError(null);
        const exists = await getRepository();
        if (!exists) {
          await ingestRepository(false);
        }
        return;
      }

      const exists = await getRepository();
      if (!exists) {
        await ingestRepository(false);
      }
    },
    [cacheKey, repoPath, getRepository, ingestRepository]
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
