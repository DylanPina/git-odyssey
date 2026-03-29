import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/custom/DatePicker";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineBanner } from "@/components/ui/inline-banner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { formatShortSha } from "@/lib/commitPresentation";
import type { ReviewHistoryEntry } from "@/lib/definitions/review";
import { cn } from "@/lib/utils";
import {
	REVIEW_HISTORY_OUTCOME_OPTIONS,
	REVIEW_HISTORY_SEVERITY_OPTIONS,
} from "@/pages/review/review-constants";
import {
	formatGeneratedAt,
	getFindingCountLabel,
	getHistoryOutcomeTone,
	getSeverityCountEntries,
} from "@/pages/review/review-formatters";
import type { UseReviewHistoryFiltersResult } from "@/pages/review/useReviewHistoryFilters";

type PreviousReviewsSectionProps = {
	reviewHistory: ReviewHistoryEntry[];
	filteredReviewHistory: ReviewHistoryEntry[];
	filters: UseReviewHistoryFiltersResult;
	isViewingHistory: boolean;
	isPreviousReviewsOpen: boolean;
	onTogglePreviousReviews: () => void;
	onReturnToLatestReview: () => void;
	selectedHistoryRunId?: string | null;
	historySelectionLoadingRunId: string | null;
	historyError: string | null;
	isHistoryLoading: boolean;
	onSelectHistoryReview: (entry: ReviewHistoryEntry) => void;
};

export function PreviousReviewsSection({
	reviewHistory,
	filteredReviewHistory,
	filters,
	isViewingHistory,
	isPreviousReviewsOpen,
	onTogglePreviousReviews,
	onReturnToLatestReview,
	selectedHistoryRunId,
	historySelectionLoadingRunId,
	historyError,
	isHistoryLoading,
	onSelectHistoryReview,
}: PreviousReviewsSectionProps) {
	return (
		<section className="rounded-[20px] border border-border-strong bg-[linear-gradient(180deg,rgba(255,255,255,0.038),rgba(255,255,255,0.018))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
			<div className="flex flex-col gap-3">
				<div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
					<div className="min-w-0">
						<div className="text-sm font-semibold text-text-primary">
							Previous Reviews
						</div>
						<div className="mt-1 text-sm text-text-secondary">
							{reviewHistory.length === 0
								? "Completed successful reviews for this branch pair will appear here."
								: `Showing ${filteredReviewHistory.length} of ${reviewHistory.length} previous review${reviewHistory.length === 1 ? "" : "s"}.`}
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						{isViewingHistory ? (
							<Button
								variant="toolbar"
								size="sm"
								className="self-start"
								onClick={onReturnToLatestReview}
							>
								Return to Latest Review
							</Button>
						) : null}
						{filters.hasActiveHistoryFilters ? (
							<Button
								variant="toolbar"
								size="sm"
								className="self-start"
								onClick={filters.resetHistoryFilters}
							>
								Clear filters
							</Button>
						) : null}
						<Button
							variant="toolbar"
							size="toolbar-icon"
							onClick={onTogglePreviousReviews}
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
									value={filters.historySearchQuery}
									onChange={(event) =>
										filters.setHistorySearchQuery(event.target.value)
									}
									placeholder="Search ids, refs, SHAs, timestamps, or review metadata"
								/>
							</label>

							<label className="flex min-w-0 flex-col gap-1.5">
								<Label className="text-sm text-text-secondary">Outcome</Label>
								<Select
									value={filters.historyOutcomeFilter}
									onValueChange={(value) =>
										filters.setHistoryOutcomeFilter(
											value as typeof filters.historyOutcomeFilter,
										)
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
									value={filters.historySeverityFilter}
									onValueChange={(value) =>
										filters.setHistorySeverityFilter(
											value as typeof filters.historySeverityFilter,
										)
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
								value={filters.historyStartDate}
								onChange={filters.setHistoryStartDate}
								id="review-history-start-date"
								placeholder="Start date"
							/>

							<DatePicker
								label="Generated Before"
								value={filters.historyEndDate}
								onChange={filters.setHistoryEndDate}
								id="review-history-end-date"
								placeholder="End date"
							/>
						</div>

						{historyError ? (
							<InlineBanner tone="danger" title={historyError} />
						) : null}

						<div className="space-y-3">
							{filteredReviewHistory.length > 0 ? (
								filteredReviewHistory.map((entry) => {
									const severityEntries = getSeverityCountEntries(entry);
									const isSelected = selectedHistoryRunId === entry.run_id;
									const isLoading =
										historySelectionLoadingRunId === entry.run_id;

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
											onClick={() => onSelectHistoryReview(entry)}
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
										filters.hasActiveHistoryFilters
											? "No previous reviews match the current filters."
											: isHistoryLoading
												? "Loading previous reviews..."
												: "No previous successful reviews yet."
									}
									description={
										filters.hasActiveHistoryFilters
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
	);
}

export default PreviousReviewsSection;
