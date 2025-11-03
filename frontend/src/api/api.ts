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

export interface User {
  id: number;
  github_id: number;
  username: string;
  email?: string;
  installation_id?: string;
  api_credits_remaining: number;
  created_at: string;
  updated_at: string;
}

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

// Auth endpoints
export const getLoginUrl = (): string => {
  const baseUrl =
    import.meta.env.VITE_API_URL ||
    api.defaults.baseURL ||
    "https://git-odyssey.onrender.com";
  return `${baseUrl}/auth/login`;
};

export const getCurrentUser = async (): Promise<User> => {
  const response = await api.get<User>("/auth/me");
  return response.data;
};

export const logout = async (): Promise<{ message: string }> => {
  const response = await api.post<{ message: string }>("/auth/logout");
  return response.data;
};
