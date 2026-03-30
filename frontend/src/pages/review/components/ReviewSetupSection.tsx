import { ChevronDown, ChevronRight, GitCommitHorizontal } from "lucide-react";

import { InlineBanner } from "@/components/ui/inline-banner";
import { Textarea } from "@/components/ui/textarea";
import type {
	ReviewApproval,
	ReviewApprovalDecision,
} from "@/lib/definitions/review";
import type { Commit } from "@/lib/definitions/repo";
import {
	formatGeneratedAt,
} from "@/pages/review/review-formatters";
import { PendingApprovals } from "@/pages/review/components/PendingApprovals";
import {
	formatShortSha,
	formatCommitTimestamp,
	getCommitAuthorLabel,
	getCommitSubject,
} from "@/lib/commitPresentation";

type ReviewMetaItem = {
	label: string;
	value: string;
	isMono?: boolean;
};

type ReviewSetupSectionProps = {
	repoPath?: string | null;
	branchOptions: string[];
	baseRef: string;
	headRef: string;
	compareMetadata: ReviewMetaItem[];
	isViewingHistory: boolean;
	baseTipCommit: Commit | null;
	headTipCommit: Commit | null;
	isRepoLoading: boolean;
	customInstructions: string;
	onCustomInstructionsChange: (value: string) => void;
	isReviewSetupOpen: boolean;
	onToggleReviewSetup: () => void;
	repoError: string | null;
	sessionError: string | null;
	runError: string | null;
	historySelectionError: string | null;
	isHistorySelectionLoading: boolean;
	pendingApprovals: ReviewApproval[];
	approvalLoadingById: Record<string, boolean>;
	onApprovalDecision: (
		approval: ReviewApproval,
		decision: ReviewApprovalDecision,
	) => void;
	reviewGeneratedAt?: string | null;
};

function ReviewMetaPill({
	label,
	value,
	isMono = true,
}: {
	label: string;
	value: string;
	isMono?: boolean;
}) {
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
}: {
	label: string;
	branchName: string;
	commit: Commit | null;
	isLoading: boolean;
}) {
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
							<span>{getCommitAuthorLabel(commit.author)}</span>
							<span>{formatCommitTimestamp(commit.time)}</span>
						</div>
					</div>
				</div>
			)}
		</section>
	);
}

export function ReviewSetupSection({
	repoPath,
	branchOptions,
	baseRef,
	headRef,
	compareMetadata,
	isViewingHistory,
	baseTipCommit,
	headTipCommit,
	isRepoLoading,
	customInstructions,
	onCustomInstructionsChange,
	isReviewSetupOpen,
	onToggleReviewSetup,
	repoError,
	sessionError,
	runError,
	historySelectionError,
	isHistorySelectionLoading,
	pendingApprovals,
	approvalLoadingById,
	onApprovalDecision,
	reviewGeneratedAt,
}: ReviewSetupSectionProps) {
	return (
		<div className="space-y-3">
			<div className="rounded-[20px] border border-border-strong bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
						<div className="min-w-0 flex-1">
							<div className="workspace-section-label">Review Setup</div>
							<div className="mt-1 text-sm text-text-secondary">
								Choose the compare target and run or manage the Codex review.
							</div>
						</div>

						<button
							type="button"
							className="inline-flex items-center justify-center self-start rounded-[var(--radius-control)] border border-border-subtle bg-transparent p-2 text-text-secondary transition-[background-color,border-color,color,box-shadow] duration-150 hover:border-border-strong hover:bg-control hover:text-text-primary focus-visible:ring-2 focus-visible:ring-focus-ring xl:self-auto"
							onClick={onToggleReviewSetup}
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
						</button>
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
								{reviewGeneratedAt ? (
									<ReviewMetaPill
										label="Generated"
										value={formatGeneratedAt(reviewGeneratedAt)}
										isMono={false}
									/>
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
									onChange={(event) =>
										onCustomInstructionsChange(event.target.value)
									}
									placeholder="Optional: steer Codex toward specific areas of concern."
									className="min-h-24"
									disabled={isViewingHistory || isHistorySelectionLoading}
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
					onDecision={onApprovalDecision}
				/>
			) : null}
		</div>
	);
}

export default ReviewSetupSection;
