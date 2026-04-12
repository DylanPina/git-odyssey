import { useEffect, useRef, useState } from "react";
import {
	ChevronDown,
	ChevronRight,
	Maximize2,
	MessageCircle,
	Minimize2,
	PanelRightOpen,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MarkdownRenderer } from "@/components/ui/custom/MarkdownRenderer";
import { StatusPill } from "@/components/ui/status-pill";
import type {
	ReviewFinding,
	ReviewResult,
	ReviewRun,
} from "@/lib/definitions/review";
import { ACTIVE_RUN_STATUSES } from "@/pages/review/review-constants";
import {
	formatFindingReference,
	formatGeneratedAt,
	formatSeverityLabel,
	formatThoughtDuration,
	getSeverityTone,
} from "@/pages/review/review-formatters";
import type { ReasoningTraceEntry } from "@/pages/review/review-types";
import { cn } from "@/lib/utils";

function LiveReasoningText({ entry }: { entry: ReasoningTraceEntry }) {
	if (!entry.latestDeltaText) {
		return (
			<div className="review-trace-copy whitespace-pre-wrap text-[12px] leading-6 text-text-secondary">
				{entry.text}
			</div>
		);
	}

	return (
		<div className="review-trace-copy whitespace-pre-wrap text-[12px] leading-6 text-text-secondary">
			{entry.stableText}
			<span
				key={`${entry.id}:${entry.sequence}:${entry.latestDeltaText.slice(-24)}`}
				className="review-trace-inline-update"
			>
				{entry.latestDeltaText}
			</span>
		</div>
	);
}

function ReviewInProgressState({
	reasoningTrace,
}: {
	reasoningTrace: ReasoningTraceEntry[];
}) {
	const [isTraceOpen, setIsTraceOpen] = useState(false);
	const visibleTrace = reasoningTrace.slice(0, 5);

	return (
		<div className="review-runtime-pulse relative overflow-hidden rounded-[14px] border border-[rgba(122,162,255,0.18)] bg-[linear-gradient(180deg,rgba(122,162,255,0.07),rgba(122,162,255,0.02))] px-3 py-3">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(122,162,255,0.16),transparent_55%)] opacity-70" />
			<div className="relative">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="text-sm font-semibold text-text-primary">
							Review in progress
						</div>
						<div className="mt-1 text-xs leading-5 text-text-secondary">
							Codex is still reviewing this diff. Findings and summary will
							appear here as soon as the run completes.
						</div>
					</div>
					<div className="relative mt-0.5 flex size-12 shrink-0 items-center justify-center">
						<div className="review-runtime-ring absolute inset-0 rounded-full border border-[rgba(122,162,255,0.24)]" />
						<div className="review-runtime-ring-delayed absolute inset-[6px] rounded-full border border-[rgba(199,220,255,0.16)]" />
						<div className="review-runtime-core absolute inset-[14px] rounded-full bg-[radial-gradient(circle,rgba(185,210,255,0.96),rgba(122,162,255,0.32)_45%,rgba(122,162,255,0.06)_80%,transparent)] blur-[1px]" />
					</div>
				</div>

				<div className="mt-3 w-full text-left">
					<button
						type="button"
						className="flex items-center gap-2 px-0 py-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-tertiary transition-colors duration-150 hover:text-text-primary"
						onClick={() => setIsTraceOpen((current) => !current)}
						aria-expanded={isTraceOpen}
					>
						{isTraceOpen ? (
							<ChevronDown className="size-4" />
						) : (
							<ChevronRight className="size-4" />
						)}
						<span>Thinking</span>
					</button>

					{isTraceOpen ? (
						<div className="mt-3 space-y-2.5">
							{visibleTrace.length > 0 ? (
								visibleTrace.map((entry, index) => (
									<div
										key={entry.id}
										className="review-trace-item relative pl-5"
										style={{ animationDelay: `${index * 110}ms` }}
									>
										<span className="review-trace-rail" aria-hidden="true" />
										<span className="review-trace-node" aria-hidden="true" />
										<div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-text-tertiary">
											<span className="font-mono">#{entry.sequence}</span>
											{entry.method ? (
												<span className="font-mono">{entry.method}</span>
											) : null}
											{entry.createdAt ? (
												<span>{formatGeneratedAt(entry.createdAt)}</span>
											) : null}
										</div>
										<LiveReasoningText entry={entry} />
									</div>
								))
							) : (
								<div className="space-y-2.5">
									<div className="review-trace-placeholder">
										<div className="review-runtime-shimmer h-3.5 w-[72%] rounded-full bg-[rgba(255,255,255,0.06)]" />
										<div className="review-runtime-shimmer mt-2 h-3.5 w-[88%] rounded-full bg-[rgba(255,255,255,0.06)] [animation-delay:180ms]" />
									</div>
									<div className="review-trace-placeholder [animation-delay:160ms]">
										<div className="review-runtime-shimmer h-3.5 w-[64%] rounded-full bg-[rgba(255,255,255,0.06)] [animation-delay:240ms]" />
										<div className="review-runtime-shimmer mt-2 h-3.5 w-[82%] rounded-full bg-[rgba(255,255,255,0.06)] [animation-delay:420ms]" />
									</div>
								</div>
							)}
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}

function CompletedReasoningSection({
	title,
	reasoningTrace,
}: {
	title: string;
	reasoningTrace: ReasoningTraceEntry[];
}) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<section className="mt-3 border-t border-border-subtle pt-3">
			<button
				type="button"
				className="flex w-full items-center justify-between gap-3 rounded-[10px] border border-border-subtle bg-[rgba(255,255,255,0.02)] px-3 py-1.5 text-left transition-[background-color,border-color,color] duration-150 hover:border-[rgba(122,162,255,0.24)] hover:bg-[rgba(122,162,255,0.06)]"
				onClick={() => setIsOpen((current) => !current)}
				aria-expanded={isOpen}
			>
				<span className="flex items-center gap-2">
					{isOpen ? (
						<ChevronDown className="size-4 text-text-secondary" />
					) : (
						<ChevronRight className="size-4 text-text-secondary" />
					)}
					<span className="text-sm font-semibold text-text-primary">
						{title}
					</span>
				</span>
			</button>

			{isOpen ? (
				<div className="mt-3 space-y-2.5">
					{reasoningTrace.map((entry, index) => (
						<div
							key={entry.id}
							className="review-trace-item relative pl-5"
							style={{ animationDelay: `${index * 70}ms` }}
						>
							<span className="review-trace-rail" aria-hidden="true" />
							<span className="review-trace-node" aria-hidden="true" />
							<div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-text-tertiary">
								<span className="font-mono">#{entry.sequence}</span>
								{entry.method ? (
									<span className="font-mono">{entry.method}</span>
								) : null}
								{entry.createdAt ? (
									<span>{formatGeneratedAt(entry.createdAt)}</span>
								) : null}
							</div>
							<MarkdownRenderer
								content={entry.text}
								className="review-trace-copy text-[12px]"
							/>
						</div>
					))}
				</div>
			) : null}
		</section>
	);
}

function ReviewFindingsList({
	findings,
	selectedFindingId,
	onSelect,
	onAddToChat,
	canNavigateToFinding,
}: {
	findings: ReviewFinding[];
	selectedFindingId: string | null;
	onSelect: (finding: ReviewFinding) => void;
	onAddToChat: (finding: ReviewFinding) => void;
	canNavigateToFinding: (finding: ReviewFinding) => boolean;
}) {
	if (findings.length === 0) {
		return (
			<div className="rounded-[16px] border border-dashed border-border-subtle px-3 py-4 text-sm text-text-secondary">
				No structured findings were generated for this review run.
			</div>
		);
	}

	return (
		<div className="space-y-1.5">
			{findings.map((finding) => {
				const { label } = formatFindingReference(finding);
				const isSelected = selectedFindingId === finding.id;
				const canNavigate = canNavigateToFinding(finding);
				const content = (
					<>
						<div className="flex flex-wrap items-start justify-between gap-2">
							<div className="flex flex-wrap items-center gap-2">
								<StatusPill tone={getSeverityTone(finding.severity)}>
									{formatSeverityLabel(finding.severity)}
								</StatusPill>
								<span
									className={cn(
										"shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px]",
										canNavigate
											? "border-[rgba(122,162,255,0.28)] bg-[rgba(122,162,255,0.1)] text-text-primary"
											: "border-border-subtle bg-[rgba(255,255,255,0.03)] text-text-tertiary",
									)}
								>
									{label}
								</span>
							</div>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										type="button"
										variant="toolbar"
										size="sm"
										className="h-7 rounded-full px-2.5 text-[11px]"
										onClick={(event) => {
											event.stopPropagation();
											onAddToChat(finding);
										}}
										aria-label={`Ask AI about ${finding.title}`}
									>
										<MessageCircle className="size-3.5" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>Add to chat</TooltipContent>
							</Tooltip>
						</div>
						<div className="mt-2 text-sm font-semibold leading-5 text-text-primary">
							{finding.title}
						</div>
						{!canNavigate ? (
							<div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-text-tertiary">
								<span>Reference unavailable in the current diff.</span>
							</div>
						) : null}
						<div className="mt-1.5 text-sm leading-5 text-text-secondary">
							<p className="whitespace-pre-wrap">{finding.body}</p>
						</div>
					</>
				);

				if (!canNavigate) {
					return (
						<div
							key={finding.id}
							data-review-finding-id={finding.id}
							className={cn(
								"rounded-[12px] border px-2.5 py-2",
								isSelected
									? "border-[rgba(122,162,255,0.35)] bg-[rgba(122,162,255,0.08)]"
									: "border-border-subtle bg-[rgba(255,255,255,0.025)]",
							)}
						>
							{content}
						</div>
					);
				}

				return (
					<div
						key={finding.id}
						data-review-finding-id={finding.id}
						role="button"
						tabIndex={0}
						aria-pressed={isSelected}
						aria-label={`Open finding ${finding.title}`}
						className={cn(
							"w-full rounded-[12px] border px-2.5 py-2 text-left transition-[background-color,border-color,box-shadow] duration-150",
							isSelected
								? "border-[rgba(122,162,255,0.45)] bg-[rgba(122,162,255,0.08)] shadow-[0_0_0_1px_rgba(122,162,255,0.14)]"
								: "border-border-subtle bg-[rgba(255,255,255,0.025)] hover:border-border-strong hover:bg-[rgba(255,255,255,0.045)]",
						)}
						onClick={() => onSelect(finding)}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								onSelect(finding);
							}
						}}
					>
						{content}
					</div>
				);
			})}
		</div>
	);
}

type ReviewInsightsPanelProps = {
	activeRun: ReviewRun;
	reviewResult: ReviewResult | null;
	findingsLabel: string;
	selectedFindingId: string | null;
	onSelectFinding: (finding: ReviewFinding) => void;
	onAddFindingToChat?: (finding: ReviewFinding) => void;
	canNavigateToFinding: (finding: ReviewFinding) => boolean;
	reasoningTrace: ReasoningTraceEntry[];
	isFullscreen?: boolean;
	isInline?: boolean;
	showHeader?: boolean;
	onToggleOpen: () => void;
	onToggleFullscreen: () => void;
};

export function ReviewInsightsPanel({
	activeRun,
	reviewResult,
	findingsLabel,
	selectedFindingId,
	onSelectFinding,
	onAddFindingToChat = () => {},
	canNavigateToFinding,
	reasoningTrace,
	isFullscreen = false,
	isInline = false,
	showHeader = true,
	onToggleOpen,
	onToggleFullscreen,
}: ReviewInsightsPanelProps) {
	const findingsSectionRef = useRef<HTMLDivElement | null>(null);
	const summaryText = reviewResult?.summary?.trim() || null;
	const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
	const sectionPadding = isFullscreen ? "px-4 py-3 xl:px-5" : "px-2.5 py-2.5";
	const completedThoughtDuration = formatThoughtDuration(
		activeRun,
		reviewResult,
	);
	const completedThoughtTitle = completedThoughtDuration
		? `Thought for ${completedThoughtDuration}`
		: "Thought";
	const hasCompletedReasoning =
		activeRun.status === "completed" &&
		reviewResult != null &&
		reasoningTrace.length > 0;
	const shouldClampSummary = Boolean(summaryText && summaryText.length > 320);

	useEffect(() => {
		if (!selectedFindingId) {
			return;
		}

		const container = findingsSectionRef.current;
		if (!container) {
			return;
		}

		const target = container.querySelector<HTMLElement>(
			`[data-review-finding-id="${selectedFindingId}"]`,
		);
		target?.scrollIntoView({
			block: "nearest",
			behavior: "smooth",
		});
	}, [selectedFindingId]);

	return (
		<div
			className={cn(
				isInline
					? "workspace-panel overflow-hidden bg-[linear-gradient(180deg,rgba(11,14,19,0.98),rgba(8,10,14,0.94))]"
					: "flex h-full min-h-0 flex-col",
				isFullscreen
					? "bg-[linear-gradient(180deg,rgba(9,12,17,0.98),rgba(6,9,14,0.96))]"
					: undefined,
			)}
		>
			{showHeader ? (
				<div className={cn("border-b border-border-subtle", sectionPadding)}>
					<div className="flex items-center justify-between gap-3">
						<div className="min-w-0">
							<div className="workspace-section-label">AI Review</div>
							<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
								<span>{findingsLabel}</span>
								{reviewResult ? (
									<span>{formatGeneratedAt(reviewResult.generated_at)}</span>
								) : null}
							</div>
						</div>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="toolbar"
								size="toolbar-icon"
								className="hidden xl:flex"
								onClick={onToggleFullscreen}
								aria-pressed={isFullscreen}
								aria-label={
									isFullscreen ? "Restore split view" : "Expand review"
								}
								title={isFullscreen ? "Restore split view" : "Expand review"}
							>
								{isFullscreen ? (
									<Minimize2 className="size-4" />
								) : (
									<Maximize2 className="size-4" />
								)}
							</Button>
							<Button
								type="button"
								variant="toolbar"
								size="toolbar-icon"
								onClick={onToggleOpen}
								aria-label={
									isInline ? "Hide review section" : "Collapse review rail"
								}
								title={
									isInline ? "Hide review section" : "Collapse review rail"
								}
							>
								<PanelRightOpen className="size-4 rotate-180" />
							</Button>
						</div>
					</div>
				</div>
			) : null}

			<div
				className={cn(
					"workspace-scrollbar min-h-0 overflow-y-auto",
					isInline ? "max-h-[28rem]" : "flex-1",
				)}
			>
				<section
					className={cn("border-b border-border-subtle", sectionPadding)}
				>
					<div className="flex items-center justify-between gap-3">
						<div className="workspace-section-label">Summary</div>
						{summaryText && shouldClampSummary ? (
							<button
								type="button"
								className="text-[11px] font-medium text-text-secondary transition-colors hover:text-text-primary"
								onClick={() => setIsSummaryExpanded((current) => !current)}
							>
								{isSummaryExpanded ? "Show less" : "Show more"}
							</button>
						) : null}
					</div>
					<div className="mt-2">
						{summaryText ? (
							<div className="relative">
								<div
									className={cn(
										"overflow-hidden",
										shouldClampSummary && !isSummaryExpanded
											? "max-h-[8.5rem]"
											: undefined,
									)}
								>
									<MarkdownRenderer
										content={summaryText}
										className="text-[13px] leading-5 [&_p]:my-0 [&_p+*]:mt-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5"
									/>
								</div>
								{shouldClampSummary && !isSummaryExpanded ? (
									<div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[rgba(8,10,14,0.96)] to-transparent" />
								) : null}
							</div>
						) : ACTIVE_RUN_STATUSES.has(activeRun.status) ? (
							<ReviewInProgressState reasoningTrace={reasoningTrace} />
						) : (
							<p className="text-sm leading-5 text-text-secondary">
								Structured review output is not available for this run.
							</p>
						)}
						{hasCompletedReasoning ? (
							<CompletedReasoningSection
								key={`${activeRun.id}:${reviewResult?.id ?? "summary"}`}
								title={completedThoughtTitle}
								reasoningTrace={reasoningTrace}
							/>
						) : null}
					</div>
				</section>

				<section className={sectionPadding}>
					<div className="flex items-center justify-between gap-3">
						<div className="workspace-section-label">Findings</div>
						<div className="font-mono text-[11px] text-text-tertiary">
							{findingsLabel}
						</div>
					</div>
					<div className="mt-2">
						{reviewResult ? (
							<div ref={findingsSectionRef}>
								<ReviewFindingsList
									findings={reviewResult.findings}
									selectedFindingId={selectedFindingId}
									onSelect={onSelectFinding}
									onAddToChat={onAddFindingToChat}
									canNavigateToFinding={canNavigateToFinding}
								/>
							</div>
						) : (
							<div className="rounded-[16px] border border-dashed border-border-subtle px-3 py-4 text-sm text-text-secondary">
								Structured findings will show up here when the run finishes.
							</div>
						)}
					</div>
				</section>
			</div>
		</div>
	);
}

export default ReviewInsightsPanel;
