import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
	ChevronDown,
	ChevronRight,
	GitCommitHorizontal,
	Loader2,
	Maximize2,
	Minimize2,
	PanelRightOpen,
	Play,
	ShieldAlert,
	Square,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
	cancelReviewRun,
	createReviewSession,
	getDesktopRepoSettings,
	getReviewHistory,
	getReviewRun,
	getReviewSession,
	onReviewRuntimeEvent,
	respondReviewApproval,
	startReviewRun,
} from "@/api/api";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/custom/Combobox";
import { DatePicker } from "@/components/ui/custom/DatePicker";
import {
	DiffWorkspace,
	type DiffWorkspaceHandle,
} from "@/components/ui/custom/DiffWorkspace";
import { CommitToolbar } from "@/components/ui/custom/CommitToolbar";
import { MarkdownRenderer } from "@/components/ui/custom/MarkdownRenderer";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { InlineBanner } from "@/components/ui/inline-banner";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import { useRepoData } from "@/hooks/useRepoData";
import { getFileChangeLabelPath } from "@/lib/diff";
import type { Commit } from "@/lib/definitions/repo";
import type {
	ReviewApproval,
	ReviewApprovalDecision,
	ReviewFinding,
	ReviewHistoryEntry,
	ReviewResult,
	ReviewRun,
	ReviewRunEvent,
	ReviewRuntimeEvent,
	ReviewSession,
} from "@/lib/definitions/review";
import {
	buildRepoRoute,
	buildReviewRoute,
	getRepoStableKey,
	readRepoPathFromSearchParams,
	readReviewRefsFromSearchParams,
} from "@/lib/repoPaths";
import { cn } from "@/lib/utils";

const DETACHED_HEAD_LABEL = "HEAD (detached)";
const ACTIVE_RUN_STATUSES = new Set(["pending", "running", "awaiting_approval"]);
const REVIEW_SELECTED_REFS_STORAGE_KEY_PREFIX = "git-odyssey.review.selected_refs";
const REVIEW_FILE_TREE_WIDTH_STORAGE_KEY = "git-odyssey.review.file_tree_width";
const REVIEW_RIGHT_RAIL_WIDTH_STORAGE_KEY = "git-odyssey.review.right_rail_width";
const REVIEW_FILE_TREE_WIDTH_DEFAULT = 320;
const REVIEW_FILE_TREE_WIDTH_MIN = 240;
const REVIEW_RIGHT_RAIL_WIDTH_DEFAULT = 384;
const REVIEW_RIGHT_RAIL_WIDTH_MIN = 320;
const REVIEW_DIFF_MIN_WIDTH = 512;

type ReviewBranchTipCardProps = {
	label: string;
	branchName: string;
	commit: Commit | null;
	isLoading: boolean;
};

type ReviewMetaPillProps = {
	label: string;
	value: string;
	isMono?: boolean;
};

type ReasoningTraceEntry = {
	id: string;
	method: string | null;
	text: string;
	stableText: string;
	latestDeltaText: string | null;
	sequence: number;
	createdAt: string | null;
};

type ReviewPanelMode = "collapsed" | "rail" | "fullscreen";
type PersistedReviewRefs = {
	baseRef: string;
	headRef: string;
};

type SelectedReviewHistoryView = {
	entry: ReviewHistoryEntry;
	session: ReviewSession;
	run: ReviewRun;
};

type ReviewHistoryOutcomeFilter = "all" | "with_findings" | "clean";
type ReviewHistorySeverityFilter = "any" | "has_high" | "has_medium" | "has_low";

const REVIEW_HISTORY_OUTCOME_OPTIONS: Array<{
	value: ReviewHistoryOutcomeFilter;
	label: string;
}> = [
	{ value: "all", label: "All reviews" },
	{ value: "with_findings", label: "With findings" },
	{ value: "clean", label: "Clean reviews" },
];
const REVIEW_HISTORY_SEVERITY_OPTIONS: Array<{
	value: ReviewHistorySeverityFilter;
	label: string;
}> = [
	{ value: "any", label: "Any severity" },
	{ value: "has_high", label: "Has high" },
	{ value: "has_medium", label: "Has medium" },
	{ value: "has_low", label: "Has low" },
];

function clampPanelWidth(width: number, minWidth: number) {
	return Math.max(minWidth, width);
}

function getReviewRefsStorageKey(repoPath?: string | null) {
	return repoPath
		? `${REVIEW_SELECTED_REFS_STORAGE_KEY_PREFIX}:${getRepoStableKey(repoPath)}`
		: null;
}

function getStoredReviewPanelWidth(
	storageKey: string,
	defaultWidth: number,
	minWidth: number,
) {
	const fallbackWidth = clampPanelWidth(defaultWidth, minWidth);
	if (typeof window === "undefined") {
		return fallbackWidth;
	}

	try {
		const storedWidth = window.localStorage.getItem(storageKey);
		if (storedWidth === null) {
			return fallbackWidth;
		}

		const parsedWidth = Number.parseFloat(storedWidth);
		if (Number.isNaN(parsedWidth)) {
			return fallbackWidth;
		}

		return clampPanelWidth(parsedWidth, minWidth);
	} catch {
		return fallbackWidth;
	}
}

function getStoredReviewRefs(storageKey: string | null): PersistedReviewRefs | null {
	if (typeof window === "undefined" || !storageKey) {
		return null;
	}

	try {
		const storedRefs = window.localStorage.getItem(storageKey);
		if (!storedRefs) {
			return null;
		}

		const parsed = JSON.parse(storedRefs);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return null;
		}

		const baseRef =
			typeof parsed.baseRef === "string" ? parsed.baseRef : "";
		const headRef =
			typeof parsed.headRef === "string" ? parsed.headRef : "";

		return baseRef || headRef ? { baseRef, headRef } : null;
	} catch {
		return null;
	}
}

function persistStoredReviewRefs(
	storageKey: string | null,
	{ baseRef, headRef }: PersistedReviewRefs,
) {
	if (typeof window === "undefined" || !storageKey) {
		return;
	}

	try {
		if (!baseRef && !headRef) {
			window.localStorage.removeItem(storageKey);
			return;
		}

		window.localStorage.setItem(
			storageKey,
			JSON.stringify({ baseRef, headRef }),
		);
	} catch {
		// Ignore storage issues and keep the in-memory state.
	}
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Something went wrong.";
}

function getSeverityTone(severity: ReviewFinding["severity"]) {
	if (severity === "high") {
		return "danger";
	}

	if (severity === "medium") {
		return "warning";
	}

	return "accent";
}

function getRunStatusTone(status?: ReviewRun["status"] | ReviewSession["status"] | null) {
	if (status === "completed") {
		return "success";
	}

	if (status === "failed" || status === "cancelled") {
		return "danger";
	}

	if (status === "running" || status === "awaiting_approval" || status === "pending") {
		return "warning";
	}

	return "neutral";
}

function getApprovalTone(status: ReviewApproval["status"]) {
	if (status === "accepted" || status === "accepted_for_session") {
		return "success";
	}

	if (status === "declined" || status === "cancelled") {
		return "danger";
	}

	return "warning";
}

function formatLabel(value: string) {
	return value
		.split(/[_-]/g)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function formatSeverityLabel(severity: ReviewFinding["severity"]) {
	return severity.charAt(0).toUpperCase() + severity.slice(1);
}

function formatGeneratedAt(value?: string | null) {
	if (!value) {
		return "Unknown";
	}

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return value;
	}

	return parsed.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function getFindingCountLabel(count: number) {
	return count === 0 ? "Clean" : `${count} finding${count === 1 ? "" : "s"}`;
}

function getHistoryOutcomeTone(entry: ReviewHistoryEntry) {
	if (entry.severity_counts.high > 0) {
		return "danger";
	}

	if (entry.severity_counts.medium > 0) {
		return "warning";
	}

	if (entry.findings_count > 0) {
		return "accent";
	}

	return "success";
}

function getSeverityCountEntries(entry: ReviewHistoryEntry) {
	return [
		{
			key: "high",
			label: `High ${entry.severity_counts.high}`,
			count: entry.severity_counts.high,
			tone: "danger" as const,
		},
		{
			key: "medium",
			label: `Medium ${entry.severity_counts.medium}`,
			count: entry.severity_counts.medium,
			tone: "warning" as const,
		},
		{
			key: "low",
			label: `Low ${entry.severity_counts.low}`,
			count: entry.severity_counts.low,
			tone: "accent" as const,
		},
	].filter((item) => item.count > 0);
}

function startOfLocalDay(value: Date) {
	const normalized = new Date(value);
	normalized.setHours(0, 0, 0, 0);
	return normalized.getTime();
}

function endOfLocalDay(value: Date) {
	const normalized = new Date(value);
	normalized.setHours(23, 59, 59, 999);
	return normalized.getTime();
}

function buildReviewHistorySearchText(entry: ReviewHistoryEntry) {
	const severityTokens = [
		entry.severity_counts.high > 0 ? "has high" : "",
		entry.severity_counts.medium > 0 ? "has medium" : "",
		entry.severity_counts.low > 0 ? "has low" : "",
	];

	return [
		entry.session_id,
		entry.run_id,
		entry.base_ref,
		entry.head_ref,
		entry.merge_base_sha,
		entry.base_head_sha,
		entry.head_head_sha,
		formatShortSha(entry.merge_base_sha),
		formatShortSha(entry.base_head_sha),
		formatShortSha(entry.head_head_sha),
		entry.engine,
		entry.mode,
		"completed",
		"successful",
		entry.partial ? "partial" : "full",
		entry.findings_count === 0 ? "clean" : "with findings",
		getFindingCountLabel(entry.findings_count),
		entry.generated_at,
		entry.completed_at ?? "",
		entry.run_created_at,
		formatGeneratedAt(entry.generated_at),
		formatGeneratedAt(entry.completed_at),
		...severityTokens,
	].join(" ").toLowerCase();
}

function formatCommitTime(value?: number | null) {
	if (typeof value !== "number") {
		return "Unknown date";
	}

	const parsed = new Date(value * 1000);
	if (Number.isNaN(parsed.getTime())) {
		return "Unknown date";
	}

	return parsed.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function formatShortSha(value?: string | null) {
	return value ? value.slice(0, 8) : "Unavailable";
}

function getCommitSubject(message?: string | null) {
	return (
		(message || "")
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find(Boolean) || null
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getPayloadMethod(event: ReviewRunEvent) {
	if (!isRecord(event.payload)) {
		return null;
	}

	return typeof event.payload.method === "string" ? event.payload.method : null;
}

function getPayloadParams(event: ReviewRunEvent) {
	if (!isRecord(event.payload)) {
		return null;
	}

	return isRecord(event.payload.params) ? event.payload.params : null;
}

function getStringField(record: Record<string, unknown> | null, key: string) {
	if (!record) {
		return null;
	}

	const value = record[key];
	return typeof value === "string" ? value : null;
}

function extractSummaryText(value: unknown) {
	if (!Array.isArray(value)) {
		return null;
	}

	const parts = value.flatMap((entry) => {
		if (!isRecord(entry)) {
			return [];
		}

		return typeof entry.text === "string" && entry.text.trim()
			? [entry.text.trim()]
			: [];
	});

	return parts.length > 0 ? parts.join("\n\n") : null;
}

function isReasoningMethod(method: string | null) {
	if (!method) {
		return false;
	}

	const normalized = method.toLowerCase();
	return normalized.includes("reason") || normalized.includes("agentmessage");
}

function isReasoningItem(item: Record<string, unknown> | null) {
	const itemType = getStringField(item, "type");
	if (!itemType) {
		return false;
	}

	const normalized = itemType.toLowerCase();
	return normalized.includes("reason") || normalized.includes("agentmessage");
}

function extractReasoningText(
	item: Record<string, unknown> | null,
	params: Record<string, unknown>,
) {
	return (
		extractSummaryText(item?.summary) ||
		extractSummaryText(params.summary) ||
		getStringField(item, "text")?.trim() ||
		getStringField(params, "text")?.trim() ||
		getStringField(params, "delta") ||
		null
	);
}

function extractReasoningTraces(events: ReviewRunEvent[]): ReasoningTraceEntry[] {
	const tracesById = new Map<string, ReasoningTraceEntry>();
	const standaloneTraces: ReasoningTraceEntry[] = [];

	for (const event of events) {
		if (event.event_type !== "codex_notification") {
			continue;
		}

		const method = getPayloadMethod(event);
		const params = getPayloadParams(event);
		if (!params) {
			continue;
		}

		const item = isRecord(params.item) ? params.item : null;
		if (!isReasoningMethod(method) && !isReasoningItem(item)) {
			continue;
		}

		const text = extractReasoningText(item, params);
		if (!text?.trim()) {
			continue;
		}
		const isDeltaUpdate = Boolean(
			method?.toLowerCase().includes("delta") && getStringField(params, "delta"),
		);
		const normalizedText = isDeltaUpdate ? text : text.trim();
		if (normalizedText.trim() === "READY.") {
			continue;
		}

		const itemId =
			getStringField(params, "itemId") || getStringField(item, "id");

		if (!itemId) {
			standaloneTraces.push({
				id: `reasoning-${event.id}`,
				method,
				text: normalizedText.trim(),
				stableText: normalizedText.trim(),
				latestDeltaText: null,
				sequence: event.sequence,
				createdAt: event.created_at,
			});
			continue;
		}

		const existingTrace = tracesById.get(itemId);
		const nextText = isDeltaUpdate
			? `${existingTrace?.text || ""}${normalizedText}`
			: normalizedText;

		tracesById.set(itemId, {
			id: itemId,
			method,
			text: isDeltaUpdate ? nextText : nextText.trim(),
			stableText: isDeltaUpdate ? existingTrace?.text || "" : nextText.trim(),
			latestDeltaText: isDeltaUpdate ? normalizedText : null,
			sequence: event.sequence,
			createdAt: event.created_at,
		});
	}

	return [...tracesById.values(), ...standaloneTraces]
		.filter((trace) => trace.text.trim())
		.sort((left, right) => right.sequence - left.sequence);
}

function LiveReasoningText({ entry }: { entry: ReasoningTraceEntry }) {
	if (!entry.latestDeltaText) {
		return (
			<div className="review-trace-copy whitespace-pre-wrap text-[12px] leading-6 text-text-secondary">
				{entry.text}
			</div>
		);
	}

	return (
		<div className="review-trace-copy whitespace-pre-wrap text-[12px] leading-6 text-text-secondary">
			{entry.stableText}
			<span
				key={`${entry.id}:${entry.sequence}:${entry.latestDeltaText.slice(-24)}`}
				className="review-trace-inline-update"
			>
				{entry.latestDeltaText}
			</span>
		</div>
	);
}

function ReviewMetaPill({ label, value, isMono = true }: ReviewMetaPillProps) {
	return (
		<span className="rounded-full border border-border-subtle bg-control px-2.5 py-1">
			<span className="text-text-tertiary">{label}:</span>{" "}
			<span
				className={isMono ? "font-mono text-text-primary" : "text-text-primary"}
			>
				{value}
			</span>
		</span>
	);
}

function ReviewBranchTipCard({
	label,
	branchName,
	commit,
	isLoading,
}: ReviewBranchTipCardProps) {
	const subject = getCommitSubject(commit?.message);

	return (
		<section className="min-w-0 rounded-[18px] border border-border-subtle bg-[rgba(255,255,255,0.028)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
			<div className="flex items-center justify-between gap-3">
				<div className="workspace-section-label">{label}</div>
				<div
					className="max-w-[12rem] truncate font-mono text-[11px] text-text-secondary"
					title={branchName || "Not selected"}
				>
					{branchName || "Not selected"}
				</div>
			</div>

			{!branchName ? (
				<div className="mt-2 text-sm text-text-secondary">
					Select a branch to inspect its tip commit.
				</div>
			) : isLoading && !commit ? (
				<div className="mt-2 text-sm text-text-secondary">
					Loading branch metadata...
				</div>
			) : !commit ? (
				<div className="mt-2 text-sm text-text-secondary">
					Metadata unavailable for this branch tip.
				</div>
			) : (
				<div className="mt-2 flex min-w-0 items-start gap-2.5">
					<GitCommitHorizontal className="mt-0.5 size-4 shrink-0 text-text-tertiary" />
					<div className="min-w-0">
						<div
							className="line-clamp-2 text-sm font-medium leading-5 text-text-primary"
							title={subject || commit.message || undefined}
						>
							{subject || `Commit ${formatShortSha(commit.sha)}`}
						</div>
						<div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-secondary">
							<span className="font-mono text-text-primary">
								{formatShortSha(commit.sha)}
							</span>
							<span>{commit.author || "Unknown author"}</span>
							<span>{formatCommitTime(commit.time)}</span>
						</div>
					</div>
				</div>
			)}
		</section>
	);
}

function formatFindingReference(finding: ReviewFinding) {
	const line = finding.new_start ?? finding.old_start ?? null;
	const sideLabel =
		finding.new_start != null
			? "Modified"
			: finding.old_start != null
				? "Original"
				: null;

	return {
		label: line != null ? `${finding.file_path}:${line}` : finding.file_path,
		sideLabel,
	};
}

function ReviewInProgressState({
	reasoningTrace,
}: {
	reasoningTrace: ReasoningTraceEntry[];
}) {
	const [isTraceOpen, setIsTraceOpen] = useState(true);
	const visibleTrace = reasoningTrace.slice(0, 5);

	return (
		<div className="review-runtime-pulse relative overflow-hidden rounded-[18px] border border-[rgba(122,162,255,0.18)] bg-[linear-gradient(180deg,rgba(122,162,255,0.08),rgba(122,162,255,0.02))] px-4 py-5">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(122,162,255,0.16),transparent_55%)] opacity-70" />
			<div className="relative flex flex-col items-center text-center">
				<div className="relative flex size-28 items-center justify-center">
					<div className="review-runtime-ring absolute inset-0 rounded-full border border-[rgba(122,162,255,0.24)]" />
					<div className="review-runtime-ring-delayed absolute inset-[10px] rounded-full border border-[rgba(199,220,255,0.16)]" />
					<div className="review-runtime-core absolute inset-[26px] rounded-full bg-[radial-gradient(circle,rgba(185,210,255,0.96),rgba(122,162,255,0.32)_45%,rgba(122,162,255,0.06)_80%,transparent)] blur-[1px]" />
					<span className="review-runtime-orbit review-runtime-orbit-a" />
					<span className="review-runtime-orbit review-runtime-orbit-b" />
					<span className="review-runtime-orbit review-runtime-orbit-c" />
				</div>

				<div className="mt-4 text-sm font-semibold text-text-primary">
					review in progress...
				</div>

				<div className="mt-4 w-full text-left">
					<button
						type="button"
						className="flex items-center gap-2 px-0 py-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-tertiary transition-colors duration-150 hover:text-text-primary"
						onClick={() => setIsTraceOpen((current) => !current)}
						aria-expanded={isTraceOpen}
					>
						{isTraceOpen ? (
							<ChevronDown className="size-4" />
						) : (
							<ChevronRight className="size-4" />
						)}
						<span>Thinking</span>
					</button>

					{isTraceOpen ? (
						<div className="mt-4 space-y-3">
							{visibleTrace.length > 0 ? (
								visibleTrace.map((entry, index) => (
									<div
										key={entry.id}
										className="review-trace-item relative pl-5"
										style={{ animationDelay: `${index * 110}ms` }}
									>
										<span className="review-trace-rail" aria-hidden="true" />
										<span className="review-trace-node" aria-hidden="true" />
										<div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-text-tertiary">
											<span className="font-mono">#{entry.sequence}</span>
											{entry.method ? (
												<span className="font-mono">{entry.method}</span>
											) : null}
											{entry.createdAt ? (
												<span>{formatGeneratedAt(entry.createdAt)}</span>
											) : null}
										</div>
										<LiveReasoningText entry={entry} />
									</div>
								))
							) : (
								<div className="space-y-3">
									<div className="review-trace-placeholder">
										<div className="review-runtime-shimmer h-4 w-[72%] rounded-full bg-[rgba(255,255,255,0.06)]" />
										<div className="review-runtime-shimmer mt-2 h-4 w-[88%] rounded-full bg-[rgba(255,255,255,0.06)] [animation-delay:180ms]" />
									</div>
									<div className="review-trace-placeholder [animation-delay:160ms]">
										<div className="review-runtime-shimmer h-4 w-[64%] rounded-full bg-[rgba(255,255,255,0.06)] [animation-delay:240ms]" />
										<div className="review-runtime-shimmer mt-2 h-4 w-[82%] rounded-full bg-[rgba(255,255,255,0.06)] [animation-delay:420ms]" />
									</div>
								</div>
							)}
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}

function parseTimestamp(value?: string | null) {
	if (!value) {
		return null;
	}

	const timestamp = Date.parse(value);
	return Number.isNaN(timestamp) ? null : timestamp;
}

function formatThoughtDuration(
	activeRun: ReviewRun,
	reviewResult: ReviewResult | null,
) {
	const primaryStart = parseTimestamp(activeRun.started_at);
	const primaryEnd = parseTimestamp(activeRun.completed_at);
	const fallbackStart = parseTimestamp(activeRun.created_at);
	const fallbackEnd = parseTimestamp(reviewResult?.generated_at ?? null);

	const durationMs =
		primaryStart != null && primaryEnd != null && primaryEnd >= primaryStart
			? primaryEnd - primaryStart
			: fallbackStart != null &&
				  fallbackEnd != null &&
				  fallbackEnd >= fallbackStart
				? fallbackEnd - fallbackStart
				: null;

	if (durationMs == null) {
		return null;
	}

	const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
	if (totalSeconds < 60) {
		return `${totalSeconds}s`;
	}

	if (totalSeconds < 3600) {
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}m ${seconds}s`;
	}

	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	return `${hours}h ${minutes}m`;
}

function CompletedReasoningSection({
	title,
	reasoningTrace,
}: {
	title: string;
	reasoningTrace: ReasoningTraceEntry[];
}) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<section className="mt-4 border-t border-border-subtle pt-4">
			<button
				type="button"
				className="flex w-full items-center justify-between gap-3 rounded-[14px] border border-border-subtle bg-[rgba(255,255,255,0.025)] px-3 py-2.5 text-left transition-[background-color,border-color,color] duration-150 hover:border-[rgba(122,162,255,0.24)] hover:bg-[rgba(122,162,255,0.06)]"
				onClick={() => setIsOpen((current) => !current)}
				aria-expanded={isOpen}
			>
				<span className="flex items-center gap-2">
					{isOpen ? (
						<ChevronDown className="size-4 text-text-secondary" />
					) : (
						<ChevronRight className="size-4 text-text-secondary" />
					)}
					<span className="text-sm font-semibold text-text-primary">{title}</span>
				</span>
			</button>

			{isOpen ? (
				<div className="mt-4 space-y-3">
					{reasoningTrace.map((entry, index) => (
						<div
							key={entry.id}
							className="review-trace-item relative pl-5"
							style={{ animationDelay: `${index * 70}ms` }}
						>
							<span className="review-trace-rail" aria-hidden="true" />
							<span className="review-trace-node" aria-hidden="true" />
							<div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-text-tertiary">
								<span className="font-mono">#{entry.sequence}</span>
								{entry.method ? (
									<span className="font-mono">{entry.method}</span>
								) : null}
								{entry.createdAt ? (
									<span>{formatGeneratedAt(entry.createdAt)}</span>
								) : null}
							</div>
							<MarkdownRenderer
								content={entry.text}
								className="review-trace-copy text-[12px]"
							/>
						</div>
					))}
				</div>
			) : null}
		</section>
	);
}

function ReviewFindingsList({
	findings,
	selectedFindingId,
	onSelect,
	canNavigateToFinding,
}: {
	findings: ReviewFinding[];
	selectedFindingId: string | null;
	onSelect: (finding: ReviewFinding) => void;
	canNavigateToFinding: (finding: ReviewFinding) => boolean;
}) {
	if (findings.length === 0) {
		return (
			<div className="rounded-[16px] border border-dashed border-border-subtle px-3 py-4 text-sm text-text-secondary">
				No structured findings were generated for this review run.
			</div>
		);
	}

	return (
		<div className="space-y-2.5">
			{findings.map((finding) => {
				const { label, sideLabel } = formatFindingReference(finding);
				const isSelected = selectedFindingId === finding.id;
				const canNavigate = canNavigateToFinding(finding);
				const content = (
					<>
						<div className="flex flex-wrap items-start justify-between gap-2">
							<StatusPill tone={getSeverityTone(finding.severity)}>
								{formatSeverityLabel(finding.severity)}
							</StatusPill>
							<span
								className={cn(
									"shrink-0 rounded-full border px-2.5 py-1 font-mono text-[11px]",
									canNavigate
										? "border-[rgba(122,162,255,0.28)] bg-[rgba(122,162,255,0.1)] text-text-primary"
										: "border-border-subtle bg-[rgba(255,255,255,0.03)] text-text-tertiary",
								)}
							>
								{label}
							</span>
						</div>
						<div className="mt-3 text-sm font-semibold leading-6 text-text-primary">
							{finding.title}
						</div>
						<div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-text-tertiary">
							{sideLabel ? <span>{sideLabel} side</span> : null}
							{!canNavigate ? (
								<span>Reference unavailable in the current diff.</span>
							) : null}
						</div>
						<div className="mt-2 text-sm leading-6 text-text-secondary">
							<p className="whitespace-pre-wrap">{finding.body}</p>
						</div>
					</>
				);

				if (!canNavigate) {
					return (
						<div
							key={finding.id}
							className={cn(
								"rounded-[16px] border px-3 py-3",
								isSelected
									? "border-[rgba(122,162,255,0.35)] bg-[rgba(122,162,255,0.08)]"
									: "border-border-subtle bg-[rgba(255,255,255,0.025)]",
							)}
						>
							{content}
						</div>
					);
				}

				return (
					<button
						key={finding.id}
						type="button"
						aria-pressed={isSelected}
						className={cn(
							"w-full rounded-[16px] border px-3 py-3 text-left transition-[background-color,border-color,box-shadow] duration-150",
							isSelected
								? "border-[rgba(122,162,255,0.45)] bg-[rgba(122,162,255,0.08)] shadow-[0_0_0_1px_rgba(122,162,255,0.14)]"
								: "border-border-subtle bg-[rgba(255,255,255,0.025)] hover:border-border-strong hover:bg-[rgba(255,255,255,0.045)]",
						)}
						onClick={() => onSelect(finding)}
					>
						{content}
					</button>
				);
			})}
		</div>
	);
}

function ReviewInsightsPanel({
	activeRun,
	reviewResult,
	findingsLabel,
	selectedFindingId,
	onSelectFinding,
	canNavigateToFinding,
	reasoningTrace,
	isFullscreen = false,
	isInline = false,
	onToggleOpen,
	onToggleFullscreen,
}: {
	activeRun: ReviewRun;
	reviewResult: ReviewResult | null;
	findingsLabel: string;
	selectedFindingId: string | null;
	onSelectFinding: (finding: ReviewFinding) => void;
	canNavigateToFinding: (finding: ReviewFinding) => boolean;
	reasoningTrace: ReasoningTraceEntry[];
	isFullscreen?: boolean;
	isInline?: boolean;
	onToggleOpen: () => void;
	onToggleFullscreen: () => void;
}) {
	const summaryText = reviewResult?.summary?.trim() || null;
	const sectionPadding = isFullscreen ? "px-6 py-5 xl:px-8" : "px-4 py-4";
	const completedThoughtDuration = formatThoughtDuration(activeRun, reviewResult);
	const completedThoughtTitle = completedThoughtDuration
		? `Thought for ${completedThoughtDuration}`
		: "Thought";
	const hasCompletedReasoning =
		activeRun.status === "completed" &&
		reviewResult != null &&
		reasoningTrace.length > 0;

	return (
		<div
			className={cn(
				isInline
					? "workspace-panel overflow-hidden bg-[linear-gradient(180deg,rgba(11,14,19,0.98),rgba(8,10,14,0.94))]"
					: "flex h-full min-h-0 flex-col",
				isFullscreen ? "bg-[linear-gradient(180deg,rgba(9,12,17,0.98),rgba(6,9,14,0.96))]" : undefined,
			)}
		>
			<div className={cn("border-b border-border-subtle", sectionPadding)}>
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="workspace-section-label">AI Review</div>
						<div className="mt-1 text-sm font-semibold text-text-primary">
							Summary and findings
						</div>
						<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
							<span>{findingsLabel}</span>
							{reviewResult ? (
								<span>{formatGeneratedAt(reviewResult.generated_at)}</span>
							) : null}
						</div>
					</div>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="toolbar"
								size="toolbar-icon"
								className="hidden xl:flex"
								onClick={onToggleFullscreen}
								aria-pressed={isFullscreen}
								aria-label={isFullscreen ? "Restore split view" : "Expand review"}
								title={isFullscreen ? "Restore split view" : "Expand review"}
							>
								{isFullscreen ? (
									<Minimize2 className="size-4" />
								) : (
									<Maximize2 className="size-4" />
								)}
							</Button>
							<Button
								type="button"
								variant="toolbar"
							size="toolbar-icon"
							onClick={onToggleOpen}
							aria-label={isInline ? "Hide review section" : "Collapse review rail"}
							title={isInline ? "Hide review section" : "Collapse review rail"}
						>
							<PanelRightOpen className="size-4 rotate-180" />
						</Button>
					</div>
				</div>
			</div>

			<div
				className={cn(
					"workspace-scrollbar min-h-0 overflow-y-auto",
					isInline ? "max-h-[28rem]" : "flex-1",
				)}
			>
					<section className={cn("border-b border-border-subtle", sectionPadding)}>
						<div className="workspace-section-label">Summary</div>
						<div className="mt-3">
							{summaryText ? (
								<MarkdownRenderer content={summaryText} className="text-[13px]" />
							) : ACTIVE_RUN_STATUSES.has(activeRun.status) ? (
								<ReviewInProgressState reasoningTrace={reasoningTrace} />
							) : (
								<p className="text-sm leading-6 text-text-secondary">
									Structured review output is not available for this run.
								</p>
							)}
							{hasCompletedReasoning ? (
								<CompletedReasoningSection
									key={`${activeRun.id}:${reviewResult?.id ?? "summary"}`}
									title={completedThoughtTitle}
									reasoningTrace={reasoningTrace}
								/>
							) : null}
						</div>
					</section>

				<section className={sectionPadding}>
					<div className="flex items-center justify-between gap-3">
						<div className="workspace-section-label">Findings</div>
						<div className="font-mono text-[11px] text-text-tertiary">
							{findingsLabel}
						</div>
					</div>
					<div className="mt-3">
						{reviewResult ? (
							<ReviewFindingsList
								findings={reviewResult.findings}
								selectedFindingId={selectedFindingId}
								onSelect={onSelectFinding}
								canNavigateToFinding={canNavigateToFinding}
							/>
						) : (
							<div className="rounded-[16px] border border-dashed border-border-subtle px-3 py-4 text-sm text-text-secondary">
								Structured findings will show up here when the run finishes.
							</div>
						)}
					</div>
				</section>
			</div>
		</div>
	);
}

function PendingApprovals({
	approvals,
	loadingById,
	onDecision,
}: {
	approvals: ReviewApproval[];
	loadingById: Record<string, boolean>;
	onDecision: (
		approval: ReviewApproval,
		decision: ReviewApprovalDecision,
	) => void;
}) {
	if (approvals.length === 0) {
		return null;
	}

	return (
		<section className="rounded-[20px] border border-[rgba(199,154,86,0.28)] bg-[rgba(199,154,86,0.09)] p-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<ShieldAlert className="size-4 text-warning" />
					<div className="text-sm font-semibold text-text-primary">
						Codex is waiting for approval
					</div>
				</div>
				<StatusPill tone="warning">{approvals.length}</StatusPill>
			</div>
			<div className="mt-3 space-y-3">
				{approvals.map((approval) => {
					const isLoading = Boolean(loadingById[approval.id]);
					const requestPayload = JSON.stringify(
						approval.request_payload,
						null,
						2,
					);
					return (
						<div
							key={approval.id}
							className="rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(15,23,42,0.32)] p-3"
						>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="min-w-0">
									<div className="text-sm font-medium text-text-primary">
										{approval.summary || formatLabel(approval.method)}
									</div>
									<div className="mt-1 font-mono text-[11px] text-text-tertiary">
										{approval.method}
									</div>
								</div>
								<StatusPill tone={getApprovalTone(approval.status)}>
									{formatLabel(approval.status)}
								</StatusPill>
							</div>
							<pre className="workspace-scrollbar mt-3 max-h-40 overflow-auto rounded-[12px] border border-border-subtle bg-[rgba(2,6,23,0.52)] p-3 font-mono text-[11px] leading-5 text-text-secondary">
								{requestPayload}
							</pre>
							<div className="mt-3 flex flex-wrap gap-2">
								<Button
									size="sm"
									variant="accent"
									disabled={isLoading}
									onClick={() => onDecision(approval, "accept")}
								>
									{isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
									Approve
								</Button>
								<Button
									size="sm"
									variant="subtle"
									disabled={isLoading}
									onClick={() => onDecision(approval, "acceptForSession")}
								>
									Allow For Session
								</Button>
								<Button
									size="sm"
									variant="toolbar"
									disabled={isLoading}
									onClick={() => onDecision(approval, "decline")}
								>
									Decline
								</Button>
								<Button
									size="sm"
									variant="danger"
									disabled={isLoading}
									onClick={() => onDecision(approval, "cancel")}
								>
									Cancel Run
								</Button>
							</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}

export function Review() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const repoPath = readRepoPathFromSearchParams(searchParams);
	const { baseRef: queryBaseRef, headRef: queryHeadRef } = useMemo(
		() => readReviewRefsFromSearchParams(searchParams),
		[searchParams],
	);
	const diffWorkspaceRef = useRef<DiffWorkspaceHandle | null>(null);
	const sessionRequestIdRef = useRef(0);
	const historyRequestIdRef = useRef(0);
	const historySelectionRequestIdRef = useRef(0);
	const refreshTimerRef = useRef<number | null>(null);
	const lastOpenedRunIdRef = useRef<string | null>(null);
	const lastHistorySyncRunKeyRef = useRef<string | null>(null);

	const [baseRef, setBaseRef] = useState(queryBaseRef ?? "");
	const [headRef, setHeadRef] = useState(queryHeadRef ?? "");
	const [customInstructions, setCustomInstructions] = useState("");
	const [session, setSession] = useState<ReviewSession | null>(null);
	const [reviewHistory, setReviewHistory] = useState<ReviewHistoryEntry[]>([]);
	const [sessionError, setSessionError] = useState<string | null>(null);
	const [historyError, setHistoryError] = useState<string | null>(null);
	const [runError, setRunError] = useState<string | null>(null);
	const [isSessionLoading, setIsSessionLoading] = useState(false);
	const [isHistoryLoading, setIsHistoryLoading] = useState(false);
	const [isRunStarting, setIsRunStarting] = useState(false);
	const [isRunCancelling, setIsRunCancelling] = useState(false);
	const [runDetail, setRunDetail] = useState<ReviewRun | null>(null);
	const [selectedHistoryView, setSelectedHistoryView] =
		useState<SelectedReviewHistoryView | null>(null);
	const [historySelectionLoadingRunId, setHistorySelectionLoadingRunId] =
		useState<string | null>(null);
	const [historySelectionError, setHistorySelectionError] = useState<string | null>(
		null,
	);
	const [approvalLoadingById, setApprovalLoadingById] = useState<
		Record<string, boolean>
	>({});
	const [historySearchQuery, setHistorySearchQuery] = useState("");
	const deferredHistorySearchQuery = useDeferredValue(historySearchQuery);
	const [isReviewSetupOpen, setIsReviewSetupOpen] = useState(true);
	const [isPreviousReviewsOpen, setIsPreviousReviewsOpen] = useState(true);
	const [historyOutcomeFilter, setHistoryOutcomeFilter] =
		useState<ReviewHistoryOutcomeFilter>("all");
	const [historySeverityFilter, setHistorySeverityFilter] =
		useState<ReviewHistorySeverityFilter>("any");
	const [historyStartDate, setHistoryStartDate] = useState<Date | undefined>(
		undefined,
	);
	const [historyEndDate, setHistoryEndDate] = useState<Date | undefined>(
		undefined,
	);
	const [reviewPanelMode, setReviewPanelMode] = useState<ReviewPanelMode>("collapsed");
	const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
	const [fileTreePreferredWidth, setFileTreePreferredWidthState] = useState(() =>
		getStoredReviewPanelWidth(
			REVIEW_FILE_TREE_WIDTH_STORAGE_KEY,
			REVIEW_FILE_TREE_WIDTH_DEFAULT,
			REVIEW_FILE_TREE_WIDTH_MIN,
		),
	);
	const [reviewRailPreferredWidth, setReviewRailPreferredWidthState] = useState(() =>
		getStoredReviewPanelWidth(
			REVIEW_RIGHT_RAIL_WIDTH_STORAGE_KEY,
			REVIEW_RIGHT_RAIL_WIDTH_DEFAULT,
			REVIEW_RIGHT_RAIL_WIDTH_MIN,
		),
	);
	const reviewRefsStorageKey = useMemo(
		() => getReviewRefsStorageKey(repoPath),
		[repoPath],
	);

	const {
		commits,
		branches,
		isLoading: isRepoLoading,
		error: repoError,
	} = useRepoData({ repoPath });

	useEffect(() => {
		setSession(null);
		setRunDetail(null);
		setReviewHistory([]);
		setSelectedHistoryView(null);
		setHistorySelectionLoadingRunId(null);
		setSessionError(null);
		setHistoryError(null);
		setHistorySelectionError(null);
		setRunError(null);
		setApprovalLoadingById({});
		setSelectedFindingId(null);
		historySelectionRequestIdRef.current += 1;
		lastHistorySyncRunKeyRef.current = null;
	}, [baseRef, headRef, repoPath]);

	const branchOptions = useMemo(
		() =>
			Array.from(
				new Set(
					branches
						.map((branch) => branch.name)
						.filter((name) => name && name !== DETACHED_HEAD_LABEL),
				),
			).sort((left, right) =>
				left.localeCompare(right, undefined, {
					numeric: true,
					sensitivity: "base",
				}),
			),
		[branches],
	);
	const branchOptionSet = useMemo(() => new Set(branchOptions), [branchOptions]);

	const commitBySha = useMemo(
		() => new Map(commits.map((commit) => [commit.sha, commit])),
		[commits],
	);

	const branchByName = useMemo(
		() => new Map(branches.map((branch) => [branch.name, branch])),
		[branches],
	);

	const resolveBranchTipCommit = useCallback(
		(refName: string) => {
			if (!refName) {
				return null;
			}

			const tipSha = branchByName.get(refName)?.commits?.[0];
			if (!tipSha) {
				return null;
			}

			return commitBySha.get(tipSha) ?? null;
		},
		[branchByName, commitBySha],
	);

	const baseTipCommit = useMemo(
		() => resolveBranchTipCommit(baseRef),
		[baseRef, resolveBranchTipCommit],
	);

	const headTipCommit = useMemo(
		() => resolveBranchTipCommit(headRef),
		[headRef, resolveBranchTipCommit],
	);

	const updateRoute = useCallback(
		(nextBaseRef: string, nextHeadRef: string) => {
			if (!repoPath) {
				return;
			}

			navigate(
				buildReviewRoute(repoPath, nextBaseRef || null, nextHeadRef || null),
				{
					replace: true,
				},
			);
		},
		[navigate, repoPath],
	);

	const setStoredReviewRefs = useCallback(
		(nextBaseRef: string, nextHeadRef: string) => {
			persistStoredReviewRefs(reviewRefsStorageKey, {
				baseRef: nextBaseRef,
				headRef: nextHeadRef,
			});
		},
		[reviewRefsStorageKey],
	);

	useEffect(() => {
		const storedReviewRefs = getStoredReviewRefs(reviewRefsStorageKey);
		const nextBaseRef = queryBaseRef ?? storedReviewRefs?.baseRef ?? "";
		const nextHeadRef = queryHeadRef ?? storedReviewRefs?.headRef ?? "";

		setBaseRef((current) => (current === nextBaseRef ? current : nextBaseRef));
		setHeadRef((current) => (current === nextHeadRef ? current : nextHeadRef));
		setStoredReviewRefs(nextBaseRef, nextHeadRef);

		if (
			repoPath &&
			(queryBaseRef == null || queryHeadRef == null) &&
			((queryBaseRef ?? "") !== nextBaseRef ||
				(queryHeadRef ?? "") !== nextHeadRef)
		) {
			updateRoute(nextBaseRef, nextHeadRef);
		}
	}, [
		queryBaseRef,
		queryHeadRef,
		repoPath,
		reviewRefsStorageKey,
		setStoredReviewRefs,
		updateRoute,
	]);

	useEffect(() => {
		if (isRepoLoading) {
			return;
		}

		const nextBaseRef = baseRef && branchOptionSet.has(baseRef) ? baseRef : "";
		const nextHeadRef = headRef && branchOptionSet.has(headRef) ? headRef : "";

		if (nextBaseRef === baseRef && nextHeadRef === headRef) {
			return;
		}

		setBaseRef(nextBaseRef);
		setHeadRef(nextHeadRef);
		setStoredReviewRefs(nextBaseRef, nextHeadRef);

		if (
			repoPath &&
			((queryBaseRef ?? "") !== nextBaseRef ||
				(queryHeadRef ?? "") !== nextHeadRef)
		) {
			updateRoute(nextBaseRef, nextHeadRef);
		}
	}, [
		baseRef,
		branchOptionSet,
		headRef,
		isRepoLoading,
		queryBaseRef,
		queryHeadRef,
		repoPath,
		setStoredReviewRefs,
		updateRoute,
	]);

	const setFileTreePreferredWidth = useCallback((nextWidth: number) => {
		const clampedWidth = clampPanelWidth(
			nextWidth,
			REVIEW_FILE_TREE_WIDTH_MIN,
		);
		setFileTreePreferredWidthState(clampedWidth);

		if (typeof window === "undefined") {
			return;
		}

		try {
			window.localStorage.setItem(
				REVIEW_FILE_TREE_WIDTH_STORAGE_KEY,
				String(clampedWidth),
			);
		} catch {
			// Ignore local storage failures and keep the in-memory state.
		}
	}, []);

	const setReviewRailPreferredWidth = useCallback((nextWidth: number) => {
		const clampedWidth = clampPanelWidth(
			nextWidth,
			REVIEW_RIGHT_RAIL_WIDTH_MIN,
		);
		setReviewRailPreferredWidthState(clampedWidth);

		if (typeof window === "undefined") {
			return;
		}

		try {
			window.localStorage.setItem(
				REVIEW_RIGHT_RAIL_WIDTH_STORAGE_KEY,
				String(clampedWidth),
			);
		} catch {
			// Ignore local storage failures and keep the in-memory state.
		}
	}, []);

	const handleBaseRefChange = useCallback(
		(nextBaseRef: string) => {
			setBaseRef(nextBaseRef);
			setStoredReviewRefs(nextBaseRef, headRef);
			updateRoute(nextBaseRef, headRef);
		},
		[headRef, setStoredReviewRefs, updateRoute],
	);

	const handleHeadRefChange = useCallback(
		(nextHeadRef: string) => {
			setHeadRef(nextHeadRef);
			setStoredReviewRefs(baseRef, nextHeadRef);
			updateRoute(baseRef, nextHeadRef);
		},
		[baseRef, setStoredReviewRefs, updateRoute],
	);

	const refreshSessionState = useCallback(
		async (sessionId: string, preferredRunId?: string | null) => {
			const nextSession = await getReviewSession(sessionId);
			setSession(nextSession);
			setSessionError(null);

			const nextRunId = preferredRunId || nextSession.runs[0]?.id || null;
			if (!nextRunId) {
				setRunDetail(null);
				return;
			}

			const nextRun = await getReviewRun({
				sessionId,
				runId: nextRunId,
			});
			setRunDetail(nextRun);
			setRunError(null);
		},
		[],
	);

	const loadReviewHistory = useCallback(
		async ({
			baseRef: nextBaseRef = baseRef,
			headRef: nextHeadRef = headRef,
		}: {
			baseRef?: string;
			headRef?: string;
		} = {}) => {
			if (!repoPath) {
				setHistoryError("No Git project path was provided.");
				setReviewHistory([]);
				return;
			}

			if (!nextBaseRef || !nextHeadRef) {
				setReviewHistory([]);
				setHistoryError(null);
				return;
			}

			const requestId = ++historyRequestIdRef.current;
			setIsHistoryLoading(true);
			setHistoryError(null);

			try {
				const nextHistory = await getReviewHistory({
					repoPath,
					baseRef: nextBaseRef,
					headRef: nextHeadRef,
				});
				if (historyRequestIdRef.current !== requestId) {
					return;
				}

				setReviewHistory(nextHistory.items);
			} catch (error) {
				if (historyRequestIdRef.current !== requestId) {
					return;
				}

				setReviewHistory([]);
				setHistoryError(getErrorMessage(error));
			} finally {
				if (historyRequestIdRef.current === requestId) {
					setIsHistoryLoading(false);
				}
			}
		},
		[baseRef, headRef, repoPath],
	);

	const loadSession = useCallback(
		async ({
			baseRef: nextBaseRef = baseRef,
			headRef: nextHeadRef = headRef,
		}: {
			baseRef?: string;
			headRef?: string;
		} = {}): Promise<ReviewSession | null> => {
			if (!repoPath) {
				setSessionError("No Git project path was provided.");
				return null;
			}

			if (!nextBaseRef || !nextHeadRef) {
				return null;
			}

			const requestId = ++sessionRequestIdRef.current;
			setIsSessionLoading(true);
			setSessionError(null);
			setRunError(null);

			try {
				const repoSettings = await getDesktopRepoSettings(repoPath);
				const nextSession = await createReviewSession({
					repoPath,
					baseRef: nextBaseRef,
					headRef: nextHeadRef,
					contextLines: repoSettings.contextLines,
				});
				if (sessionRequestIdRef.current !== requestId) {
					return null;
				}
				setSession(nextSession);
				const nextRunId = nextSession.runs[0]?.id ?? null;
				if (!nextRunId) {
					setRunDetail(null);
					return nextSession;
				}

				try {
					const nextRun = await getReviewRun({
						sessionId: nextSession.id,
						runId: nextRunId,
					});
					if (sessionRequestIdRef.current !== requestId) {
						return null;
					}
					setRunDetail(nextRun);
					setRunError(null);
				} catch (error) {
					if (sessionRequestIdRef.current !== requestId) {
						return null;
					}
					setRunDetail(nextSession.runs[0] ?? null);
					setRunError(getErrorMessage(error));
				}

				return nextSession;
			} catch (error) {
				if (sessionRequestIdRef.current !== requestId) {
					return null;
				}
				setSession(null);
				setRunDetail(null);
				setSessionError(getErrorMessage(error));
				return null;
			} finally {
				if (sessionRequestIdRef.current === requestId) {
					setIsSessionLoading(false);
				}
			}
		},
		[baseRef, headRef, repoPath],
	);

	useEffect(() => {
		if (!repoPath || !baseRef || !headRef) {
			sessionRequestIdRef.current += 1;
			setIsSessionLoading(false);
			return;
		}

		void loadSession({ baseRef, headRef });
	}, [baseRef, headRef, loadSession, repoPath]);

	useEffect(() => {
		if (!repoPath || !baseRef || !headRef) {
			historyRequestIdRef.current += 1;
			setReviewHistory([]);
			setIsHistoryLoading(false);
			setHistoryError(null);
			return;
		}

		void loadReviewHistory({ baseRef, headRef });
	}, [baseRef, headRef, loadReviewHistory, repoPath]);

	useEffect(() => {
		if (!session?.id) {
			return;
		}

		const unsubscribe = onReviewRuntimeEvent((event: ReviewRuntimeEvent) => {
			if (event.type !== "review-runtime-changed") {
				return;
			}

			if (event.sessionId !== session.id) {
				return;
			}

			if (refreshTimerRef.current != null) {
				window.clearTimeout(refreshTimerRef.current);
			}

			refreshTimerRef.current = window.setTimeout(() => {
				void refreshSessionState(session.id, event.runId ?? null).catch((error) => {
					setRunError(getErrorMessage(error));
				});
			}, 180);
		});

		return () => {
			unsubscribe();
			if (refreshTimerRef.current != null) {
				window.clearTimeout(refreshTimerRef.current);
				refreshTimerRef.current = null;
			}
		};
	}, [refreshSessionState, session?.id]);

	const currentRunSummary = session?.runs[0] ?? null;
	const currentActiveRun =
		runDetail?.id === currentRunSummary?.id ? runDetail : runDetail ?? currentRunSummary;
	const isViewingHistory = selectedHistoryView !== null;
	const displayedSession = selectedHistoryView?.session ?? session;
	const activeRun = selectedHistoryView?.run ?? currentActiveRun;
	const reviewResult: ReviewResult | null = activeRun?.result ?? null;
	const pendingApprovals = (activeRun?.approvals ?? []).filter(
		(approval) => approval.status === "pending",
	);
	const reasoningTrace = useMemo(
		() => extractReasoningTraces(activeRun?.events ?? []),
		[activeRun?.events],
	);

	useEffect(() => {
		if (!repoPath || !baseRef || !headRef) {
			lastHistorySyncRunKeyRef.current = null;
			return;
		}

		if (
			!currentActiveRun?.id ||
			currentActiveRun.status !== "completed" ||
			!currentActiveRun.completed_at
		) {
			return;
		}

		const syncKey = `${currentActiveRun.id}:${currentActiveRun.completed_at}`;
		if (lastHistorySyncRunKeyRef.current === syncKey) {
			return;
		}

		lastHistorySyncRunKeyRef.current = syncKey;
		void loadReviewHistory({ baseRef, headRef });
	}, [
		baseRef,
		headRef,
		currentActiveRun?.completed_at,
		currentActiveRun?.id,
		currentActiveRun?.status,
		loadReviewHistory,
		repoPath,
	]);

	useEffect(() => {
		if (activeRun?.id && activeRun.id !== lastOpenedRunIdRef.current) {
			setReviewPanelMode("rail");
			lastOpenedRunIdRef.current = activeRun.id;
		}

		if (!activeRun) {
			lastOpenedRunIdRef.current = null;
			setReviewPanelMode("collapsed");
		}
	}, [activeRun]);

	useEffect(() => {
		if (!reviewResult) {
			setSelectedFindingId(null);
			return;
		}

		setSelectedFindingId((current) =>
			current && reviewResult.findings.some((finding) => finding.id === current)
				? current
				: null,
		);
	}, [reviewResult]);

	const availableFindingPaths = useMemo(() => {
		const paths = new Set<string>();

		for (const fileChange of displayedSession?.file_changes ?? []) {
			paths.add(getFileChangeLabelPath(fileChange));
			if (fileChange.new_path) {
				paths.add(fileChange.new_path);
			}
			if (fileChange.old_path) {
				paths.add(fileChange.old_path);
			}
		}

		return paths;
	}, [displayedSession?.file_changes]);

	const canNavigateToFinding = useCallback(
		(finding: ReviewFinding) => availableFindingPaths.has(finding.file_path),
		[availableFindingPaths],
	);
	const handleReturnToLatestReview = useCallback(() => {
		historySelectionRequestIdRef.current += 1;
		setSelectedHistoryView(null);
		setHistorySelectionLoadingRunId(null);
		setHistorySelectionError(null);
		setReviewPanelMode(currentActiveRun ? "rail" : "collapsed");
	}, [currentActiveRun]);
	const handleSelectHistoryReview = useCallback(
		async (entry: ReviewHistoryEntry) => {
			if (
				entry.run_id === currentActiveRun?.id &&
				entry.session_id === session?.id
			) {
				handleReturnToLatestReview();
				setReviewPanelMode("rail");
				return;
			}

			if (selectedHistoryView?.entry.run_id === entry.run_id && !historySelectionLoadingRunId) {
				setReviewPanelMode("rail");
				return;
			}

			const requestId = ++historySelectionRequestIdRef.current;
			setHistorySelectionLoadingRunId(entry.run_id);
			setHistorySelectionError(null);

			try {
				const [nextSession, nextRun] = await Promise.all([
					getReviewSession(entry.session_id),
					getReviewRun({
						sessionId: entry.session_id,
						runId: entry.run_id,
					}),
				]);
				if (historySelectionRequestIdRef.current !== requestId) {
					return;
				}

				setSelectedHistoryView({
					entry,
					session: nextSession,
					run: nextRun,
				});
				setReviewPanelMode("rail");
			} catch (error) {
				if (historySelectionRequestIdRef.current !== requestId) {
					return;
				}

				setHistorySelectionError(getErrorMessage(error));
			} finally {
				if (historySelectionRequestIdRef.current === requestId) {
					setHistorySelectionLoadingRunId(null);
				}
			}
		},
		[
			currentActiveRun?.id,
			handleReturnToLatestReview,
			historySelectionLoadingRunId,
			selectedHistoryView?.entry.run_id,
			session?.id,
		],
	);
	const previousReviewHistory = reviewHistory;
	const filteredPreviousReviewHistory = useMemo(() => {
		const normalizedQuery = deferredHistorySearchQuery.trim().toLowerCase();
		const startBoundary = historyStartDate ? startOfLocalDay(historyStartDate) : null;
		const endBoundary = historyEndDate ? endOfLocalDay(historyEndDate) : null;

		return previousReviewHistory.filter((entry) => {
			if (
				historyOutcomeFilter === "with_findings" &&
				entry.findings_count === 0
			) {
				return false;
			}

			if (historyOutcomeFilter === "clean" && entry.findings_count > 0) {
				return false;
			}

			if (
				historySeverityFilter === "has_high" &&
				entry.severity_counts.high === 0
			) {
				return false;
			}

			if (
				historySeverityFilter === "has_medium" &&
				entry.severity_counts.medium === 0
			) {
				return false;
			}

			if (
				historySeverityFilter === "has_low" &&
				entry.severity_counts.low === 0
			) {
				return false;
			}

			const generatedAt = new Date(entry.generated_at).getTime();
			if (startBoundary != null && !Number.isNaN(generatedAt) && generatedAt < startBoundary) {
				return false;
			}

			if (endBoundary != null && !Number.isNaN(generatedAt) && generatedAt > endBoundary) {
				return false;
			}

			if (!normalizedQuery) {
				return true;
			}

			return buildReviewHistorySearchText(entry).includes(normalizedQuery);
		});
	}, [
		deferredHistorySearchQuery,
		historyEndDate,
		historyOutcomeFilter,
		historySeverityFilter,
		historyStartDate,
		previousReviewHistory,
	]);
	const hasActiveHistoryFilters =
		Boolean(historySearchQuery.trim()) ||
		historyOutcomeFilter !== "all" ||
		historySeverityFilter !== "any" ||
		Boolean(historyStartDate) ||
		Boolean(historyEndDate);

	const resetHistoryFilters = useCallback(() => {
		setHistorySearchQuery("");
		setHistoryOutcomeFilter("all");
		setHistorySeverityFilter("any");
		setHistoryStartDate(undefined);
		setHistoryEndDate(undefined);
	}, []);

	const handleStartReview = useCallback(async () => {
		if (!session) {
			return;
		}

		setIsRunStarting(true);
		setRunError(null);
		try {
			const startedRun = await startReviewRun({
				sessionId: session.id,
				customInstructions: customInstructions.trim() || null,
			});
			await refreshSessionState(session.id, startedRun.id);
		} catch (error) {
			setRunError(getErrorMessage(error));
		} finally {
			setIsRunStarting(false);
		}
	}, [customInstructions, refreshSessionState, session]);

	const handleCancelReview = useCallback(async () => {
		if (!session || !currentActiveRun) {
			return;
		}

		setIsRunCancelling(true);
		setRunError(null);
		try {
			await cancelReviewRun({
				sessionId: session.id,
				runId: currentActiveRun.id,
			});
			await refreshSessionState(session.id, currentActiveRun.id);
		} catch (error) {
			setRunError(getErrorMessage(error));
		} finally {
			setIsRunCancelling(false);
		}
	}, [currentActiveRun, refreshSessionState, session]);

	const handleApprovalDecision = useCallback(
		async (approval: ReviewApproval, decision: ReviewApprovalDecision) => {
			if (!session || !currentActiveRun) {
				return;
			}

			setApprovalLoadingById((current) => ({
				...current,
				[approval.id]: true,
			}));
			try {
				await respondReviewApproval({
					sessionId: session.id,
					runId: currentActiveRun.id,
					approvalId: approval.id,
					decision,
				});
				await refreshSessionState(session.id, currentActiveRun.id);
			} catch (error) {
				setRunError(getErrorMessage(error));
			} finally {
				setApprovalLoadingById((current) => {
					const next = { ...current };
					delete next[approval.id];
					return next;
				});
			}
		},
		[currentActiveRun, refreshSessionState, session],
	);

	const handleFindingSelect = useCallback(
		(finding: ReviewFinding) => {
			if (!canNavigateToFinding(finding)) {
				return;
			}

			setSelectedFindingId(finding.id);
			const focusFinding = () => {
				diffWorkspaceRef.current?.focusLocation({
					filePath: finding.file_path,
					newStart: finding.new_start ?? null,
					oldStart: finding.old_start ?? null,
				});
			};

			if (reviewPanelMode === "fullscreen" && typeof window !== "undefined") {
				setReviewPanelMode("rail");
				window.requestAnimationFrame(() => {
					window.requestAnimationFrame(() => {
						focusFinding();
					});
				});
				return;
			}

			focusFinding();
		},
		[canNavigateToFinding, reviewPanelMode],
	);

	const canStartReview = Boolean(
		historySelectionLoadingRunId === null &&
		!isViewingHistory &&
		session &&
			!isSessionLoading &&
			!isRunStarting &&
			!(currentActiveRun && ACTIVE_RUN_STATUSES.has(currentActiveRun.status)),
	);
	const canCancelReview = Boolean(
		historySelectionLoadingRunId === null &&
		!isViewingHistory &&
		session &&
			currentActiveRun &&
			ACTIVE_RUN_STATUSES.has(currentActiveRun.status) &&
			!isRunCancelling,
	);
	const hasCancelableRun = Boolean(
		historySelectionLoadingRunId === null &&
			!isViewingHistory &&
			currentActiveRun &&
			ACTIVE_RUN_STATUSES.has(currentActiveRun.status),
	);

	const findingsLabel = reviewResult
		? `${reviewResult.findings.length} finding${reviewResult.findings.length === 1 ? "" : "s"}`
		: activeRun
			? formatLabel(activeRun.status)
			: "No review";
	const isReviewVisible = reviewPanelMode !== "collapsed";
	const isReviewRailOpen = reviewPanelMode === "rail";
	const isReviewFullscreen = reviewPanelMode === "fullscreen";

	const compareMetadata = [
		{
			label: isViewingHistory ? "Reviewed Base" : "Base",
			value: isViewingHistory
				? displayedSession?.base_head_sha
					? formatShortSha(displayedSession.base_head_sha)
					: "Unavailable"
				: baseRef
					? baseTipCommit
						? formatShortSha(baseTipCommit.sha)
						: isRepoLoading
							? "Loading"
							: "Unavailable"
					: "Not selected",
		},
		{
			label: isViewingHistory ? "Reviewed Head" : "Head",
			value: isViewingHistory
				? displayedSession?.head_head_sha
					? formatShortSha(displayedSession.head_head_sha)
					: "Unavailable"
				: headRef
					? headTipCommit
						? formatShortSha(headTipCommit.sha)
						: isRepoLoading
							? "Loading"
							: "Unavailable"
					: "Not selected",
		},
		{
			label: "Merge",
			value: displayedSession?.merge_base_sha
				? formatShortSha(displayedSession.merge_base_sha)
				: "Pending",
		},
		{
			label: "Files",
			value: displayedSession ? String(displayedSession.stats.files_changed) : "Pending",
		},
		{
			label: "Run",
			value: activeRun ? formatLabel(activeRun.status) : "Idle",
			isMono: false,
		},
		{
			label: "Approvals",
			value: String(pendingApprovals.length),
		},
	];

	const pageTopContent = (
		<div className="space-y-3">
			<div className="rounded-[20px] border border-border-strong bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
						<div className="grid min-w-0 flex-1 gap-3 md:grid-cols-2 xl:min-w-[28rem]">
							<label className="flex min-w-0 flex-col gap-1.5">
								<span className="workspace-section-label">Base Branch</span>
								<Combobox
									options={branchOptions}
									value={baseRef}
									onSelect={handleBaseRefChange}
									disabled={branchOptions.length === 0 || isRepoLoading}
									placeholder="Select base branch"
								/>
							</label>

							<label className="flex min-w-0 flex-col gap-1.5">
								<span className="workspace-section-label">Head Branch</span>
								<Combobox
									options={branchOptions}
									value={headRef}
									onSelect={handleHeadRefChange}
									disabled={branchOptions.length === 0 || isRepoLoading}
									placeholder="Select head branch"
								/>
							</label>
						</div>

						<div className="flex flex-wrap items-center gap-2 xl:justify-end">
							<Button
								variant="accent"
								size="sm"
								className="min-w-[11rem]"
								onClick={() => void handleStartReview()}
								disabled={!canStartReview}
							>
								{isRunStarting ? (
									<>
										<Loader2 className="size-4 animate-spin" />
										Starting review
									</>
								) : (
									<>
										<Play className="size-4" />
										Start Review
									</>
								)}
							</Button>

							{hasCancelableRun ? (
								<Button
									variant="danger"
									size="sm"
									className="min-w-[8.5rem]"
									onClick={() => void handleCancelReview()}
									disabled={!canCancelReview}
								>
									{isRunCancelling ? (
										<>
											<Loader2 className="size-4 animate-spin" />
											Cancelling
										</>
									) : (
										<>
											<Square className="size-4" />
											Cancel Run
										</>
									)}
								</Button>
							) : null}
							<Button
								variant="toolbar"
								size="toolbar-icon"
								onClick={() => setIsReviewSetupOpen((current) => !current)}
								aria-expanded={isReviewSetupOpen}
								aria-controls="review-setup-panel"
								aria-label={
									isReviewSetupOpen
										? "Collapse branch review setup"
										: "Expand branch review setup"
								}
								title={
									isReviewSetupOpen
										? "Collapse branch review setup"
										: "Expand branch review setup"
								}
							>
								{isReviewSetupOpen ? (
									<ChevronDown className="size-4" />
								) : (
									<ChevronRight className="size-4" />
								)}
							</Button>
						</div>
					</div>

					{isReviewSetupOpen ? (
						<div id="review-setup-panel" className="flex flex-col gap-3">
							<div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
								{compareMetadata.map((item) => (
									<ReviewMetaPill
										key={item.label}
										label={item.label}
										value={item.value}
										isMono={item.isMono}
									/>
								))}
								{reviewResult ? (
									<>
										<ReviewMetaPill
											label="Review"
											value={findingsLabel}
											isMono={false}
										/>
										<ReviewMetaPill
											label="Generated"
											value={formatGeneratedAt(reviewResult.generated_at)}
											isMono={false}
										/>
									</>
								) : null}
							</div>

							<div className="grid gap-3 lg:grid-cols-2">
								<ReviewBranchTipCard
									label={isViewingHistory ? "Base (Current Tip)" : "Base"}
									branchName={baseRef}
									commit={baseTipCommit}
									isLoading={isRepoLoading}
								/>
								<ReviewBranchTipCard
									label={isViewingHistory ? "Head (Current Tip)" : "Head"}
									branchName={headRef}
									commit={headTipCommit}
									isLoading={isRepoLoading}
								/>
							</div>

							<label className="flex flex-col gap-1.5">
								<span className="workspace-section-label">Optional Review Instructions</span>
								<Textarea
									value={customInstructions}
									onChange={(event) => setCustomInstructions(event.target.value)}
									placeholder="Optional: steer Codex toward specific areas of concern."
									className="min-h-24"
									disabled={isViewingHistory || historySelectionLoadingRunId !== null}
								/>
							</label>
						</div>
					) : null}
				</div>
			</div>

			{repoError ? (
				<InlineBanner tone="danger" title={repoError} />
			) : branchOptions.length === 0 && !isRepoLoading && repoPath ? (
				<InlineBanner
					tone="info"
					title="Review mode needs local branches."
					description="This repository does not currently expose any selectable local branches for review."
				/>
			) : null}

			{!isViewingHistory && sessionError ? (
				<InlineBanner tone="danger" title={sessionError} />
			) : null}
			{!isViewingHistory && runError ? (
				<InlineBanner tone="danger" title={runError} />
			) : null}
			{historySelectionError ? (
				<InlineBanner tone="danger" title={historySelectionError} />
			) : null}
			{pendingApprovals.length > 0 ? (
				<PendingApprovals
					approvals={pendingApprovals}
					loadingById={approvalLoadingById}
					onDecision={(approval, decision) => {
						void handleApprovalDecision(approval, decision);
					}}
				/>
			) : null}
		</div>
	);
	const previousReviewsSection =
		repoPath && baseRef && headRef ? (
			<section className="rounded-[20px] border border-border-strong bg-[linear-gradient(180deg,rgba(255,255,255,0.038),rgba(255,255,255,0.018))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
						<div className="min-w-0">
							<div className="text-sm font-semibold text-text-primary">
								Previous Reviews
							</div>
							<div className="mt-1 text-sm text-text-secondary">
								{previousReviewHistory.length === 0
									? "Completed successful reviews for this branch pair will appear here."
									: `Showing ${filteredPreviousReviewHistory.length} of ${previousReviewHistory.length} previous review${previousReviewHistory.length === 1 ? "" : "s"}.`}
							</div>
						</div>

						<div className="flex flex-wrap items-center gap-2">
							{isViewingHistory ? (
								<Button
									variant="toolbar"
									size="sm"
									className="self-start"
									onClick={handleReturnToLatestReview}
								>
									Return to Latest Review
								</Button>
							) : null}
							{hasActiveHistoryFilters ? (
								<Button
									variant="toolbar"
									size="sm"
									className="self-start"
									onClick={resetHistoryFilters}
								>
									Clear filters
								</Button>
							) : null}
							<Button
								variant="toolbar"
								size="toolbar-icon"
								onClick={() => setIsPreviousReviewsOpen((current) => !current)}
								aria-expanded={isPreviousReviewsOpen}
								aria-controls="previous-reviews-panel"
								aria-label={
									isPreviousReviewsOpen
										? "Collapse previous reviews"
										: "Expand previous reviews"
								}
								title={
									isPreviousReviewsOpen
										? "Collapse previous reviews"
										: "Expand previous reviews"
								}
							>
								{isPreviousReviewsOpen ? (
									<ChevronDown className="size-4" />
								) : (
									<ChevronRight className="size-4" />
								)}
							</Button>
						</div>
					</div>

					{isPreviousReviewsOpen ? (
						<>
							<div
								id="previous-reviews-panel"
								className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,0.8fr))]"
							>
								<label className="flex min-w-0 flex-col gap-1.5">
									<Label className="text-sm text-text-secondary">
										Search metadata
									</Label>
									<Input
										value={historySearchQuery}
										onChange={(event) => setHistorySearchQuery(event.target.value)}
										placeholder="Search ids, refs, SHAs, timestamps, or review metadata"
									/>
								</label>

								<label className="flex min-w-0 flex-col gap-1.5">
									<Label className="text-sm text-text-secondary">Outcome</Label>
									<Select
										value={historyOutcomeFilter}
										onValueChange={(value) =>
											setHistoryOutcomeFilter(value as ReviewHistoryOutcomeFilter)
										}
									>
										<SelectTrigger>
											<SelectValue placeholder="All reviews" />
										</SelectTrigger>
										<SelectContent>
											{REVIEW_HISTORY_OUTCOME_OPTIONS.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</label>

								<label className="flex min-w-0 flex-col gap-1.5">
									<Label className="text-sm text-text-secondary">Severity</Label>
									<Select
										value={historySeverityFilter}
										onValueChange={(value) =>
											setHistorySeverityFilter(value as ReviewHistorySeverityFilter)
										}
									>
										<SelectTrigger>
											<SelectValue placeholder="Any severity" />
										</SelectTrigger>
										<SelectContent>
											{REVIEW_HISTORY_SEVERITY_OPTIONS.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</label>

								<DatePicker
									label="Generated After"
									value={historyStartDate}
									onChange={setHistoryStartDate}
									id="review-history-start-date"
									placeholder="Start date"
								/>

								<DatePicker
									label="Generated Before"
									value={historyEndDate}
									onChange={setHistoryEndDate}
									id="review-history-end-date"
									placeholder="End date"
								/>
							</div>

							{historyError ? (
								<InlineBanner tone="danger" title={historyError} />
							) : null}

							<div className="space-y-3">
								{filteredPreviousReviewHistory.length > 0 ? (
									filteredPreviousReviewHistory.map((entry) => {
										const severityEntries = getSeverityCountEntries(entry);
										const isSelected =
											selectedHistoryView?.entry.run_id === entry.run_id;
										const isLoading = historySelectionLoadingRunId === entry.run_id;

										return (
											<button
												type="button"
												key={entry.run_id}
												className={cn(
													"w-full cursor-pointer rounded-[18px] border p-3 text-left transition-[border-color,background-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-wait disabled:opacity-100",
													isSelected
														? "border-[rgba(122,162,255,0.38)] bg-[rgba(122,162,255,0.08)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_0_1px_rgba(122,162,255,0.12)] hover:border-[rgba(122,162,255,0.48)] hover:bg-[rgba(122,162,255,0.11)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_0_1px_rgba(122,162,255,0.18),0_14px_30px_rgba(8,15,28,0.18)]"
														: "border-border-subtle bg-[rgba(255,255,255,0.028)] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] hover:-translate-y-px hover:border-border-strong hover:bg-[rgba(255,255,255,0.04)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_14px_30px_rgba(8,15,28,0.18)]",
												)}
												disabled={isLoading}
												onClick={() => {
													void handleSelectHistoryReview(entry);
												}}
												aria-pressed={isSelected}
												aria-label={`Load previous review ${entry.run_id}`}
											>
												<div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
													<div className="min-w-0 flex-1">
														<div className="flex flex-wrap items-center gap-2">
															<div className="text-sm font-medium text-text-primary">
																{formatGeneratedAt(entry.generated_at)}
															</div>
															<StatusPill tone={getHistoryOutcomeTone(entry)}>
																{getFindingCountLabel(entry.findings_count)}
															</StatusPill>
															{severityEntries.map((severity) => (
																<StatusPill
																	key={`${entry.run_id}:${severity.key}`}
																	tone={severity.tone}
																>
																	{severity.label}
																</StatusPill>
															))}
														</div>

														<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
															<span className="font-mono">
																base {formatShortSha(entry.base_head_sha)}
															</span>
															<span className="font-mono">
																head {formatShortSha(entry.head_head_sha)}
															</span>
															<span className="font-mono">
																merge {formatShortSha(entry.merge_base_sha)}
															</span>
														</div>
													</div>

													<div className="flex shrink-0 items-center gap-2 text-xs text-text-secondary">
														{isLoading ? (
															<Loader2 className="size-4 animate-spin" />
														) : null}
														<span>
															Completed {formatGeneratedAt(entry.completed_at)}
														</span>
													</div>
												</div>

												<p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
													{entry.summary}
												</p>
											</button>
										);
									})
								) : (
									<EmptyState
										title={
											hasActiveHistoryFilters
												? "No previous reviews match the current filters."
												: isHistoryLoading
													? "Loading previous reviews..."
													: "No previous successful reviews yet."
										}
										description={
											hasActiveHistoryFilters
												? "Try broadening the metadata search or clearing one or more filters."
												: "Completed reviews for this base/head branch pair will appear here once they finish successfully."
										}
										className="items-center text-center"
									/>
								)}
							</div>
						</>
					) : null}
				</div>
			</section>
		) : null;

	const changedFilesLabel = displayedSession
		? `${displayedSession.stats.files_changed} file${displayedSession.stats.files_changed === 1 ? "" : "s"} changed`
		: "Review diff";
	const isDisplayedSessionLoading =
		historySelectionLoadingRunId !== null || (!isViewingHistory && isSessionLoading);
	const workspaceTopContent = (
		<div className="flex min-w-0 items-center gap-3">
			<div className="flex size-9 shrink-0 items-center justify-center rounded-[12px] border border-border-subtle bg-[rgba(255,255,255,0.035)]">
				<GitCommitHorizontal className="size-4 text-text-secondary" />
			</div>

			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
					<div className="text-sm font-semibold text-text-primary">
						{changedFilesLabel}
					</div>
					{displayedSession ? (
						<div className="flex items-center gap-2 font-mono text-[11px]">
							<span className="text-success">+{displayedSession.stats.additions}</span>
							<span className="text-danger">-{displayedSession.stats.deletions}</span>
							<span className="text-text-secondary">lines changed</span>
						</div>
					) : null}
				</div>

				<div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
					<span className="font-mono text-text-primary">
						{baseRef || "Base"}
					</span>
					<span>vs</span>
					<span className="font-mono text-text-primary">
						{headRef || "Head"}
					</span>
					{displayedSession?.merge_base_sha ? (
						<>
							<span className="text-text-tertiary">merge</span>
							<span className="font-mono">
								{formatShortSha(displayedSession.merge_base_sha)}
							</span>
						</>
					) : null}
					{activeRun ? (
						<StatusPill tone={getRunStatusTone(activeRun.status)}>
							{formatLabel(activeRun.status)}
						</StatusPill>
					) : null}
					{reviewResult ? <span>{findingsLabel}</span> : null}
				</div>
			</div>
		</div>
	);

	const mobileReviewPanel =
		activeRun && isReviewVisible ? (
			<div className="xl:hidden">
				<ReviewInsightsPanel
					activeRun={activeRun}
					reviewResult={reviewResult}
					findingsLabel={findingsLabel}
					selectedFindingId={selectedFindingId}
					onSelectFinding={handleFindingSelect}
					canNavigateToFinding={canNavigateToFinding}
					reasoningTrace={reasoningTrace}
					isInline
					onToggleOpen={() => setReviewPanelMode("collapsed")}
					onToggleFullscreen={() => setReviewPanelMode("rail")}
				/>
			</div>
		) : null;

	const desktopCollapsedReviewRail =
		activeRun ? (
			<button
				type="button"
				className="flex h-full w-full flex-col items-center justify-center gap-3 bg-transparent px-2 py-4 text-text-secondary transition-colors hover:bg-[rgba(255,255,255,0.04)]"
				onClick={() => setReviewPanelMode("rail")}
				aria-label="Show AI review"
				title="Show AI review"
			>
				<PanelRightOpen className="size-4" />
				<span className="rounded-full border border-[rgba(122,162,255,0.24)] bg-[rgba(122,162,255,0.12)] px-2 py-0.5 font-mono text-[10px] text-text-primary">
					{reviewResult ? reviewResult.findings.length : "..."}
				</span>
				<span className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-semibold tracking-[0.22em] text-text-tertiary uppercase">
					Review
				</span>
			</button>
		) : undefined;

	return (
		<div className="workspace-shell min-h-screen">
			<div className="flex min-h-screen flex-col pb-4">
				<div className="px-4 pt-4">
					<CommitToolbar
						repoPath={repoPath}
						onExit={() => navigate(repoPath ? buildRepoRoute(repoPath) : "/")}
						onCollapseAll={
							displayedSession?.file_changes?.length
								? () => diffWorkspaceRef.current?.collapseAll()
								: undefined
						}
					/>
				</div>

				<div className="px-4 pt-4">{pageTopContent}</div>
				{previousReviewsSection ? (
					<div className="px-4 pt-4">{previousReviewsSection}</div>
				) : null}

				{mobileReviewPanel ? <div className="px-4 pt-4">{mobileReviewPanel}</div> : null}

				<div className="px-4 pb-4 pt-4">
					<div className="sticky top-[calc(var(--header-height)+1rem)] z-10 h-[calc(100dvh-var(--header-height)-2rem)]">
						<DiffWorkspace
							ref={diffWorkspaceRef}
							repoPath={repoPath}
							viewerId={displayedSession ? `review:${displayedSession.id}` : "review"}
							files={displayedSession?.file_changes ?? []}
							isLoading={isDisplayedSessionLoading}
							error={
								!repoPath
									? "No Git project path was provided."
									: displayedSession
										? null
										: isViewingHistory
											? historySelectionError
											: sessionError
							}
							topContent={workspaceTopContent}
							fileSearchInputId="review-file-search-input"
							codeSearchInputId="review-code-search-input"
							emptyTitle="Select two local branches to prepare a review session."
							emptyDescription="GitOdyssey creates a persisted Codex review session for merge-base(base, head)...head and then runs the review in a disposable worktree."
							chromeDensity="compact"
							fileTreeCollapsible
							desktopResize={{
								minContentWidth: REVIEW_DIFF_MIN_WIDTH,
								fileTree: {
									preferredWidth: fileTreePreferredWidth,
									defaultWidth: REVIEW_FILE_TREE_WIDTH_DEFAULT,
									minWidth: REVIEW_FILE_TREE_WIDTH_MIN,
									onPreferredWidthChange: setFileTreePreferredWidth,
								},
								rightRail: {
									preferredWidth: reviewRailPreferredWidth,
									defaultWidth: REVIEW_RIGHT_RAIL_WIDTH_DEFAULT,
									minWidth: REVIEW_RIGHT_RAIL_WIDTH_MIN,
									onPreferredWidthChange: setReviewRailPreferredWidth,
								},
							}}
							rightRail={
								activeRun ? (
									<ReviewInsightsPanel
										activeRun={activeRun}
										reviewResult={reviewResult}
										findingsLabel={findingsLabel}
										selectedFindingId={selectedFindingId}
										onSelectFinding={handleFindingSelect}
										canNavigateToFinding={canNavigateToFinding}
										reasoningTrace={reasoningTrace}
										isFullscreen={isReviewFullscreen}
										onToggleOpen={() => setReviewPanelMode("collapsed")}
										onToggleFullscreen={() =>
											setReviewPanelMode((current) =>
												current === "fullscreen" ? "rail" : "fullscreen",
											)
										}
									/>
								) : undefined
							}
							isRightRailOpen={Boolean(activeRun) && isReviewRailOpen}
							isRightRailFullscreen={Boolean(activeRun) && isReviewFullscreen}
							rightRailCollapsedSummary={desktopCollapsedReviewRail}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
