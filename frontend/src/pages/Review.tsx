import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	AlertTriangle,
	ChevronDown,
	ChevronRight,
	GitCommitHorizontal,
	Loader2,
	PanelRightOpen,
	Play,
	ShieldAlert,
	Square,
	Terminal,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
	cancelReviewRun,
	createReviewSession,
	getDesktopRepoSettings,
	getReviewRun,
	getReviewSession,
	onReviewRuntimeEvent,
	respondReviewApproval,
	startReviewRun,
} from "@/api/api";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/custom/Combobox";
import {
	DiffWorkspace,
	type DiffWorkspaceHandle,
} from "@/components/ui/custom/DiffWorkspace";
import { CommitToolbar } from "@/components/ui/custom/CommitToolbar";
import { MarkdownRenderer } from "@/components/ui/custom/MarkdownRenderer";
import { InlineBanner } from "@/components/ui/inline-banner";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import { useRepoData } from "@/hooks/useRepoData";
import type { Commit } from "@/lib/definitions/repo";
import type {
	ReviewApproval,
	ReviewApprovalDecision,
	ReviewFinding,
	ReviewResult,
	ReviewRun,
	ReviewRunEvent,
	ReviewRuntimeEvent,
	ReviewSession,
} from "@/lib/definitions/review";
import {
	buildRepoRoute,
	buildReviewRoute,
	readRepoPathFromSearchParams,
	readReviewRefsFromSearchParams,
} from "@/lib/repoPaths";

const DETACHED_HEAD_LABEL = "HEAD (detached)";
const ACTIVE_RUN_STATUSES = new Set(["pending", "running", "awaiting_approval"]);

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

type CommandTraceEntry = {
	id: string;
	command: string;
	cwd: string;
	output: string;
	exitCode: number | null;
	durationMs: number | null;
};

type ReasoningTraceEntry = {
	id: string;
	method: string | null;
	text: string;
	sequence: number;
	createdAt: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function formatDuration(durationMs: number | null) {
	if (typeof durationMs !== "number" || durationMs < 0) {
		return "Unknown";
	}

	if (durationMs < 1000) {
		return `${durationMs} ms`;
	}

	return `${(durationMs / 1000).toFixed(1)} s`;
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
	return Boolean(method && method.toLowerCase().includes("reason"));
}

function isReasoningItem(item: Record<string, unknown> | null) {
	const itemType = getStringField(item, "type");
	return Boolean(itemType && itemType.toLowerCase().includes("reason"));
}

function extractReasoningText(item: Record<string, unknown> | null, params: Record<string, unknown>) {
	return (
		extractSummaryText(item?.summary) ||
		extractSummaryText(params.summary) ||
		getStringField(item, "text")?.trim() ||
		getStringField(params, "text")?.trim() ||
		getStringField(params, "delta") ||
		null
	);
}

function extractCompletedCommands(events: ReviewRunEvent[]): CommandTraceEntry[] {
	return events
		.filter((event) => event.event_type === "codex_notification")
		.flatMap((event) => {
			const method = getPayloadMethod(event);
			const params = getPayloadParams(event);
			const item = params && isRecord(params.item) ? params.item : null;
			if (method !== "item/completed" || !item || item.type !== "commandExecution") {
				return [];
			}

			return [
				{
					id:
						typeof item.id === "string"
							? item.id
							: `command-${event.id}`,
					command: typeof item.command === "string" ? item.command : "",
					cwd: typeof item.cwd === "string" ? item.cwd : "",
					output:
						typeof item.aggregatedOutput === "string"
							? item.aggregatedOutput
							: "",
					exitCode:
						typeof item.exitCode === "number" ? item.exitCode : null,
					durationMs:
						typeof item.durationMs === "number" ? item.durationMs : null,
				},
			];
		});
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

		const itemId =
			getStringField(params, "itemId") || getStringField(item, "id");
		const isDeltaUpdate = Boolean(
			method?.toLowerCase().includes("delta") && getStringField(params, "delta"),
		);

		if (!itemId) {
			standaloneTraces.push({
				id: `reasoning-${event.id}`,
				method,
				text: text.trim(),
				sequence: event.sequence,
				createdAt: event.created_at,
			});
			continue;
		}

		const existingTrace = tracesById.get(itemId);
		const nextText = isDeltaUpdate
			? `${existingTrace?.text || ""}${text}`.trim()
			: text.trim();

		tracesById.set(itemId, {
			id: itemId,
			method,
			text: nextText,
			sequence: event.sequence,
			createdAt: event.created_at,
		});
	}

	return [...tracesById.values(), ...standaloneTraces]
		.filter((trace) => trace.text.trim())
		.sort((left, right) => right.sequence - left.sequence);
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

function ReviewFindingsList({
	findings,
	onSelect,
}: {
	findings: ReviewFinding[];
	onSelect: (finding: ReviewFinding) => void;
}) {
	if (findings.length === 0) {
		return (
			<div className="rounded-[16px] border border-dashed border-border-subtle px-3 py-4 text-sm text-text-secondary">
				No structured findings were generated for this review run.
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{findings.map((finding) => (
				<button
					key={finding.id}
					type="button"
					className="w-full rounded-[16px] border border-border-subtle bg-control/50 px-3 py-3 text-left transition-colors hover:border-border-strong hover:bg-control"
					onClick={() => onSelect(finding)}
				>
					<div className="flex flex-wrap items-center gap-2">
						<StatusPill tone={getSeverityTone(finding.severity)}>
							{formatSeverityLabel(finding.severity)}
						</StatusPill>
						<span className="font-medium text-text-primary">
							{finding.title}
						</span>
					</div>
					<div className="mt-2 font-mono text-[11px] text-text-tertiary">
						{finding.file_path}
						{finding.new_start != null ? ` @ new:${finding.new_start}` : ""}
						{finding.old_start != null ? ` old:${finding.old_start}` : ""}
					</div>
					<div className="mt-2 text-sm leading-6 text-text-secondary">
						<p className="whitespace-pre-wrap">{finding.body}</p>
					</div>
				</button>
			))}
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

function CommandTrace({ commands }: { commands: CommandTraceEntry[] }) {
	if (commands.length === 0) {
		return (
			<div className="rounded-[16px] border border-dashed border-border-subtle px-3 py-4 text-sm text-text-secondary">
				No completed shell commands were captured for this run yet.
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{commands.map((command) => (
				<div
					key={command.id}
					className="rounded-[16px] border border-border-subtle bg-control/45 p-3"
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="min-w-0">
							<div className="truncate font-mono text-[12px] text-text-primary">
								{command.command}
							</div>
							<div className="mt-1 truncate text-[11px] text-text-tertiary">
								{command.cwd || "Unknown working directory"}
							</div>
						</div>
						<div className="flex items-center gap-2">
							<StatusPill
								tone={command.exitCode === 0 ? "success" : "danger"}
							>
								{command.exitCode == null ? "No exit" : `Exit ${command.exitCode}`}
							</StatusPill>
							<StatusPill tone="neutral">{formatDuration(command.durationMs)}</StatusPill>
						</div>
					</div>
					{command.output ? (
						<pre className="workspace-scrollbar mt-3 max-h-56 overflow-auto rounded-[12px] border border-border-subtle bg-[rgba(2,6,23,0.52)] p-3 font-mono text-[11px] leading-5 text-text-secondary">
							{command.output}
						</pre>
					) : (
						<div className="mt-3 text-sm text-text-secondary">
							This command did not produce captured output.
						</div>
					)}
				</div>
			))}
		</div>
	);
}

function EventFeed({ entries }: { entries: ReasoningTraceEntry[] }) {
	if (entries.length === 0) {
		return (
			<div className="rounded-[16px] border border-dashed border-border-subtle px-3 py-4 text-sm text-text-secondary">
				No agent reasoning traces have been persisted yet.
			</div>
		);
	}

	const visibleEntries = entries.slice(0, 32);

	return (
		<div className="space-y-3">
			{visibleEntries.map((entry) => (
				<div
					key={entry.id}
					className="rounded-[16px] border border-border-subtle bg-control/35 p-3"
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="text-sm font-medium text-text-primary">
							Agent Reasoning
						</div>
						<div className="font-mono text-[11px] text-text-tertiary">
							#{entry.sequence}
						</div>
					</div>
					<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-tertiary">
						<span>{formatGeneratedAt(entry.createdAt)}</span>
						{entry.method ? (
							<span className="font-mono">{entry.method}</span>
						) : null}
					</div>
					<div className="mt-3 rounded-[12px] border border-border-subtle bg-[rgba(2,6,23,0.52)] p-3">
						<MarkdownRenderer content={entry.text} className="text-[13px]" />
					</div>
				</div>
			))}
		</div>
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
	const refreshTimerRef = useRef<number | null>(null);

	const [baseRef, setBaseRef] = useState(queryBaseRef ?? "");
	const [headRef, setHeadRef] = useState(queryHeadRef ?? "");
	const [customInstructions, setCustomInstructions] = useState("");
	const [session, setSession] = useState<ReviewSession | null>(null);
	const [sessionError, setSessionError] = useState<string | null>(null);
	const [runError, setRunError] = useState<string | null>(null);
	const [isSessionLoading, setIsSessionLoading] = useState(false);
	const [isRunStarting, setIsRunStarting] = useState(false);
	const [isRunCancelling, setIsRunCancelling] = useState(false);
	const [runDetail, setRunDetail] = useState<ReviewRun | null>(null);
	const [isCommandTraceOpen, setIsCommandTraceOpen] = useState(false);
	const [isEventStreamOpen, setIsEventStreamOpen] = useState(false);
	const [approvalLoadingById, setApprovalLoadingById] = useState<
		Record<string, boolean>
	>({});
	const [isInsightsOpen, setIsInsightsOpen] = useState(false);

	const {
		commits,
		branches,
		isLoading: isRepoLoading,
		error: repoError,
	} = useRepoData({ repoPath });

	useEffect(() => {
		setBaseRef(queryBaseRef ?? "");
	}, [queryBaseRef]);

	useEffect(() => {
		setHeadRef(queryHeadRef ?? "");
	}, [queryHeadRef]);

	useEffect(() => {
		setSession(null);
		setRunDetail(null);
		setSessionError(null);
		setRunError(null);
		setApprovalLoadingById({});
	}, [baseRef, headRef, repoPath]);

	useEffect(() => {
		if (!runDetail?.result) {
			setIsInsightsOpen(false);
		}
	}, [runDetail?.result]);

	useEffect(() => {
		if (!isInsightsOpen) {
			setIsCommandTraceOpen(false);
			setIsEventStreamOpen(false);
		}
	}, [isInsightsOpen]);

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

	const handleBaseRefChange = useCallback(
		(nextBaseRef: string) => {
			setBaseRef(nextBaseRef);
			updateRoute(nextBaseRef, headRef);
		},
		[headRef, updateRoute],
	);

	const handleHeadRefChange = useCallback(
		(nextHeadRef: string) => {
			setHeadRef(nextHeadRef);
			updateRoute(baseRef, nextHeadRef);
		},
		[baseRef, updateRoute],
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
				setRunDetail(null);
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

	const activeRunSummary = session?.runs[0] ?? null;
	const activeRun = runDetail?.id === activeRunSummary?.id
		? runDetail
		: runDetail ?? activeRunSummary;
	const reviewResult: ReviewResult | null = activeRun?.result ?? null;
	const activeApprovals = activeRun?.approvals ?? [];
	const pendingApprovals = activeApprovals.filter(
		(approval) => approval.status === "pending",
	);
	const commandTrace = useMemo(
		() => extractCompletedCommands(runDetail?.events ?? []),
		[runDetail?.events],
	);
	const reasoningTrace = useMemo(
		() => extractReasoningTraces(runDetail?.events ?? []),
		[runDetail?.events],
	);

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
		if (!session || !activeRun) {
			return;
		}

		setIsRunCancelling(true);
		setRunError(null);
		try {
			await cancelReviewRun({
				sessionId: session.id,
				runId: activeRun.id,
			});
			await refreshSessionState(session.id, activeRun.id);
		} catch (error) {
			setRunError(getErrorMessage(error));
		} finally {
			setIsRunCancelling(false);
		}
	}, [activeRun, refreshSessionState, session]);

	const handleApprovalDecision = useCallback(
		async (approval: ReviewApproval, decision: ReviewApprovalDecision) => {
			if (!session || !activeRun) {
				return;
			}

			setApprovalLoadingById((current) => ({
				...current,
				[approval.id]: true,
			}));
			try {
				await respondReviewApproval({
					sessionId: session.id,
					runId: activeRun.id,
					approvalId: approval.id,
					decision,
				});
				await refreshSessionState(session.id, activeRun.id);
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
		[activeRun, refreshSessionState, session],
	);

	const handleFindingSelect = useCallback((finding: ReviewFinding) => {
		diffWorkspaceRef.current?.focusLocation({
			filePath: finding.file_path,
			newStart: finding.new_start ?? null,
			oldStart: finding.old_start ?? null,
		});
	}, []);

	const handleInsightFindingSelect = useCallback(
		(finding: ReviewFinding) => {
			handleFindingSelect(finding);
			setIsInsightsOpen(false);
		},
		[handleFindingSelect],
	);

	const canStartReview = Boolean(
		session &&
			!isSessionLoading &&
			!isRunStarting &&
			!(activeRun && ACTIVE_RUN_STATUSES.has(activeRun.status)),
	);
	const canCancelReview = Boolean(
		session &&
			activeRun &&
			ACTIVE_RUN_STATUSES.has(activeRun.status) &&
			!isRunCancelling,
	);

	const findingsLabel = reviewResult
		? `${reviewResult.findings.length} finding${reviewResult.findings.length === 1 ? "" : "s"}`
		: activeRun
			? formatLabel(activeRun.status)
			: "No review";

	const compareMetadata = [
		{
			label: "Base",
			value: baseRef
				? baseTipCommit
					? formatShortSha(baseTipCommit.sha)
					: isRepoLoading
						? "Loading"
						: "Unavailable"
				: "Not selected",
		},
		{
			label: "Head",
			value: headRef
				? headTipCommit
					? formatShortSha(headTipCommit.sha)
					: isRepoLoading
						? "Loading"
						: "Unavailable"
				: "Not selected",
		},
		{
			label: "Merge",
			value: session?.merge_base_sha
				? formatShortSha(session.merge_base_sha)
				: "Pending",
		},
		{
			label: "Files",
			value: session ? String(session.stats.files_changed) : "Pending",
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
										Start Codex Review
									</>
								)}
							</Button>

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

							<Button
								variant="toolbar"
								size="sm"
								className="min-w-[8.5rem] justify-between"
								onClick={() => setIsInsightsOpen(true)}
								disabled={!activeRun}
								aria-haspopup="dialog"
							>
								<span className="flex items-center gap-2">
									<PanelRightOpen className="size-4" />
									Run Details
								</span>
								{activeRun ? (
									<span className="rounded-full border border-border-subtle bg-control px-1.5 py-0.5 font-mono text-[10px] text-text-primary">
										{pendingApprovals.length}
									</span>
								) : null}
							</Button>
						</div>
					</div>

					<label className="flex flex-col gap-1.5">
						<span className="workspace-section-label">Optional Review Instructions</span>
						<Textarea
							value={customInstructions}
							onChange={(event) => setCustomInstructions(event.target.value)}
							placeholder="Optional: steer Codex toward specific areas of concern."
							className="min-h-24"
						/>
					</label>

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
						{session ? (
							<StatusPill tone={getRunStatusTone(session.status)}>
								Session {formatLabel(session.status)}
							</StatusPill>
						) : null}
						{activeRun ? (
							<StatusPill
								tone={getRunStatusTone(activeRun.status)}
								pulse={ACTIVE_RUN_STATUSES.has(activeRun.status)}
							>
								Run {formatLabel(activeRun.status)}
							</StatusPill>
						) : null}
					</div>

					<div className="grid gap-3 lg:grid-cols-2">
						<ReviewBranchTipCard
							label="Base"
							branchName={baseRef}
							commit={baseTipCommit}
							isLoading={isRepoLoading}
						/>
						<ReviewBranchTipCard
							label="Head"
							branchName={headRef}
							commit={headTipCommit}
							isLoading={isRepoLoading}
						/>
					</div>
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

			{sessionError ? <InlineBanner tone="danger" title={sessionError} /> : null}
			{runError ? <InlineBanner tone="danger" title={runError} /> : null}
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

	const changedFilesLabel = session
		? `${session.stats.files_changed} file${session.stats.files_changed === 1 ? "" : "s"} changed`
		: "Review diff";
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
					{session ? (
						<div className="flex items-center gap-2 font-mono text-[11px]">
							<span className="text-success">+{session.stats.additions}</span>
							<span className="text-danger">-{session.stats.deletions}</span>
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
					{session?.merge_base_sha ? (
						<>
							<span className="text-text-tertiary">merge</span>
							<span className="font-mono">
								{formatShortSha(session.merge_base_sha)}
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

	return (
		<>
			<div className="workspace-shell min-h-screen">
				<div className="flex min-h-screen flex-col pb-4">
					<div className="px-4 pt-4">
						<CommitToolbar
							repoPath={repoPath}
							detailLabel="Review"
							onExit={() => navigate(repoPath ? buildRepoRoute(repoPath) : "/")}
							onCollapseAll={
								session?.file_changes?.length
									? () => diffWorkspaceRef.current?.collapseAll()
									: undefined
							}
						/>
					</div>

					<div className="px-4 pt-4">{pageTopContent}</div>

					<div className="px-4 pb-4 pt-4">
						<div className="sticky top-[calc(var(--header-height)+1rem)] z-10 h-[calc(100dvh-var(--header-height)-2rem)]">
							<DiffWorkspace
								ref={diffWorkspaceRef}
								repoPath={repoPath}
								viewerId={session ? `review:${session.id}` : "review"}
								files={session?.file_changes ?? []}
								isLoading={isSessionLoading}
								error={
									!repoPath ? "No Git project path was provided." : sessionError
								}
								topContent={workspaceTopContent}
								fileSearchInputId="review-file-search-input"
								codeSearchInputId="review-code-search-input"
								emptyTitle="Select two local branches to prepare a review session."
								emptyDescription="GitOdyssey creates a persisted Codex review session for merge-base(base, head)...head and then runs the review in a disposable worktree."
								chromeDensity="compact"
								fileTreeCollapsible
							/>
						</div>
					</div>
				</div>
			</div>

			<Sheet
				open={Boolean(activeRun) && isInsightsOpen}
				onOpenChange={setIsInsightsOpen}
			>
				{activeRun ? (
					<SheetContent side="right" className="w-[min(38rem,100vw)] gap-0 p-0">
						<SheetHeader className="border-b border-border-subtle p-5 pb-4">
							<div className="flex items-start justify-between gap-3 pr-8">
								<div className="min-w-0">
									<SheetTitle>Codex Review Run</SheetTitle>
									<SheetDescription className="mt-1 text-left">
										{`${baseRef || "Base"} -> ${headRef || "Head"} / ${formatLabel(activeRun.status)}`}
									</SheetDescription>
								</div>
								<StatusPill tone={getRunStatusTone(activeRun.status)} pulse={ACTIVE_RUN_STATUSES.has(activeRun.status)}>
									{formatLabel(activeRun.status)}
								</StatusPill>
							</div>
						</SheetHeader>

						<div className="workspace-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
							<section className="rounded-[18px] border border-border-subtle bg-[rgba(255,255,255,0.026)] p-4">
								<div className="flex items-center justify-between gap-3">
									<div className="workspace-section-label">Structured Review</div>
									<div className="font-mono text-xs text-text-tertiary">
										{findingsLabel}
									</div>
								</div>
								{reviewResult ? (
									<>
										<div className="mt-3 text-sm leading-6 text-text-secondary">
											<MarkdownRenderer content={reviewResult.summary} />
										</div>
										<div className="mt-4">
											<ReviewFindingsList
												findings={reviewResult.findings}
												onSelect={handleInsightFindingSelect}
											/>
										</div>
									</>
								) : (
									<div className="mt-3 text-sm text-text-secondary">
										Codex has not emitted the structured result for this run yet.
									</div>
								)}
							</section>

							<section className="mt-4 rounded-[18px] border border-border-subtle bg-[rgba(255,255,255,0.026)] p-4">
								<div className="flex items-center justify-between gap-3">
									<div className="workspace-section-label">Approval History</div>
									<div className="font-mono text-xs text-text-tertiary">
										{activeApprovals.length}
									</div>
								</div>
								<div className="mt-3 space-y-3">
									{activeApprovals.length === 0 ? (
										<div className="rounded-[16px] border border-dashed border-border-subtle px-3 py-4 text-sm text-text-secondary">
											No approval prompts have been recorded for this run.
										</div>
									) : (
										activeApprovals.map((approval) => (
											<div
												key={approval.id}
												className="rounded-[16px] border border-border-subtle bg-control/45 p-3"
											>
												<div className="flex flex-wrap items-center justify-between gap-2">
													<div className="text-sm font-medium text-text-primary">
														{approval.summary || formatLabel(approval.method)}
													</div>
													<StatusPill tone={getApprovalTone(approval.status)}>
														{formatLabel(approval.status)}
													</StatusPill>
												</div>
												<div className="mt-1 font-mono text-[11px] text-text-tertiary">
													{approval.method}
												</div>
											</div>
										))
									)}
								</div>
							</section>

							<section className="mt-4 rounded-[18px] border border-border-subtle bg-[rgba(255,255,255,0.026)] p-4">
								<div className="flex items-center justify-between gap-3">
									<Button
										type="button"
										variant="toolbar"
										size="sm"
										className="h-auto px-0 py-0 text-left hover:bg-transparent"
										onClick={() =>
											setIsCommandTraceOpen((current) => !current)
										}
										aria-expanded={isCommandTraceOpen}
									>
										{isCommandTraceOpen ? (
											<ChevronDown className="size-4 text-text-secondary" />
										) : (
											<ChevronRight className="size-4 text-text-secondary" />
										)}
										<Terminal className="size-4 text-text-secondary" />
										<span className="workspace-section-label">Command Trace</span>
									</Button>
									<div className="flex items-center gap-2">
										<div className="font-mono text-xs text-text-tertiary">
											{commandTrace.length}
										</div>
									</div>
								</div>
								{isCommandTraceOpen ? (
									<div className="mt-3">
										<CommandTrace commands={commandTrace} />
									</div>
								) : null}
							</section>

							<section className="mt-4 rounded-[18px] border border-border-subtle bg-[rgba(255,255,255,0.026)] p-4">
								<div className="flex items-center justify-between gap-3">
									<Button
										type="button"
										variant="toolbar"
										size="sm"
										className="h-auto px-0 py-0 text-left hover:bg-transparent"
										onClick={() =>
											setIsEventStreamOpen((current) => !current)
										}
										aria-expanded={isEventStreamOpen}
									>
										{isEventStreamOpen ? (
											<ChevronDown className="size-4 text-text-secondary" />
										) : (
											<ChevronRight className="size-4 text-text-secondary" />
										)}
										<AlertTriangle className="size-4 text-text-secondary" />
										<span className="workspace-section-label">Event Stream</span>
									</Button>
									<div className="flex items-center gap-2">
										<div className="font-mono text-xs text-text-tertiary">
											{reasoningTrace.length}
										</div>
									</div>
								</div>
								{isEventStreamOpen ? (
									<div className="mt-3">
										<EventFeed entries={reasoningTrace} />
									</div>
								) : null}
							</section>
						</div>
					</SheetContent>
				) : null}
			</Sheet>
		</>
	);
}
