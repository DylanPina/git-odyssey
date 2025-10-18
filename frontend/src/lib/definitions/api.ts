import type { FilterFormData } from "../filter-utils";
import type { Commit, Branch } from "./repo";

export interface IngestRequest {
  url: string;
  max_commits?: number;
  context_lines?: number;
}

export interface IngestResponse {
  status: string;
}

export interface RepoResponse {
  commits: Commit[];
  branches: Branch[];
}

export interface FilterRequest {
  query: string;
  filters: FilterFormData;
  repo_url: string;
  max_results?: number;
}

export interface FilterResponse {
  commit_shas: string[];
}

export interface ChatRequest {
  query: string;
  context_shas: string[];
}

export interface ChatResponse {
  response: string;
}

export interface DatabaseResponse {
  status: string;
}

export interface CommitResponse {
  commit: Commit;
}

export interface CommitsResponse {
  commits: Commit[];
}