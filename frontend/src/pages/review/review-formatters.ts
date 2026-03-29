import type {
	ReviewApproval,
	ReviewFinding,
	ReviewHistoryEntry,
	ReviewResult,
	ReviewRun,
	ReviewSession,
} from "@/lib/definitions/review";
import { formatShortSha } from "@/lib/commitPresentation";

export function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Something went wrong.";
}

export function formatLabel(value: string) {
	return value
		.split(/[_-]/g)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

export function formatSeverityLabel(severity: ReviewFinding["severity"]) {
	return severity.charAt(0).toUpperCase() + severity.slice(1);
}

export function formatGeneratedAt(value?: string | null) {
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

export function getSeverityTone(severity: ReviewFinding["severity"]) {
	if (severity === "high") {
		return "danger";
	}

	if (severity === "medium") {
		return "warning";
	}

	return "accent";
}

export function getRunStatusTone(
	status?: ReviewRun["status"] | ReviewSession["status"] | null,
) {
	if (status === "completed") {
		return "success";
	}

	if (status === "failed" || status === "cancelled") {
		return "danger";
	}

	if (
		status === "running" ||
		status === "awaiting_approval" ||
		status === "pending"
	) {
		return "warning";
	}

	return "neutral";
}

export function getApprovalTone(status: ReviewApproval["status"]) {
	if (status === "accepted" || status === "accepted_for_session") {
		return "success";
	}

	if (status === "declined" || status === "cancelled") {
		return "danger";
	}

	return "warning";
}

export function getFindingCountLabel(count: number) {
	return count === 0 ? "Clean" : `${count} finding${count === 1 ? "" : "s"}`;
}

export function getHistoryOutcomeTone(entry: ReviewHistoryEntry) {
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

export function getSeverityCountEntries(entry: ReviewHistoryEntry) {
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

export function startOfLocalDay(value: Date) {
	const normalized = new Date(value);
	normalized.setHours(0, 0, 0, 0);
	return normalized.getTime();
}

export function endOfLocalDay(value: Date) {
	const normalized = new Date(value);
	normalized.setHours(23, 59, 59, 999);
	return normalized.getTime();
}

export function buildReviewHistorySearchText(entry: ReviewHistoryEntry) {
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

export function formatFindingReference(finding: ReviewFinding) {
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

export function parseTimestamp(value?: string | null) {
	if (!value) {
		return null;
	}

	const timestamp = Date.parse(value);
	return Number.isNaN(timestamp) ? null : timestamp;
}

export function formatThoughtDuration(
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
