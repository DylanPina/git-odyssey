import * as React from "react";
import {
	ArrowRight,
	Check,
	CheckIcon,
	ChevronDown,
	ChevronUp,
	ChevronsUpDownIcon,
	FileText,
	GitCommitHorizontal,
	Loader2,
	Pencil,
	Play,
	Plus,
	ScrollText,
	Square,
	Trash2,
	X,
} from "lucide-react";

import {
	getDesktopAdditionalReviewGuidelines,
	saveDesktopAdditionalReviewGuidelines,
} from "@/api/api";
import { Button } from "@/components/ui/button";
import { InlineBanner } from "@/components/ui/inline-banner";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PreviousReviewsSection } from "@/pages/review/components/PreviousReviewsSection";
import {
	clearLegacyStoredAdditionalReviewGuidelinesForRepo,
	getLegacyStoredAdditionalReviewGuidelinesForRepo,
} from "@/pages/review/review-storage";
import type { ReviewHistoryEntry } from "@/lib/definitions/review";
import type { UseReviewHistoryFiltersResult } from "@/pages/review/useReviewHistoryFilters";

type SavedReviewGuidelineItem = {
	id: string;
	source: "App-wide" | "Repo-specific";
	text: string;
};

type AdditionalReviewGuidelineItem = {
	id: string;
	text: string;
};

const SAVED_GUIDELINE_PREVIEW_LENGTH = 96;

function createGuidelineItemId() {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}

	return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function splitGuidelineLines(value: string): string[] {
	return value
		.split(/\r?\n/g)
		.map((line) => line.trim())
		.filter(Boolean);
}

function buildSavedGuidelineItems(savedGuidelines: {
	appWide: string;
	repoSpecific: string;
}): SavedReviewGuidelineItem[] {
	return [
		...splitGuidelineLines(savedGuidelines.appWide).map((text, index) => ({
			id: `app-${index}`,
			source: "App-wide" as const,
			text,
		})),
		...splitGuidelineLines(savedGuidelines.repoSpecific).map((text, index) => ({
			id: `repo-${index}`,
			source: "Repo-specific" as const,
			text,
		})),
	];
}

function buildSavedGuidelinePreview(text: string): {
	previewText: string;
	isExpandable: boolean;
} {
	const normalized = text.trim();
	if (normalized.length <= SAVED_GUIDELINE_PREVIEW_LENGTH) {
		return {
			previewText: normalized,
			isExpandable: false,
		};
	}

	return {
		previewText: `${normalized
			.slice(0, SAVED_GUIDELINE_PREVIEW_LENGTH)
			.trimEnd()}...`,
		isExpandable: true,
	};
}

function ReviewTitleBarBranchPicker({
	options,
	value,
	onSelect,
	disabled,
	placeholder,
}: {
	options: string[];
	value: string;
	onSelect: (value: string) => void;
	disabled?: boolean;
	placeholder: string;
}) {
	const [open, setOpen] = React.useState(false);
	const selectedOption = value
		? (options.find((option) => option === value) ?? value)
		: null;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="toolbar"
					size="sm"
					role="combobox"
					aria-expanded={open}
					disabled={disabled}
					className="h-8 min-w-0 max-w-[12rem] justify-between gap-1 rounded-[14px] border-border-subtle bg-[rgba(255,255,255,0.03)] px-3 text-[11px] font-semibold text-text-secondary hover:bg-control"
				>
					<span
						className={cn(
							"min-w-0 flex-1 truncate text-left font-mono",
							selectedOption ? "text-text-primary" : "text-text-tertiary",
						)}
					>
						{selectedOption ?? placeholder}
					</span>
					<ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-70" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-[18rem] max-w-[min(22rem,calc(100vw-2rem))] p-2"
			>
				<Command>
					<CommandInput className="min-w-0" placeholder="Search branch..." />
					<CommandList>
						<CommandEmpty>No branch found.</CommandEmpty>
						<CommandGroup>
							{options.map((option) => (
								<CommandItem
									key={option}
									value={option}
									className="min-w-0"
									onSelect={(currentValue) => {
										setOpen(false);
										onSelect(currentValue === value ? "" : currentValue);
									}}
								>
									<CheckIcon
										className={cn(
											"mr-2 size-4",
											value === option ? "opacity-100" : "opacity-0",
										)}
									/>
									<span className="min-w-0 truncate">{option}</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

type ReviewTitleBarTrailingProps = {
	targetMode: "compare" | "commit";
	branchOptions: string[];
	baseRef: string;
	headRef: string;
	commitSha?: string | null;
	onBaseRefChange: (value: string) => void;
	onHeadRefChange: (value: string) => void;
	isRepoLoading?: boolean;
	canStartReview: boolean;
	canCancelReview: boolean;
	hasCancelableRun: boolean;
	isRunStarting?: boolean;
	isRunCancelling?: boolean;
	reviewHistory: ReviewHistoryEntry[];
	filteredReviewHistory: ReviewHistoryEntry[];
	filters: UseReviewHistoryFiltersResult;
	isViewingHistory: boolean;
	selectedHistoryRunId?: string | null;
	historySelectionLoadingRunId: string | null;
	historyError: string | null;
	isHistoryLoading: boolean;
	onReturnToLatestReview: () => void;
	onSelectHistoryReview: (entry: ReviewHistoryEntry) => void;
	isGuidelinesLoading?: boolean;
	guidelinesError?: string | null;
	savedGuidelines: {
		appWide: string;
		repoSpecific: string;
	};
	repoPath?: string | null;
	appliedInstructions?: string | null;
	onStartReview: (customInstructions: string) => void;
	onCancelReview: () => void;
};

export function ReviewTitleBarTrailing({
	targetMode,
	branchOptions,
	baseRef,
	headRef,
	commitSha = null,
	onBaseRefChange,
	onHeadRefChange,
	isRepoLoading = false,
	canStartReview,
	canCancelReview,
	hasCancelableRun,
	isRunStarting = false,
	isRunCancelling = false,
	reviewHistory,
	filteredReviewHistory,
	filters,
	isViewingHistory,
	selectedHistoryRunId,
	historySelectionLoadingRunId,
	historyError,
	isHistoryLoading,
	onReturnToLatestReview,
	onSelectHistoryReview,
	isGuidelinesLoading = false,
	guidelinesError = null,
	savedGuidelines,
	repoPath = null,
	appliedInstructions = null,
	onStartReview,
	onCancelReview,
}: ReviewTitleBarTrailingProps) {
	const [isPreviousReviewsOpen, setIsPreviousReviewsOpen] =
		React.useState(false);
	const [isGuidelinesOpen, setIsGuidelinesOpen] = React.useState(false);
	const [draftGuideline, setDraftGuideline] = React.useState("");
	const [additionalGuidelines, setAdditionalGuidelines] = React.useState<
		AdditionalReviewGuidelineItem[]
	>([]);
	const [editingGuidelineId, setEditingGuidelineId] = React.useState<
		string | null
	>(null);
	const [editingGuidelineDraft, setEditingGuidelineDraft] = React.useState("");
	const [expandedSavedGuidelineIds, setExpandedSavedGuidelineIds] = React.useState<
		string[]
	>([]);
	const [additionalGuidelinesError, setAdditionalGuidelinesError] =
		React.useState<string | null>(null);
	const [isAdditionalGuidelinesLoading, setIsAdditionalGuidelinesLoading] =
		React.useState(false);
	const shouldShowStartReview = !hasCancelableRun && !isRunStarting;
	const branchSelectionDisabled = branchOptions.length === 0 || isRepoLoading;
	const commitLabel = commitSha ? commitSha.slice(0, 12) : "Unknown commit";
	const savedGuidelineItems = React.useMemo(
		() => buildSavedGuidelineItems(savedGuidelines),
		[savedGuidelines.appWide, savedGuidelines.repoSpecific],
	);
	const serializedAdditionalGuidelines = React.useMemo(
		() =>
			additionalGuidelines
				.map((guideline) => guideline.text.trim())
				.filter(Boolean)
				.join("\n"),
		[additionalGuidelines],
	);
	const appliedGuidanceValue =
		appliedInstructions?.trim() ||
		"This review run used the default GitOdyssey review behavior without saved guidance or additional review guidelines.";
	const hasDraftGuideline = Boolean(draftGuideline.trim());
	const canSaveEditingGuideline = Boolean(editingGuidelineDraft.trim());
	const persistAdditionalGuidelineState = React.useCallback(
		async (
			nextDraftGuideline: string,
			nextGuidelines: AdditionalReviewGuidelineItem[],
		) => {
			if (!repoPath) {
				return;
			}

			try {
				await saveDesktopAdditionalReviewGuidelines({
					repoPath,
					draftGuideline: nextDraftGuideline,
					guidelines: nextGuidelines,
				});
				setAdditionalGuidelinesError(null);
			} catch (error) {
				setAdditionalGuidelinesError(
					error instanceof Error
						? error.message
						: "Failed to persist additional review guidelines.",
				);
			}
		},
		[repoPath],
	);

	React.useEffect(() => {
		let cancelled = false;

		const loadAdditionalGuidelines = async () => {
			setDraftGuideline("");
			setAdditionalGuidelines([]);
			setEditingGuidelineId(null);
			setEditingGuidelineDraft("");
			setExpandedSavedGuidelineIds([]);

			if (!repoPath) {
				setAdditionalGuidelinesError(null);
				setIsAdditionalGuidelinesLoading(false);
				return;
			}

			setIsAdditionalGuidelinesLoading(true);
			setAdditionalGuidelinesError(null);

			try {
				let persistedState =
					await getDesktopAdditionalReviewGuidelines(repoPath);

				if (
					!persistedState.draftGuideline.trimEnd() &&
					persistedState.guidelines.length === 0
				) {
					const legacyState =
						getLegacyStoredAdditionalReviewGuidelinesForRepo(repoPath);
					if (
						legacyState.draftGuideline.trimEnd() ||
						legacyState.guidelines.length > 0
					) {
						persistedState = await saveDesktopAdditionalReviewGuidelines({
							repoPath,
							draftGuideline: legacyState.draftGuideline,
							guidelines: legacyState.guidelines,
						});
						clearLegacyStoredAdditionalReviewGuidelinesForRepo(repoPath);
					}
				}

				if (cancelled) {
					return;
				}

				setDraftGuideline(persistedState.draftGuideline);
				setAdditionalGuidelines(persistedState.guidelines);
				setAdditionalGuidelinesError(null);
			} catch (error) {
				if (cancelled) {
					return;
				}

				setDraftGuideline("");
				setAdditionalGuidelines([]);
				setAdditionalGuidelinesError(
					error instanceof Error
						? error.message
						: "Failed to load additional review guidelines.",
				);
			} finally {
				if (!cancelled) {
					setIsAdditionalGuidelinesLoading(false);
				}
			}
		};

		void loadAdditionalGuidelines();

		return () => {
			cancelled = true;
		};
	}, [repoPath]);

	const handleAddGuideline = React.useCallback(() => {
		const nextGuideline = draftGuideline.trim();
		if (!nextGuideline) {
			return;
		}

		const nextGuidelines = [
			...additionalGuidelines,
			{
				id: createGuidelineItemId(),
				text: nextGuideline,
			},
		];

		setAdditionalGuidelines(nextGuidelines);
		setDraftGuideline("");
		void persistAdditionalGuidelineState("", nextGuidelines);
	}, [additionalGuidelines, draftGuideline, persistAdditionalGuidelineState]);

	const handleDraftGuidelineChange = React.useCallback(
		(nextDraftGuideline: string) => {
			setDraftGuideline(nextDraftGuideline);
			void persistAdditionalGuidelineState(
				nextDraftGuideline,
				additionalGuidelines,
			);
		},
		[additionalGuidelines, persistAdditionalGuidelineState],
	);

	const handleDraftGuidelineKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (
				event.key !== "Enter" ||
				event.shiftKey ||
				event.nativeEvent.isComposing
			) {
				return;
			}

			event.preventDefault();
			handleAddGuideline();
		},
		[handleAddGuideline],
	);

	const handleStartEditingGuideline = React.useCallback(
		(guideline: AdditionalReviewGuidelineItem) => {
			setEditingGuidelineId(guideline.id);
			setEditingGuidelineDraft(guideline.text);
		},
		[],
	);

	const handleCancelEditingGuideline = React.useCallback(() => {
		setEditingGuidelineId(null);
		setEditingGuidelineDraft("");
	}, []);

	const handleSaveEditingGuideline = React.useCallback(() => {
		const nextGuideline = editingGuidelineDraft.trim();
		if (!editingGuidelineId || !nextGuideline) {
			return;
		}

		const nextGuidelines = additionalGuidelines.map((guideline) =>
			guideline.id === editingGuidelineId
				? {
						...guideline,
						text: nextGuideline,
					}
				: guideline,
		);
		setAdditionalGuidelines(nextGuidelines);
		setEditingGuidelineId(null);
		setEditingGuidelineDraft("");
		void persistAdditionalGuidelineState(draftGuideline, nextGuidelines);
	}, [
		additionalGuidelines,
		draftGuideline,
		editingGuidelineDraft,
		editingGuidelineId,
		persistAdditionalGuidelineState,
	]);

	const handleRemoveGuideline = React.useCallback(
		(guidelineId: string) => {
			const nextGuidelines = additionalGuidelines.filter(
				(guideline) => guideline.id !== guidelineId,
			);

			setAdditionalGuidelines(nextGuidelines);
			if (editingGuidelineId === guidelineId) {
				setEditingGuidelineId(null);
				setEditingGuidelineDraft("");
			}
			void persistAdditionalGuidelineState(draftGuideline, nextGuidelines);
		},
		[
			additionalGuidelines,
			draftGuideline,
			editingGuidelineId,
			persistAdditionalGuidelineState,
		],
	);

	const handleToggleSavedGuideline = React.useCallback((guidelineId: string) => {
		setExpandedSavedGuidelineIds((current) =>
			current.includes(guidelineId)
				? current.filter((id) => id !== guidelineId)
				: [...current, guidelineId],
		);
	}, []);

	return (
		<div className="flex min-w-0 items-center gap-2">
			{reviewHistory.length > 0 ? (
				<Popover
					open={isPreviousReviewsOpen}
					onOpenChange={setIsPreviousReviewsOpen}
				>
					<PopoverTrigger asChild>
						<Button
							variant="toolbar"
							size="sm"
							className="h-8 gap-2 rounded-[14px] border-border-subtle bg-[rgba(255,255,255,0.03)] px-3 text-[11px] font-semibold text-text-secondary hover:bg-control"
						>
							<ScrollText className="size-3.5" />
							<span>Reviews</span>
							<span className="rounded-full border border-border-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary">
								{reviewHistory.length}
							</span>
						</Button>
					</PopoverTrigger>
					<PopoverContent
						align="end"
						sideOffset={10}
						className="max-h-[min(70vh,32rem)] w-[52rem] max-w-[min(52rem,calc(100vw-2rem))] overflow-hidden p-0"
					>
						<PreviousReviewsSection
							reviewHistory={reviewHistory}
							filteredReviewHistory={filteredReviewHistory}
							filters={filters}
							isViewingHistory={isViewingHistory}
							onReturnToLatestReview={() => {
								onReturnToLatestReview();
								setIsPreviousReviewsOpen(false);
							}}
							selectedHistoryRunId={selectedHistoryRunId}
							historySelectionLoadingRunId={historySelectionLoadingRunId}
							historyError={historyError}
							isHistoryLoading={isHistoryLoading}
							onSelectHistoryReview={(entry) => {
								onSelectHistoryReview(entry);
								setIsPreviousReviewsOpen(false);
							}}
						/>
					</PopoverContent>
				</Popover>
			) : null}

			<Popover open={isGuidelinesOpen} onOpenChange={setIsGuidelinesOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="toolbar"
						size="sm"
						className="h-8 gap-2 rounded-[14px] border-border-subtle bg-[rgba(255,255,255,0.03)] px-3 text-[11px] font-semibold text-text-secondary hover:bg-control"
					>
						<FileText className="size-3.5" />
						<span>Guidelines</span>
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="end"
					sideOffset={10}
					className="w-[30rem] max-w-[min(30rem,calc(100vw-2rem))] space-y-4 p-4"
				>
					<div className="space-y-1">
						<div className="text-sm font-medium text-text-primary">
							Review Guidelines
						</div>
						{isViewingHistory ? (
							<p className="text-xs leading-5 text-text-tertiary">
								Viewing the exact guidance snapshot that was applied to this
								persisted review run.
							</p>
						) : null}
					</div>

					{guidelinesError ? (
						<InlineBanner
							tone="danger"
							title={guidelinesError}
							description="You can still add additional review guidelines below."
						/>
					) : null}
					{additionalGuidelinesError ? (
						<InlineBanner
							tone="danger"
							title={additionalGuidelinesError}
							description="Additional review guidelines could not be loaded or saved."
						/>
					) : null}

					{isViewingHistory ? (
						<label className="space-y-1.5 text-sm text-text-secondary">
							<span>Applied review guidance</span>
							<Textarea
								aria-label="Applied review guidance"
								value={appliedGuidanceValue}
								readOnly
								className="min-h-40 resize-none"
							/>
						</label>
					) : (
						<>
							{isGuidelinesLoading || savedGuidelineItems.length > 0 ? (
								<div className="space-y-2 text-sm text-text-secondary">
									<span className="block">Existing review guidelines</span>
									{isGuidelinesLoading ? (
										<div className="rounded-[14px] border border-border-subtle bg-[rgba(255,255,255,0.03)] px-3 py-3 text-sm text-text-secondary">
											Loading saved review guidance...
										</div>
									) : (
										<ul
											aria-label="Existing review guideline list"
											className="space-y-2"
										>
											{savedGuidelineItems.map((guideline) => {
												const isExpanded = expandedSavedGuidelineIds.includes(
													guideline.id,
												);
												const preview = buildSavedGuidelinePreview(
													guideline.text,
												);

												return (
													<li
														key={guideline.id}
														className="rounded-[14px] border border-border-subtle bg-[rgba(255,255,255,0.03)] px-3 py-2.5"
													>
														<div className="flex items-start gap-2">
															<StatusPill
																tone={
																	guideline.source === "App-wide"
																		? "accent"
																		: "neutral"
																}
															>
																{guideline.source}
															</StatusPill>
															<div className="min-w-0 flex-1">
																<p className="text-sm leading-5 text-text-primary">
																	{isExpanded
																		? guideline.text
																		: preview.previewText}
																</p>
																{preview.isExpandable ? (
																	<Button
																		type="button"
																		variant="link"
																		size="sm"
																		className="mt-1 h-auto px-0 text-[11px]"
																		onClick={() =>
																			handleToggleSavedGuideline(guideline.id)
																		}
																		aria-expanded={isExpanded}
																	>
																		{isExpanded ? (
																			<>
																				<ChevronUp className="size-3.5" />
																				Collapse
																			</>
																		) : (
																			<>
																				<ChevronDown className="size-3.5" />
																				Expand
																			</>
																		)}
																	</Button>
																) : null}
															</div>
														</div>
													</li>
												);
											})}
										</ul>
									)}
								</div>
							) : null}

							<div className="space-y-2 text-sm text-text-secondary">
								<span className="block">Additional review guidelines</span>
								{isAdditionalGuidelinesLoading &&
								additionalGuidelines.length === 0 &&
								!draftGuideline ? (
									<div className="rounded-[14px] border border-border-subtle bg-[rgba(255,255,255,0.03)] px-3 py-3 text-sm text-text-secondary">
										Loading additional review guidelines...
									</div>
								) : null}
								{additionalGuidelines.length > 0 ? (
									<ul
										aria-label="Additional review guideline list"
										className="space-y-2"
									>
										{additionalGuidelines.map((guideline) => {
											const isEditing = editingGuidelineId === guideline.id;

											return (
												<li
													key={guideline.id}
													className="rounded-[14px] border border-border-subtle bg-[rgba(255,255,255,0.03)] px-3 py-2.5"
												>
													{isEditing ? (
														<div className="space-y-2">
															<Textarea
																aria-label="Edit review guideline"
																value={editingGuidelineDraft}
																onChange={(event) =>
																	setEditingGuidelineDraft(
																		event.target.value,
																	)
																}
																className="min-h-28 resize-y"
															/>
															<div className="flex flex-wrap justify-start gap-2">
																<Button
																	type="button"
																	variant="accent"
																	size="sm"
																	onClick={handleSaveEditingGuideline}
																	disabled={!canSaveEditingGuideline}
																>
																	<Check className="size-4" />
																	Save
																</Button>
																<Button
																	type="button"
																	variant="toolbar"
																	size="sm"
																	onClick={handleCancelEditingGuideline}
																>
																	<X className="size-4" />
																	Cancel
																</Button>
															</div>
														</div>
													) : (
														<div className="flex items-center justify-between gap-2">
															<p className="min-w-0 flex-1 truncate text-sm leading-5 text-text-primary">
																{guideline.text}
															</p>
															<div className="flex shrink-0 items-center gap-1">
																<Button
																	type="button"
																	variant="toolbar"
																	size="icon-sm"
																	className="size-6 rounded-[9px] [&_svg]:size-3"
																	aria-label="Edit guideline"
																	title="Edit guideline"
																	disabled={isAdditionalGuidelinesLoading}
																	onClick={() =>
																		handleStartEditingGuideline(guideline)
																	}
																>
																	<Pencil className="size-4" />
																</Button>
																<Button
																	type="button"
																	variant="danger"
																	size="icon-sm"
																	className="size-6 rounded-[9px] [&_svg]:size-3"
																	aria-label="Remove guideline"
																	title="Remove guideline"
																	disabled={isAdditionalGuidelinesLoading}
																	onClick={() =>
																		handleRemoveGuideline(guideline.id)
																	}
																>
																	<Trash2 className="size-4" />
																</Button>
															</div>
														</div>
													)}
												</li>
											);
										})}
									</ul>
								) : null}

								<div className="space-y-2">
									<div className="relative">
										<Textarea
											aria-label="New review guideline"
											value={draftGuideline}
											onChange={(event) =>
												handleDraftGuidelineChange(event.target.value)
											}
											onKeyDown={handleDraftGuidelineKeyDown}
											placeholder="Add a review guideline for the next review."
											className="min-h-36 resize-y pr-12 pb-12"
											disabled={isAdditionalGuidelinesLoading}
										/>
										<Button
											type="button"
											variant="accent"
											size="icon-sm"
											className="absolute bottom-3 right-3 size-7 rounded-full [&_svg]:size-3.5"
											aria-label="Add guideline"
											title="Add guideline"
											onClick={handleAddGuideline}
											disabled={!hasDraftGuideline}
										>
											<Plus className="size-4" />
										</Button>
									</div>
								</div>
							</div>
						</>
					)}
				</PopoverContent>
			</Popover>

			{targetMode === "compare" ? (
				<div className="flex min-w-0 items-center gap-2">
					<ReviewTitleBarBranchPicker
						options={branchOptions}
						value={baseRef}
						onSelect={onBaseRefChange}
						disabled={branchSelectionDisabled}
						placeholder="Base"
					/>
					<span className="inline-flex items-center justify-center px-0.5 text-text-tertiary">
						<ArrowRight className="size-4" />
					</span>
					<ReviewTitleBarBranchPicker
						options={branchOptions}
						value={headRef}
						onSelect={onHeadRefChange}
						disabled={branchSelectionDisabled}
						placeholder="Head"
					/>
				</div>
			) : (
				<div className="flex min-w-0 items-center">
					<div className="inline-flex h-8 min-w-0 items-center gap-2 rounded-[14px] border border-border-subtle bg-[rgba(255,255,255,0.03)] px-3 text-[11px] font-semibold text-text-secondary">
						<GitCommitHorizontal className="size-3.5 shrink-0" />
						<span className="text-text-tertiary">Commit</span>
						<span className="truncate font-mono text-text-primary">
							{commitLabel}
						</span>
					</div>
				</div>
			)}

			{shouldShowStartReview ? (
				<Button
					variant="accent"
					size="sm"
					className="min-w-[10.5rem]"
					onClick={() => {
						onStartReview(serializedAdditionalGuidelines);
					}}
					disabled={!canStartReview}
				>
					<>
						<Play className="size-4" />
						Start Review
					</>
				</Button>
			) : null}

			{hasCancelableRun ? (
				<Button
					variant="danger"
					size="sm"
					className="min-w-[8.5rem]"
					onClick={onCancelReview}
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
		</div>
	);
}

export default ReviewTitleBarTrailing;
