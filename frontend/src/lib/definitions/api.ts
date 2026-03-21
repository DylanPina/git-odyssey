import type { Citation } from "./chat";
import type { FilterFormData } from "../filter-utils";
import type { Commit, Branch } from "./repo";

export interface IngestRequest {
  repo_path: string;
  max_commits?: number;
  context_lines?: number;
  force?: boolean;
}

export interface IngestResponse {
  status: string;
}

export interface RepoResponse {
  repo_path: string;
  commits: Commit[];
  branches: Branch[];
  reindex_required: boolean;
}

export interface FilterRequest {
  query: string;
  filters: FilterFormData;
  repo_path: string;
  max_results?: number;
}

export interface FilterResponse {
  commit_shas: string[];
}

export interface ChatRequest {
  query: string;
  repo_path: string;
  context_shas: string[];
}

export interface ChatResponse {
  response: string;
  cited_commits: Citation[];
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
