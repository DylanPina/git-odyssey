import { useCallback, useEffect, useState } from "react";
import { getCommit, summarizeFileChange, summarizeHunk } from "@/api/api";
import type { Commit, FileChange, FileHunk } from "@/lib/definitions/repo";

type UseCommitDetailsArgs = {
  owner?: string;
  repoName?: string;
  commitSha?: string;
};

type SummaryState = { loading: boolean; text?: string; error?: string };

type UseCommitDetails = {
  isLoading: boolean;
  error: string | null;
  commit: Commit | null;
  expanded: Record<string, boolean>;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  fileSummaries: Record<string, SummaryState>;
  setFileSummaries: React.Dispatch<React.SetStateAction<Record<string, SummaryState>>>;
  summaryOpen: Record<string, boolean>;
  setSummaryOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  hunkSummaries: Record<string, SummaryState>;
  setHunkSummaries: React.Dispatch<React.SetStateAction<Record<string, SummaryState>>>;
  hunkSummaryOpen: Record<string, boolean>;
  setHunkSummaryOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  handleSummarizeFile: (fc: FileChange) => Promise<void>;
  handleSummarizeHunk: (hunk: FileHunk) => Promise<void>;
};

export function useCommitDetails({ owner, repoName, commitSha }: UseCommitDetailsArgs): UseCommitDetails {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commit, setCommit] = useState<Commit | null>(null);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [fileSummaries, setFileSummaries] = useState<Record<string, SummaryState>>({});
  const [summaryOpen, setSummaryOpen] = useState<Record<string, boolean>>({});

  const [hunkSummaries, setHunkSummaries] = useState<Record<string, SummaryState>>({});
  const [hunkSummaryOpen, setHunkSummaryOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const load = async () => {
      if (!owner || !repoName || !commitSha) return;
      setIsLoading(true);
      setError(null);
      try {
        const response = await getCommit(owner, repoName, commitSha);
        if (!response.commit) throw new Error("Commit not found");
        setCommit(response.commit);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to load commit";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [owner, repoName, commitSha]);

  // Initialize expanded per file
  useEffect(() => {
    if (!commit) return;
    const files = commit.file_changes || [];
    const initial: Record<string, boolean> = {};
    for (const fc of files) {
      const labelPath = fc.new_path || fc.old_path || "unknown";
      initial[labelPath] = true;
    }
    setExpanded(initial);
  }, [commit]);

  // Seed summaries from payload
  useEffect(() => {
    if (!commit) return;
    const files = commit.file_changes || [];
    setFileSummaries((prev) => {
      const next = { ...prev };
      for (const fc of files) {
        const key = fc.id != null ? String(fc.id) : fc.new_path || fc.old_path || "unknown";
        if (fc.summary && !next[key]?.text) next[key] = { loading: false, text: fc.summary };
      }
      return next;
    });
    setSummaryOpen((prev) => {
      const next = { ...prev };
      for (const fc of files) {
        const key = fc.id != null ? String(fc.id) : fc.new_path || fc.old_path || "unknown";
        if (fc.summary && next[key] === undefined) next[key] = false;
      }
      return next;
    });
    setHunkSummaries((prev) => {
      const next = { ...prev };
      for (const fc of files) {
        for (const h of fc.hunks || []) {
          const key = h.id != null ? String(h.id) : undefined;
          if (!key) continue;
          if (h.summary && !next[key]?.text) next[key] = { loading: false, text: h.summary };
        }
      }
      return next;
    });
    setHunkSummaryOpen((prev) => {
      const next = { ...prev };
      for (const fc of files) {
        for (const h of fc.hunks || []) {
          const key = h.id != null ? String(h.id) : undefined;
          if (!key) continue;
          if (h.summary && next[key] === undefined) next[key] = false;
        }
      }
      return next;
    });
  }, [commit]);

  const handleSummarizeFile = useCallback(async (fc: FileChange) => {
    if (fc.id == null) return;
    const key = String(fc.id);
    setFileSummaries((prev) => ({ ...prev, [key]: { ...prev[key], loading: true, error: undefined } }));
    try {
      const summary = await summarizeFileChange(fc.id);
      setFileSummaries((prev) => ({ ...prev, [key]: { loading: false, text: summary } }));
      setSummaryOpen((prev) => ({ ...prev, [key]: true }));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to summarize file change";
      setFileSummaries((prev) => ({ ...prev, [key]: { loading: false, error: message, text: prev[key]?.text } }));
      setSummaryOpen((prev) => ({ ...prev, [key]: true }));
    }
  }, []);

  const handleSummarizeHunk = useCallback(async (hunk: FileHunk) => {
    if (hunk.id == null) return;
    const key = String(hunk.id);
    setHunkSummaries((prev) => ({ ...prev, [key]: { ...prev[key], loading: true, error: undefined } }));
    try {
      const summary = await summarizeHunk(hunk.id);
      setHunkSummaries((prev) => ({ ...prev, [key]: { loading: false, text: summary } }));
      setHunkSummaryOpen((prev) => ({ ...prev, [key]: true }));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to summarize hunk";
      setHunkSummaries((prev) => ({ ...prev, [key]: { loading: false, error: message, text: prev[key]?.text } }));
      setHunkSummaryOpen((prev) => ({ ...prev, [key]: true }));
    }
  }, []);

  return {
    isLoading,
    error,
    commit,
    expanded,
    setExpanded,
    fileSummaries,
    setFileSummaries,
    summaryOpen,
    setSummaryOpen,
    hunkSummaries,
    setHunkSummaries,
    hunkSummaryOpen,
    setHunkSummaryOpen,
    handleSummarizeFile,
    handleSummarizeHunk,
  };
}

export default useCommitDetails;


