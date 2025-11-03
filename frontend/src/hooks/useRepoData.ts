import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { getRepo, ingestRepo } from "../api/api";
import { isAxiosError } from "axios";
import type { Branch, Commit } from "@/lib/definitions/repo";
import { repoCache } from "@/utils/repoCache";

const MAX_COMMITS = 50;
const MAX_BRANCHES = 5;

type UseRepoDataArgs = {
  owner?: string;
  repoName?: string;
};

type UseRepoData = {
  commits: Commit[];
  branches: Branch[];
  isLoading: boolean;
  isIngesting: boolean;
  ingestStatus: string;
  refresh: () => Promise<void>;
};

export function useRepoData({ owner, repoName }: UseRepoDataArgs): UseRepoData {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isIngesting, setIsIngesting] = useState<boolean>(false);
  const [ingestStatus, setIngestStatus] = useState<string>("");
  const didIngest = useRef(false);
  const cacheKey = useMemo(() => {
    if (!owner || !repoName) return null;
    return `${owner}/${repoName}`;
  }, [owner, repoName]);

  // Function to ingest repository synchronously (blocking) and set data
  const ingestRepository = useCallback(async (): Promise<boolean> => {
    if (!owner || !repoName) return false;

    setIsIngesting(true);
    setIngestStatus("Creating repository in database...");

    const data = await ingestRepo(
      `https://github.com/${owner}/${repoName}`,
      MAX_COMMITS,
      MAX_BRANCHES
    );

    const fetchedCommits = (data?.commits ?? []) as Commit[];
    const fetchedBranches = (data?.branches ?? []) as Branch[];

    if (fetchedCommits.length > 0) {
      if (cacheKey) {
        repoCache.set(cacheKey, {
          commits: fetchedCommits,
          branches: fetchedBranches,
          timestamp: Date.now(),
        });
      }
    }

    setCommits(fetchedCommits);
    setBranches(fetchedBranches);
    setIngestStatus("Repository created successfully!");
    setIsIngesting(false);
    return fetchedCommits.length > 0;
  }, [owner, repoName, cacheKey]);

  const getRepository = useCallback(async (): Promise<boolean> => {
    if (!cacheKey || !owner || !repoName) return false;
    setIsLoading(true);
    try {
      const response = await getRepo(owner!, repoName!);
      const fetchedCommits = response.commits as Commit[];
      const fetchedBranches = response.branches as Branch[];

      if (fetchedCommits && fetchedCommits.length > 0) {
        repoCache.set(cacheKey, {
          commits: fetchedCommits,
          branches: fetchedBranches,
          timestamp: Date.now(),
        });
      }
      setCommits(fetchedCommits);
      setBranches(fetchedBranches);
      return (fetchedCommits?.length ?? 0) > 0;
    } catch (error: unknown) {
      if (!(isAxiosError(error) && error.response?.status === 404)) {
        console.error("Error fetching repository:", error);
      }
      setCommits([]);
      setBranches([]);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [cacheKey, owner, repoName]);

  const load = useCallback(async () => {
    if (!cacheKey || !owner || !repoName) {
      setCommits([]);
      setBranches([]);
      setIsLoading(false);
      return;
    }

    const cached = repoCache.get(cacheKey!);
    if (cached && repoCache.isValid(cached)) {
      setCommits(cached!.commits);
      setBranches(cached!.branches);
      return;
    }

    const exists = await getRepository();
    if (!exists) {
      await ingestRepository();
    }
  }, [cacheKey, owner, repoName, getRepository, ingestRepository]);

  useEffect(() => {
    if (!cacheKey || didIngest.current) return;
    didIngest.current = true;
    const cached = repoCache.get(cacheKey);
    if (repoCache.isValid(cached)) {
      setCommits(cached!.commits);
      setBranches(cached!.branches);
      return;
    }

    load();
  }, [cacheKey, load]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  return {
    commits,
    branches,
    isLoading,
    isIngesting,
    ingestStatus,
    refresh,
  };
}
