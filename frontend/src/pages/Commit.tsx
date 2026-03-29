import { useMemo } from "react";
import { GitCommitHorizontal } from "lucide-react";
import { useParams, useSearchParams } from "react-router-dom";

import {
	DiffWorkspace,
} from "@/components/ui/custom/DiffWorkspace";
import { DiffWorkspaceHeader } from "@/components/ui/custom/DiffWorkspaceHeader";
import { DiffWorkspacePage } from "@/components/ui/custom/DiffWorkspacePage";
import { useCommitDetails } from "@/hooks/useCommitDetails";
import {
	formatCommitTimestamp,
	formatShortSha,
	getCommitAuthorLabel,
	getCommitTitle,
	splitCommitMessage,
} from "@/lib/commitPresentation";
import {
	readCommitSearchContextFromSearchParams,
	readRepoPathFromSearchParams,
} from "@/lib/repoPaths";
import { CommitHeroCard } from "@/pages/commit/CommitHeroCard";

export function Commit() {
	const { commitSha } = useParams();
	const [searchParams] = useSearchParams();
	const repoPath = readRepoPathFromSearchParams(searchParams);
	const commitSearchContext = readCommitSearchContextFromSearchParams(searchParams);

	const shortSha = useMemo(
		() => formatShortSha(commitSha, 8, ""),
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
	const { body: commitBody } = useMemo(
		() => splitCommitMessage(targetCommit?.message),
		[targetCommit?.message],
	);
	const commitTitle = getCommitTitle(targetCommit);
	const fullSha = targetCommit?.sha || shortSha || "Unknown commit";
	const compactSha = fullSha !== "Unknown commit" ? formatShortSha(fullSha) : null;
	const authorLabel = getCommitAuthorLabel(targetCommit?.author);
	const formattedTime = useMemo(
		() => formatCommitTimestamp(targetCommit?.time),
		[targetCommit?.time],
	);

	const pageTopContent = targetCommit ? (
		<CommitHeroCard
			title={commitTitle}
			body={commitBody}
			fullSha={fullSha}
			authorLabel={authorLabel}
			formattedTime={formattedTime}
		/>
	) : null;

	const changedFilesLabel = targetCommit
		? `${allFiles.length} file${allFiles.length === 1 ? "" : "s"} changed`
		: isLoading
			? "Loading commit diff"
			: "Commit diff";
	const workspaceTopContent = (
		<DiffWorkspaceHeader
			icon={<GitCommitHorizontal className="size-4 text-text-secondary" />}
			title={changedFilesLabel}
			titleMeta={
				compactSha ? (
					<span className="font-mono text-[11px] text-text-secondary">
						{compactSha}
					</span>
				) : null
			}
			subtitle={
				<>
					<span className="truncate text-text-primary">{commitTitle}</span>
					<span>{authorLabel}</span>
					<span>{formattedTime}</span>
				</>
			}
		/>
	);

	return (
		<DiffWorkspacePage
			topSections={[pageTopContent]}
			workspace={
				<DiffWorkspace
					repoPath={repoPath ?? targetCommit?.repo_path}
					viewerId={targetCommit?.sha ?? commitSha ?? "commit"}
					files={allFiles}
					isLoading={Boolean(isLoading)}
					error={pageError}
					topContent={workspaceTopContent}
					fileSearchInputId="commit-file-search-input"
					codeSearchInputId="commit-code-search-input"
					emptyTitle="No file changes in this commit."
					emptyDescription="This commit does not contain diffable file content."
					chromeDensity="compact"
					searchContext={commitSearchContext}
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
			}
		/>
	);
}
