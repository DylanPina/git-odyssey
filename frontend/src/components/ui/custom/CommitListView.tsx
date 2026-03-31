import { useEffect, useMemo, useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { CommitSummaryButton } from "@/components/ui/custom/CommitSummaryButton";
import { LoadingOverlay } from "@/components/ui/custom/LoadingOverlay";
import { EmptyState } from "@/components/ui/empty-state";
import { useClipboardToast } from "@/hooks/useClipboardToast";
import {
	formatCommitRelativeTime,
	formatCommitTimestamp,
	getCommitAuthorLabel,
	getCommitDate,
	getCommitSubject,
} from "@/lib/commitPresentation";
import type { Commit } from "@/lib/definitions/repo";
import { buildReviewRoute } from "@/lib/repoPaths";

type CommitListViewProps = {
	commits: Commit[];
	repoPath?: string | null;
	focusedCommitSha: string | null;
	isLoading: boolean;
	isIngesting: boolean;
	ingestStatus: string;
	onCommitSummaryUpdate: (commitSha: string, summary: string) => void;
};

export function CommitListView({
	commits,
	repoPath,
	focusedCommitSha,
	isLoading,
	isIngesting,
	ingestStatus,
	onCommitSummaryUpdate,
}: CommitListViewProps) {
	const navigate = useNavigate();
	const rowRefs = useRef<Record<string, HTMLElement | null>>({});
	const copyToClipboard = useClipboardToast();

	const sortedCommits = useMemo(
		() =>
			[...commits].sort((left, right) => {
				const timeDifference = (right.time || 0) - (left.time || 0);
				if (timeDifference !== 0) {
					return timeDifference;
				}

				return left.sha.localeCompare(right.sha);
			}),
		[commits],
	);

	useEffect(() => {
		if (!focusedCommitSha) {
			return;
		}

		rowRefs.current[focusedCommitSha]?.scrollIntoView({
			behavior: "smooth",
			block: "nearest",
		});
	}, [focusedCommitSha, sortedCommits]);

	return (
		<div className="relative h-full">
			<div className="workspace-scrollbar h-full overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
				{sortedCommits.length === 0 ? (
					<div className="flex min-h-full items-center justify-center py-8">
						<EmptyState
							title="No commits found"
							description="Try clearing filters or searching with a broader phrase to bring matching commits back into view."
							className="max-w-md items-center text-center"
						/>
					</div>
				) : (
					<div className="space-y-3">
						{sortedCommits.map((commit) => {
							const subject = getCommitSubject(commit.message);
							const shortSha = commit.sha.slice(0, 7);
							const authorLabel = getCommitAuthorLabel(commit.author);
							const relativeTimeLabel = formatCommitRelativeTime(commit.time);
							const exactTimeLabel = formatCommitTimestamp(commit.time, {
								second: "2-digit",
								timeZoneName: "short",
							});
							const commitDate = getCommitDate(commit.time);
							const effectiveRepoPath = repoPath ?? commit.repo_path;
							const isSelected = focusedCommitSha === commit.sha;
							const handleOpenCommit = () => {
								navigate(
									buildReviewRoute(effectiveRepoPath, {
										mode: "commit",
										commitSha: commit.sha,
									}),
								);
							};

							return (
								<article
									key={commit.sha}
									ref={(node) => {
										rowRefs.current[commit.sha] = node;
									}}
									role="link"
									tabIndex={0}
									data-selected={isSelected}
									aria-label={
										subject
											? `Open commit ${shortSha}: ${subject}`
											: `Open commit ${shortSha}`
									}
									onClick={handleOpenCommit}
									onKeyDown={(event) => {
										if (event.target !== event.currentTarget) {
											return;
										}

										if (event.key === "Enter") {
											event.preventDefault();
											handleOpenCommit();
										}
									}}
									className="workspace-panel commit-list-row group scroll-mt-4 cursor-pointer px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
								>
									<div className="flex items-center gap-3">
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-3">
												<span className="-ml-1 inline-flex items-center">
													<CommitSummaryButton
														sha={commit.sha}
														summary={commit.summary}
														onUpdateSummary={onCommitSummaryUpdate}
														compact
													/>
												</span>
												<div className="line-clamp-2 text-sm font-semibold leading-5 text-text-primary sm:text-[15px]">
													{subject || `Commit ${shortSha}`}
												</div>
											</div>

											<div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
												<div className="commit-list-meta min-w-0 flex flex-1 flex-wrap items-center text-xs leading-5 text-text-secondary">
													<div className="inline-flex shrink-0 items-center gap-1">
														<button
															type="button"
															className="rounded-sm font-mono font-bold tabular-nums text-[12px] transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:text-text-primary"
															title={commit.sha}
															aria-label={`Copy commit SHA ${commit.sha}`}
															onMouseDown={(event) => event.stopPropagation()}
															onClick={(event) => {
																event.stopPropagation();
																void copyToClipboard(commit.sha, "SHA");
															}}
														>
															{shortSha}
														</button>
													</div>
													<span className="truncate" title={authorLabel}>
														{authorLabel}
													</span>
													<span className="text-text-tertiary">committed</span>
													{commitDate ? (
														<time
															dateTime={commitDate.toISOString()}
															title={exactTimeLabel}
														>
															{relativeTimeLabel}
														</time>
													) : (
														<span title={exactTimeLabel}>
															{relativeTimeLabel}
														</span>
													)}
												</div>
											</div>
										</div>

										<span className="inline-flex shrink-0 self-center">
											<ArrowUpRight
												aria-hidden="true"
												className="commit-list-open-icon size-4"
											/>
										</span>
									</div>
								</article>
							);
						})}
					</div>
				)}
			</div>

			<LoadingOverlay
				isVisible={isLoading || isIngesting}
				isIngesting={isIngesting}
				ingestStatus={ingestStatus}
			/>
		</div>
	);
}
