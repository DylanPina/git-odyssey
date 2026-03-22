import { useCallback, useMemo, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";

import {
	DiffWorkspace,
	type DiffWorkspaceHandle,
} from "@/components/ui/custom/DiffWorkspace";
import { CommitToolbar } from "@/components/ui/custom/CommitToolbar";
import { useCommitDetails } from "@/hooks/useCommitDetails";
import { buildRepoRoute, readRepoPathFromSearchParams } from "@/lib/repoPaths";

function getCommitMessageParts(message?: string | null) {
	const lines = (message || "")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

	return {
		subject: lines[0] || null,
		body: lines.slice(1).join(" ") || null,
	};
}

export function Commit() {
	const { commitSha } = useParams();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const repoPath = readRepoPathFromSearchParams(searchParams);
	const diffWorkspaceRef = useRef<DiffWorkspaceHandle | null>(null);

	const shortSha = useMemo(
		() => (commitSha ? commitSha.slice(0, 8) : ""),
		[commitSha],
	);

	const {
		isLoading,
		error,
		commit: targetCommit,
		fileSummaries,
		summaryOpen,
		setSummaryOpen,
		hunkSummaries,
		hunkSummaryOpen,
		setHunkSummaryOpen,
		handleSummarizeFile,
		handleSummarizeHunk,
	} = useCommitDetails({ repoPath, commitSha });

	const pageError = !repoPath ? "No Git project path was provided." : error;
	const allFiles = targetCommit?.file_changes || [];
	const { subject: commitSubject, body: commitBody } = useMemo(
		() => getCommitMessageParts(targetCommit?.message),
		[targetCommit?.message],
	);
	const commitTitle =
		commitSubject ||
		(targetCommit?.sha ? `Commit ${targetCommit.sha.slice(0, 12)}` : "Commit");
	const fullSha = targetCommit?.sha || shortSha || "Unknown commit";
	const authorLabel = targetCommit?.author || "Unknown author";
	const formattedTime = useMemo(
		() =>
			targetCommit?.time
				? new Date(targetCommit.time * 1000).toLocaleString(undefined, {
						month: "short",
						day: "numeric",
						year: "numeric",
						hour: "numeric",
						minute: "2-digit",
					})
				: "Unknown date",
		[targetCommit?.time],
	);

	const copyToClipboard = useCallback(async (text: string, type: string) => {
		try {
			await navigator.clipboard.writeText(text);
			toast.success(`${type} copied to clipboard`, {
				position: "top-right",
				autoClose: 1800,
				theme: "dark",
			});
		} catch (clipboardError) {
			console.error("Failed to copy text:", clipboardError);
			toast.error(`Failed to copy ${type.toLowerCase()}`, {
				position: "top-right",
				autoClose: 2600,
				theme: "dark",
			});
		}
	}, []);

	const topContent = targetCommit ? (
		<div className="rounded-[22px] border border-border-strong bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-4">
			<div className="flex flex-col items-start gap-3">
				<div className="w-full max-w-5xl space-y-2">
					<div className="line-clamp-1 text-base font-semibold leading-tight text-text-primary sm:text-lg">
						{commitTitle}
					</div>
					{commitBody ? (
						<div className="line-clamp-2 text-sm leading-6 text-text-secondary">
							{commitBody}
						</div>
					) : null}
					<div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
						<button
							type="button"
							className="rounded-full border border-border-subtle bg-control px-2.5 py-1 text-left text-text-primary transition-[background-color,border-color,color,box-shadow] duration-150 hover:border-border-strong hover:bg-control-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
							title={fullSha}
							onClick={() => void copyToClipboard(fullSha, "Commit hash")}
						>
							<span className="text-text-tertiary">Commit:</span>{" "}
							<span className="font-mono text-[11px]">{fullSha}</span>
						</button>
						<button
							type="button"
							className="rounded-full border border-border-subtle bg-control px-2.5 py-1 text-left text-text-primary transition-[background-color,border-color,color,box-shadow] duration-150 hover:border-border-strong hover:bg-control-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
							title={authorLabel}
							onClick={() => void copyToClipboard(authorLabel, "Author")}
						>
							<span className="text-text-tertiary">Author:</span>{" "}
							<span>{authorLabel}</span>
						</button>
						<button
							type="button"
							className="rounded-full border border-border-subtle bg-control px-2.5 py-1 text-left text-text-primary transition-[background-color,border-color,color,box-shadow] duration-150 hover:border-border-strong hover:bg-control-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
							title={formattedTime}
							onClick={() => void copyToClipboard(formattedTime, "Date")}
						>
							<span className="text-text-tertiary">Date:</span>{" "}
							<span>{formattedTime}</span>
						</button>
					</div>
				</div>
			</div>
		</div>
	) : null;

	return (
		<div className="workspace-shell">
			<div className="flex h-screen flex-col overflow-hidden">
				<div className="px-4 pt-4">
					<CommitToolbar
						repoPath={repoPath}
						shortSha={shortSha}
						onExit={() => navigate(repoPath ? buildRepoRoute(repoPath) : "/")}
						onCollapseAll={
							allFiles.length > 0
								? () => diffWorkspaceRef.current?.collapseAll()
								: undefined
						}
					/>
				</div>

				<div className="min-h-0 flex-1 px-4 pb-4 pt-4">
					<DiffWorkspace
						ref={diffWorkspaceRef}
						repoPath={repoPath ?? targetCommit?.repo_path}
						viewerId={targetCommit?.sha ?? commitSha ?? "commit"}
						files={allFiles}
						isLoading={Boolean(isLoading)}
						error={pageError}
						topContent={topContent}
						searchInputId="commit-search-input"
						emptyTitle="No file changes in this commit."
						emptyDescription="This commit does not contain diffable file content."
						summaryActions={
							targetCommit
								? {
										fileSummaries,
										summaryOpen,
										onToggleFileSummary: (summaryKey) =>
											setSummaryOpen((prev) => ({
												...prev,
												[summaryKey]: !(prev[summaryKey] ?? false),
											})),
										onSummarizeFile: handleSummarizeFile,
										hunkSummaries,
										hunkSummaryOpen,
										onToggleHunkSummary: (hunkKey) =>
											setHunkSummaryOpen((prev) => ({
												...prev,
												[hunkKey]: !(prev[hunkKey] ?? false),
											})),
										onSummarizeHunk: handleSummarizeHunk,
									}
								: undefined
						}
					/>
				</div>
			</div>
		</div>
	);
}
