import type { ChatCodeContext, ChatFindingContext } from "./chat";
import type { FileChange } from "./repo";

export type ReviewTargetMode = "compare" | "commit";

export interface ReviewCompareRequest {
	repo_path: string;
	target_mode: ReviewTargetMode;
	base_ref: string;
	head_ref: string;
	commit_sha?: string | null;
	context_lines: number;
}

export interface ReviewStats {
	files_changed: number;
	additions: number;
	deletions: number;
}

export interface ReviewCompareResponse {
	repo_path: string;
	target_mode: ReviewTargetMode;
	base_ref: string;
	head_ref: string;
	commit_sha?: string | null;
	merge_base_sha: string;
	stats: ReviewStats;
	file_changes: FileChange[];
	truncated: boolean;
}

export interface GenerateReviewRequest {
	repo_path: string;
	target_mode: ReviewTargetMode;
	base_ref: string;
	head_ref: string;
	commit_sha?: string | null;
	context_lines: number;
}

export type ReviewSeverity = "high" | "medium" | "low";
export type ReviewSessionStatus =
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";
export type ReviewRunStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";
export type ReviewApprovalStatus =
  | "pending"
  | "accepted"
  | "accepted_for_session"
  | "declined"
  | "cancelled";
export type ReviewApprovalDecision =
  | "accept"
  | "acceptForSession"
  | "decline"
  | "cancel";

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

export interface ReviewRunEvent {
	id: number;
	run_id: string;
	sequence: number;
	event_type: string;
	payload: Record<string, unknown>;
	created_at: string;
}

export interface ReviewApproval {
	id: string;
	run_id: string;
	method: string;
	status: ReviewApprovalStatus;
	summary?: string | null;
	thread_id?: string | null;
	turn_id?: string | null;
	item_id?: string | null;
	request_payload: Record<string, unknown>;
	response_payload?: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
}

export interface ReviewResult {
	id: string;
	run_id: string;
	summary: string;
	findings: ReviewFinding[];
	partial: boolean;
	generated_at: string;
	created_at: string;
	updated_at: string;
}

export interface ReviewSeverityCounts {
	high: number;
	medium: number;
	low: number;
}

export interface ReviewHistoryEntry {
	session_id: string;
	run_id: string;
	repo_path: string;
	target_mode: ReviewTargetMode;
	base_ref: string;
	head_ref: string;
	commit_sha?: string | null;
	merge_base_sha: string;
	base_head_sha: string;
	head_head_sha: string;
	engine: string;
	mode: string;
	partial: boolean;
	summary: string;
	findings_count: number;
	severity_counts: ReviewSeverityCounts;
	generated_at: string;
	completed_at?: string | null;
	run_created_at: string;
}

export interface ReviewHistoryResponse {
	items: ReviewHistoryEntry[];
}

export interface ReviewRun {
	id: string;
	session_id: string;
	engine: string;
	mode: string;
	status: ReviewRunStatus;
	custom_instructions?: string | null;
	applied_instructions?: string | null;
	error_detail?: string | null;
	review_thread_id?: string | null;
	worktree_path?: string | null;
	codex_home_path?: string | null;
	started_at?: string | null;
	completed_at?: string | null;
	created_at: string;
	updated_at: string;
	events: ReviewRunEvent[];
	approvals: ReviewApproval[];
	result?: ReviewResult | null;
}

export interface ReviewSession {
	id: string;
	repo_path: string;
	target_mode: ReviewTargetMode;
	base_ref: string;
	head_ref: string;
	commit_sha?: string | null;
	merge_base_sha: string;
	base_head_sha: string;
	head_head_sha: string;
	stats: ReviewStats;
	file_changes: FileChange[];
	truncated: boolean;
	status: ReviewSessionStatus;
	created_at: string;
	updated_at: string;
	runs: ReviewRun[];
}

export interface ReviewRuntimeEvent {
	type: "review-runtime-changed" | "review-runtime-log";
	sessionId?: string;
	runId?: string;
	level?: string;
	source?: string;
	message?: string;
}

export interface ReviewChatContext {
	runStatus?: ReviewRunStatus | null;
	summary?: string | null;
	appliedInstructions?: string | null;
	findings: ReviewFinding[];
}

export interface ReviewChatTranscriptMessage {
	role: "user" | "assistant";
	content: string;
	codeContexts?: ChatCodeContext[];
	findingContexts?: ChatFindingContext[];
}

export interface ReviewChatRequest {
	sessionId: string;
	runId?: string | null;
	message: string;
	codeContexts: ChatCodeContext[];
	findingContexts: ChatFindingContext[];
	messages: ReviewChatTranscriptMessage[];
	reviewContext?: ReviewChatContext | null;
}

export interface ReviewChatResponse {
	response: string;
}
