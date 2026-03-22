import type { FileChange } from "./repo";

export interface ReviewCompareRequest {
	repo_path: string;
	base_ref: string;
	head_ref: string;
	context_lines: number;
}

export interface ReviewStats {
	files_changed: number;
	additions: number;
	deletions: number;
}

export interface ReviewCompareResponse {
	repo_path: string;
	base_ref: string;
	head_ref: string;
	merge_base_sha: string;
	stats: ReviewStats;
	file_changes: FileChange[];
	truncated: boolean;
}

export interface GenerateReviewRequest {
	repo_path: string;
	base_ref: string;
	head_ref: string;
	context_lines: number;
}

export type ReviewSeverity = "high" | "medium" | "low";

export interface ReviewFinding {
	id: string;
	severity: ReviewSeverity;
	title: string;
	body: string;
	file_path: string;
	new_start?: number | null;
	old_start?: number | null;
}

export interface ReviewReport {
	summary: string;
	findings: ReviewFinding[];
	partial: boolean;
	generated_at: string;
}
