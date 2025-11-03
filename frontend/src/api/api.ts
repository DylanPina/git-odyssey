import { api } from "../axios";
import type {
  RepoResponse,
  FilterResponse,
  ChatResponse,
  DatabaseResponse,
  CommitResponse,
  CommitsResponse,
} from "../lib/definitions/api";
import type { FilterFormData } from "@/lib/filter-utils";

export const getRepo = async (
  owner: string,
  repoName: string
): Promise<RepoResponse> => {
  const response = await api.get<RepoResponse>(`/repo/${owner}/${repoName}`);
  return response.data;
};

export const ingestRepo = async (
  githubUrl: string,
  maxCommits: number = 50,
  contextLines: number = 3
): Promise<RepoResponse> => {
  const response = await api.post<RepoResponse>("/ingest", {
    url: githubUrl,
    max_commits: maxCommits,
    context_lines: contextLines,
  });
  return response.data;
};

export const filterCommits = async (
  query: string,
  filters: FilterFormData,
  repoUrl: string,
  maxResults?: number
): Promise<FilterResponse> => {
  const response = await api.post<FilterResponse>("/filter", {
    query,
    filters,
    repo_url: repoUrl,
    max_results: maxResults,
  });
  return response.data;
};

export const summarizeCommit = async (sha: string): Promise<string> => {
  const response = await api.get<string>(`/summarize/commit/${sha}`);
  return response.data;
};

export const summarizeFileChange = async (id: number): Promise<string> => {
  const response = await api.get<string>(`/summarize/file_change/${id}`);
  return response.data;
};

export const summarizeHunk = async (id: number): Promise<string> => {
  const response = await api.get<string>(`/summarize/hunk/${id}`);
  return response.data;
};

export const sendChatMessage = async (
  query: string,
  contextShas: string[]
): Promise<ChatResponse> => {
  const response = await api.post<ChatResponse>("/chat", {
    query,
    context_shas: contextShas,
  });
  return response.data;
};

export const initDatabase = async (): Promise<DatabaseResponse> => {
  const response = await api.post<DatabaseResponse>("/init");
  return response.data;
};

export const dropDatabase = async (): Promise<DatabaseResponse> => {
  const response = await api.delete<DatabaseResponse>("/drop");
  return response.data;
};

export const getCommit = async (
  owner: string,
  repoName: string,
  commitSha: string
): Promise<CommitResponse> => {
  const response = await api.get<CommitResponse>(
    `/repo/${owner}/${repoName}/commit/${commitSha}`
  );
  return response.data;
};

export const getCommits = async (
  owner: string,
  repoName: string
): Promise<CommitsResponse> => {
  const response = await api.get<CommitsResponse>(
    `/repo/${owner}/${repoName}/commits`
  );
  return response.data;
};
