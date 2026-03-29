import { formatDistanceToNow } from "date-fns";

import type { Commit } from "@/lib/definitions/repo";

export function splitCommitMessage(message?: string | null) {
	const lines = (message || "")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

	return {
		subject: lines[0] || null,
		body: lines.slice(1).join(" ") || null,
	};
}

export function getCommitSubject(message?: string | null) {
	return splitCommitMessage(message).subject;
}

export function getCommitDate(timestamp?: number | null) {
	if (typeof timestamp !== "number") {
		return null;
	}

	const parsed = new Date(timestamp * 1000);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatCommitTimestamp(
	timestamp?: number | null,
	options?: Intl.DateTimeFormatOptions,
	fallback = "Unknown date",
) {
	const commitDate = getCommitDate(timestamp);
	if (!commitDate) {
		return fallback;
	}

	return commitDate.toLocaleString(
		undefined,
		options ?? {
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "numeric",
			minute: "2-digit",
		},
	);
}

export function formatCommitRelativeTime(
	timestamp?: number | null,
	fallback = "Unknown date",
) {
	const commitDate = getCommitDate(timestamp);
	if (!commitDate) {
		return fallback;
	}

	return formatDistanceToNow(commitDate, { addSuffix: true });
}

export function formatShortSha(
	value?: string | null,
	length = 8,
	fallback = "Unavailable",
) {
	return value ? value.slice(0, length) : fallback;
}

export function getCommitAuthorLabel(author?: string | null) {
	return author || "Unknown author";
}

export function getCommitTitle(
	commit?: Pick<Commit, "sha" | "message"> | null,
	fallback = "Commit",
) {
	const subject = getCommitSubject(commit?.message);
	if (subject) {
		return subject;
	}

	return commit?.sha ? `Commit ${formatShortSha(commit.sha, 12, "Unknown")}` : fallback;
}
