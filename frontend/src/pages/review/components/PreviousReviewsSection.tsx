import { Loader2 } from "lucide-react";

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
	onReturnToLatestReview,
	selectedHistoryRunId,
	historySelectionLoadingRunId,
	historyError,
	isHistoryLoading,
	onSelectHistoryReview,
}: PreviousReviewsSectionProps) {
	const reviewCountLabel = `${reviewHistory.length} review${reviewHistory.length === 1 ? "" : "s"}`;
	const filteredCountLabel = `Showing ${filteredReviewHistory.length} of ${reviewHistory.length}`;

	return (
		<div className="flex max-h-[inherit] min-h-0 flex-col">
			<div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<div className="text-sm font-semibold text-text-primary">
							Reviews
						</div>
						<span className="rounded-full border border-border-subtle bg-[rgba(255,255,255,0.03)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-tertiary">
							{reviewCountLabel}
						</span>
						{filters.hasActiveHistoryFilters ? (
							<span className="rounded-full border border-[rgba(122,162,255,0.2)] bg-[rgba(122,162,255,0.08)] px-2 py-0.5 text-[11px] text-text-secondary">
								{filteredCountLabel}
							</span>
						) : null}
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-1.5">
					{isViewingHistory ? (
						<Button
							variant="toolbar"
							size="sm"
							className="h-8 px-3 text-[11px]"
							onClick={onReturnToLatestReview}
						>
							Return to Latest
						</Button>
					) : null}
					{filters.hasActiveHistoryFilters ? (
						<Button
							variant="toolbar"
							size="sm"
							className="h-8 px-3 text-[11px]"
							onClick={filters.resetHistoryFilters}
						>
							Clear Filters
						</Button>
					) : null}
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-hidden px-4 py-3">
				<div className="flex h-full min-h-0 flex-col gap-3">
					<div className="grid shrink-0 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
						<label className="flex min-w-0 flex-col gap-1 sm:col-span-2 lg:col-span-3 xl:col-span-2">
							<Label className="text-xs text-text-secondary">Search</Label>
							<Input
								value={filters.historySearchQuery}
								onChange={(event) =>
									filters.setHistorySearchQuery(event.target.value)
								}
								placeholder="Search ids, refs, SHAs, timestamps, or metadata"
								className="h-9"
							/>
						</label>

						<label className="flex min-w-0 flex-col gap-1">
							<Label className="text-xs text-text-secondary">Outcome</Label>
							<Select
								value={filters.historyOutcomeFilter}
								onValueChange={(value) =>
									filters.setHistoryOutcomeFilter(
										value as typeof filters.historyOutcomeFilter,
									)
								}
							>
								<SelectTrigger className="h-9">
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

						<label className="flex min-w-0 flex-col gap-1">
							<Label className="text-xs text-text-secondary">Severity</Label>
							<Select
								value={filters.historySeverityFilter}
								onValueChange={(value) =>
									filters.setHistorySeverityFilter(
										value as typeof filters.historySeverityFilter,
									)
								}
							>
								<SelectTrigger className="h-9">
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

					<div className="workspace-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
						<div className="space-y-2">
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
												"w-full cursor-pointer rounded-[16px] border px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-wait disabled:opacity-100",
												isSelected
													? "border-[rgba(122,162,255,0.34)] bg-[rgba(122,162,255,0.08)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_0_1px_rgba(122,162,255,0.1)] hover:border-[rgba(122,162,255,0.44)] hover:bg-[rgba(122,162,255,0.1)]"
													: "border-border-subtle bg-[rgba(255,255,255,0.022)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] hover:border-border-strong hover:bg-[rgba(255,255,255,0.036)]",
											)}
											disabled={isLoading}
											onClick={() => onSelectHistoryReview(entry)}
											aria-pressed={isSelected}
											aria-label={`Load previous review ${entry.run_id}`}
										>
											<div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
												<div className="min-w-0 flex-1">
													<div className="flex flex-wrap items-center gap-1.5">
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

													<div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-text-secondary">
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

												<div className="flex shrink-0 items-center gap-2 text-[11px] text-text-secondary">
													{isLoading ? (
														<Loader2 className="size-3.5 animate-spin" />
													) : null}
													<span>
														Completed {formatGeneratedAt(entry.completed_at)}
													</span>
												</div>
											</div>

											<p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm leading-5 text-text-secondary">
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
									className="items-center py-4 text-center"
								/>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export default PreviousReviewsSection;
