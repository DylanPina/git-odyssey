import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	GitCommitHorizontal,
	Loader2,
	PanelRightOpen,
	Sparkles,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
	compareReviewTarget,
	generateReview,
	getDesktopRepoSettings,
} from "@/api/api";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/custom/Combobox";
import {
	DiffWorkspace,
	type DiffWorkspaceHandle,
} from "@/components/ui/custom/DiffWorkspace";
import { CommitToolbar } from "@/components/ui/custom/CommitToolbar";
import { MarkdownRenderer } from "@/components/ui/custom/MarkdownRenderer";
import { InlineBanner } from "@/components/ui/inline-banner";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import { useRepoData } from "@/hooks/useRepoData";
import type { Commit } from "@/lib/definitions/repo";
import type {
	ReviewCompareResponse,
	ReviewFinding,
	ReviewReport,
} from "@/lib/definitions/review";
import {
	buildRepoRoute,
	buildReviewRoute,
	readRepoPathFromSearchParams,
	readReviewRefsFromSearchParams,
} from "@/lib/repoPaths";

const REVIEW_CACHE_PREFIX = "git-odyssey:review-report:";
const DETACHED_HEAD_LABEL = "HEAD (detached)";

type ReviewBranchTipCardProps = {
	label: string;
	branchName: string;
	commit: Commit | null;
	isLoading: boolean;
};

type ReviewMetaPillProps = {
	label: string;
	value: string;
	isMono?: boolean;
};

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Something went wrong.";
}

function getSeverityTone(severity: ReviewFinding["severity"]) {
	if (severity === "high") {
		return "danger";
	}

	if (severity === "medium") {
		return "warning";
	}

	return "accent";
}

function formatSeverityLabel(severity: ReviewFinding["severity"]) {
	return severity.charAt(0).toUpperCase() + severity.slice(1);
}

function getCommitSubject(message?: string | null) {
	return (
		(message || "")
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find(Boolean) || null
	);
}

function formatGeneratedAt(value?: string) {
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

function formatCommitTime(value?: number | null) {
	if (typeof value !== "number") {
		return "Unknown date";
	}

	const parsed = new Date(value * 1000);
	if (Number.isNaN(parsed.getTime())) {
		return "Unknown date";
	}

	return parsed.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function formatShortSha(value?: string | null) {
	return value ? value.slice(0, 8) : "Unavailable";
}

function getReviewCacheKey(compare: ReviewCompareResponse) {
	return [
		REVIEW_CACHE_PREFIX,
		compare.repo_path,
		compare.base_ref,
		compare.head_ref,
		compare.merge_base_sha,
	].join("::");
}

function readCachedReview(compare: ReviewCompareResponse): ReviewReport | null {
	try {
		const raw = window.localStorage.getItem(getReviewCacheKey(compare));
		if (!raw) {
			return null;
		}

		return JSON.parse(raw) as ReviewReport;
	} catch {
		return null;
	}
}

function writeCachedReview(
	compare: ReviewCompareResponse,
	report: ReviewReport,
) {
	try {
		window.localStorage.setItem(
			getReviewCacheKey(compare),
			JSON.stringify(report),
		);
	} catch {
		// Ignore localStorage write failures.
	}
}

function ReviewMetaPill({ label, value, isMono = true }: ReviewMetaPillProps) {
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
}: ReviewBranchTipCardProps) {
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
							<span>{commit.author || "Unknown author"}</span>
							<span>{formatCommitTime(commit.time)}</span>
						</div>
					</div>
				</div>
			)}
		</section>
	);
}

function ReviewFindingsList({
	findings,
	onSelect,
}: {
	findings: ReviewFinding[];
	onSelect: (finding: ReviewFinding) => void;
}) {
	if (findings.length === 0) {
		return (
			<div className="rounded-[16px] border border-dashed border-border-subtle px-3 py-4 text-sm text-text-secondary">
				No structured findings were generated for this diff.
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{findings.map((finding) => (
				<button
					key={finding.id}
					type="button"
					className="w-full rounded-[16px] border border-border-subtle bg-control/50 px-3 py-3 text-left transition-colors hover:border-border-strong hover:bg-control"
					onClick={() => onSelect(finding)}
				>
					<div className="flex flex-wrap items-center gap-2">
						<StatusPill tone={getSeverityTone(finding.severity)}>
							{formatSeverityLabel(finding.severity)}
						</StatusPill>
						<span className="font-medium text-text-primary">
							{finding.title}
						</span>
					</div>
					<div className="mt-2 font-mono text-[11px] text-text-tertiary">
						{finding.file_path}
						{finding.new_start != null ? ` @ new:${finding.new_start}` : ""}
						{finding.old_start != null ? ` old:${finding.old_start}` : ""}
					</div>
					<div className="mt-2 text-sm leading-6 text-text-secondary">
						<p className="whitespace-pre-wrap">{finding.body}</p>
					</div>
				</button>
			))}
		</div>
	);
}

export function Review() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const repoPath = readRepoPathFromSearchParams(searchParams);
	const { baseRef: queryBaseRef, headRef: queryHeadRef } = useMemo(
		() => readReviewRefsFromSearchParams(searchParams),
		[searchParams],
	);
	const diffWorkspaceRef = useRef<DiffWorkspaceHandle | null>(null);
	const compareRequestIdRef = useRef(0);

	const [baseRef, setBaseRef] = useState(queryBaseRef ?? "");
	const [headRef, setHeadRef] = useState(queryHeadRef ?? "");
	const [compare, setCompare] = useState<ReviewCompareResponse | null>(null);
	const [compareError, setCompareError] = useState<string | null>(null);
	const [isCompareLoading, setIsCompareLoading] = useState(false);
	const [report, setReport] = useState<ReviewReport | null>(null);
	const [reportError, setReportError] = useState<string | null>(null);
	const [isGenerating, setIsGenerating] = useState(false);
	const [isInsightsOpen, setIsInsightsOpen] = useState(false);

	const {
		commits,
		branches,
		isLoading: isRepoLoading,
		error: repoError,
	} = useRepoData({ repoPath });

	useEffect(() => {
		setBaseRef(queryBaseRef ?? "");
	}, [queryBaseRef]);

	useEffect(() => {
		setHeadRef(queryHeadRef ?? "");
	}, [queryHeadRef]);

	useEffect(() => {
		setCompare(null);
		setCompareError(null);
		setReport(null);
		setReportError(null);
	}, [baseRef, headRef, repoPath]);

	useEffect(() => {
		if (!compare) {
			setReport(null);
			setReportError(null);
			return;
		}

		setReport(readCachedReview(compare));
		setReportError(null);
	}, [compare]);

	useEffect(() => {
		if (!report) {
			setIsInsightsOpen(false);
		}
	}, [report]);

	const branchOptions = useMemo(
		() =>
			Array.from(
				new Set(
					branches
						.map((branch) => branch.name)
						.filter((name) => name && name !== DETACHED_HEAD_LABEL),
				),
			).sort((left, right) =>
				left.localeCompare(right, undefined, {
					numeric: true,
					sensitivity: "base",
				}),
			),
		[branches],
	);

	const commitBySha = useMemo(
		() => new Map(commits.map((commit) => [commit.sha, commit])),
		[commits],
	);

	const branchByName = useMemo(
		() => new Map(branches.map((branch) => [branch.name, branch])),
		[branches],
	);

	const resolveBranchTipCommit = useCallback(
		(refName: string) => {
			if (!refName) {
				return null;
			}

			const tipSha = branchByName.get(refName)?.commits?.[0];
			if (!tipSha) {
				return null;
			}

			return commitBySha.get(tipSha) ?? null;
		},
		[branchByName, commitBySha],
	);

	const baseTipCommit = useMemo(
		() => resolveBranchTipCommit(baseRef),
		[baseRef, resolveBranchTipCommit],
	);

	const headTipCommit = useMemo(
		() => resolveBranchTipCommit(headRef),
		[headRef, resolveBranchTipCommit],
	);

	const activeCompare = useMemo(() => {
		if (!compare) {
			return null;
		}

		if (compare.base_ref !== baseRef || compare.head_ref !== headRef) {
			return null;
		}

		return compare;
	}, [baseRef, compare, headRef]);

	const updateRoute = useCallback(
		(nextBaseRef: string, nextHeadRef: string) => {
			if (!repoPath) {
				return;
			}

			navigate(
				buildReviewRoute(repoPath, nextBaseRef || null, nextHeadRef || null),
				{
					replace: true,
				},
			);
		},
		[navigate, repoPath],
	);

	const handleBaseRefChange = useCallback(
		(nextBaseRef: string) => {
			setBaseRef(nextBaseRef);
			updateRoute(nextBaseRef, headRef);
		},
		[headRef, updateRoute],
	);

	const handleHeadRefChange = useCallback(
		(nextHeadRef: string) => {
			setHeadRef(nextHeadRef);
			updateRoute(baseRef, nextHeadRef);
		},
		[baseRef, updateRoute],
	);

	const loadCompare = useCallback(
		async ({
			baseRef: nextBaseRef = baseRef,
			headRef: nextHeadRef = headRef,
		}: {
			baseRef?: string;
			headRef?: string;
		} = {}): Promise<ReviewCompareResponse | null> => {
			if (!repoPath) {
				setCompareError("No Git project path was provided.");
				return null;
			}

			if (!nextBaseRef || !nextHeadRef) {
				return null;
			}

			const requestId = ++compareRequestIdRef.current;
			setIsCompareLoading(true);
			setCompareError(null);
			setReportError(null);

			try {
				const repoSettings = await getDesktopRepoSettings(repoPath);
				const response = await compareReviewTarget({
					repoPath,
					baseRef: nextBaseRef,
					headRef: nextHeadRef,
					contextLines: repoSettings.contextLines,
				});
				if (compareRequestIdRef.current !== requestId) {
					return null;
				}
				setCompare(response);
				return response;
			} catch (error) {
				if (compareRequestIdRef.current !== requestId) {
					return null;
				}
				const message = getErrorMessage(error);
				setCompare(null);
				setCompareError(message);
				setReport(null);
				return null;
			} finally {
				if (compareRequestIdRef.current === requestId) {
					setIsCompareLoading(false);
				}
			}
		},
		[baseRef, headRef, repoPath],
	);

	useEffect(() => {
		if (!repoPath || !baseRef || !headRef) {
			compareRequestIdRef.current += 1;
			setIsCompareLoading(false);
			return;
		}

		void loadCompare({ baseRef, headRef });
	}, [baseRef, headRef, loadCompare, repoPath]);

	const handleGenerateReview = useCallback(async () => {
		if (!repoPath) {
			setReportError("No Git project path was provided.");
			return;
		}

		const activeSelection =
			activeCompare?.base_ref === baseRef && activeCompare?.head_ref === headRef
				? activeCompare
				: await loadCompare();
		if (!activeSelection) {
			return;
		}

		setIsGenerating(true);
		setReportError(null);

		try {
			const repoSettings = await getDesktopRepoSettings(repoPath);
			const nextReport = await generateReview({
				repoPath,
				baseRef,
				headRef,
				contextLines: repoSettings.contextLines,
			});
			setReport(nextReport);
			writeCachedReview(activeSelection, nextReport);
		} catch (error) {
			setReportError(getErrorMessage(error));
		} finally {
			setIsGenerating(false);
		}
	}, [activeCompare, baseRef, headRef, loadCompare, repoPath]);

	const handleFindingSelect = useCallback((finding: ReviewFinding) => {
		diffWorkspaceRef.current?.focusLocation({
			filePath: finding.file_path,
			newStart: finding.new_start ?? null,
			oldStart: finding.old_start ?? null,
		});
	}, []);

	const handleInsightFindingSelect = useCallback(
		(finding: ReviewFinding) => {
			handleFindingSelect(finding);
			setIsInsightsOpen(false);
		},
		[handleFindingSelect],
	);

	const canGenerateReview = Boolean(
		repoPath && baseRef && headRef && !isCompareLoading && !isGenerating,
	);
	const findingsLabel =
		report != null
			? `${report.findings.length} finding${report.findings.length === 1 ? "" : "s"}`
			: "No review";
	const compareMetadata = [
		{
			label: "Base",
			value: baseRef
				? baseTipCommit
					? formatShortSha(baseTipCommit.sha)
					: isRepoLoading
						? "Loading"
						: "Unavailable"
				: "Not selected",
		},
		{
			label: "Head",
			value: headRef
				? headTipCommit
					? formatShortSha(headTipCommit.sha)
					: isRepoLoading
						? "Loading"
						: "Unavailable"
				: "Not selected",
		},
		{
			label: "Merge",
			value: activeCompare?.merge_base_sha
				? formatShortSha(activeCompare.merge_base_sha)
				: "Pending",
		},
		{
			label: "Files",
			value:
				activeCompare != null
					? String(activeCompare.stats.files_changed)
					: "Pending",
		},
		{
			label: "Additions",
			value:
				activeCompare != null
					? String(activeCompare.stats.additions)
					: "Pending",
		},
		{
			label: "Deletions",
			value:
				activeCompare != null
					? String(activeCompare.stats.deletions)
					: "Pending",
		},
	];

	const pageTopContent = (
		<div className="space-y-3">
			<div className="rounded-[20px] border border-border-strong bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
						<div className="grid min-w-0 flex-1 gap-3 md:grid-cols-2 xl:min-w-[28rem]">
							<label className="flex min-w-0 flex-col gap-1.5">
								<span className="workspace-section-label">Base Branch</span>
								<Combobox
									options={branchOptions}
									value={baseRef}
									onSelect={handleBaseRefChange}
									disabled={branchOptions.length === 0 || isRepoLoading}
									placeholder="Select base branch"
								/>
							</label>

							<label className="flex min-w-0 flex-col gap-1.5">
								<span className="workspace-section-label">Head Branch</span>
								<Combobox
									options={branchOptions}
									value={headRef}
									onSelect={handleHeadRefChange}
									disabled={branchOptions.length === 0 || isRepoLoading}
									placeholder="Select head branch"
								/>
							</label>
						</div>

						<div className="flex flex-wrap items-center gap-2 xl:justify-end">
							<Button
								variant="accent"
								size="sm"
								className="min-w-[9.75rem]"
								onClick={() => void handleGenerateReview()}
								disabled={!canGenerateReview}
							>
								{isGenerating ? (
									<>
										<Loader2 className="size-4 animate-spin" />
										Generating review
									</>
								) : (
									<>
										<Sparkles className="size-4" />
										Generate review
									</>
								)}
							</Button>

							<Button
								variant="toolbar"
								size="sm"
								className="min-w-[8.5rem] justify-between"
								onClick={() => setIsInsightsOpen(true)}
								disabled={!report}
								aria-haspopup="dialog"
								title={
									report
										? `Generated ${formatGeneratedAt(report.generated_at)}`
										: "Generate a review to open insights"
								}
							>
								<span className="flex items-center gap-2">
									<PanelRightOpen className="size-4" />
									Insights
								</span>
								{report ? (
									<span className="rounded-full border border-border-subtle bg-control px-1.5 py-0.5 font-mono text-[10px] text-text-primary">
										{report.findings.length}
									</span>
								) : null}
							</Button>

							{report?.partial ? (
								<StatusPill tone="warning">Partial</StatusPill>
							) : null}
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
						{compareMetadata.map((item) => (
							<ReviewMetaPill
								key={item.label}
								label={item.label}
								value={item.value}
							/>
						))}
						{report ? (
							<>
								<ReviewMetaPill
									label="Review"
									value={findingsLabel}
									isMono={false}
								/>
								<ReviewMetaPill
									label="Generated"
									value={formatGeneratedAt(report.generated_at)}
									isMono={false}
								/>
							</>
						) : null}
					</div>

					<div className="grid gap-3 lg:grid-cols-2">
						<ReviewBranchTipCard
							label="Base"
							branchName={baseRef}
							commit={baseTipCommit}
							isLoading={isRepoLoading}
						/>
						<ReviewBranchTipCard
							label="Head"
							branchName={headRef}
							commit={headTipCommit}
							isLoading={isRepoLoading}
						/>
					</div>
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

			{reportError ? <InlineBanner tone="danger" title={reportError} /> : null}
		</div>
	);

	const changedFilesLabel = activeCompare
		? `${activeCompare.stats.files_changed} file${activeCompare.stats.files_changed === 1 ? "" : "s"} changed`
		: "Review diff";
	const workspaceTopContent = (
		<div className="flex min-w-0 items-center gap-3">
			<div className="flex size-9 shrink-0 items-center justify-center rounded-[12px] border border-border-subtle bg-[rgba(255,255,255,0.035)]">
				<GitCommitHorizontal className="size-4 text-text-secondary" />
			</div>

			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
					<div className="text-sm font-semibold text-text-primary">
						{changedFilesLabel}
					</div>
					{activeCompare ? (
						<div className="flex items-center gap-2 font-mono text-[11px]">
							<span className="text-success">
								+{activeCompare.stats.additions}
							</span>
							<span className="text-danger">
								-{activeCompare.stats.deletions}
							</span>
							<span className="text-text-secondary">lines changed</span>
						</div>
					) : null}
				</div>

				<div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
					<span className="font-mono text-text-primary">
						{baseRef || "Base"}
					</span>
					<span>vs</span>
					<span className="font-mono text-text-primary">
						{headRef || "Head"}
					</span>
					{activeCompare?.merge_base_sha ? (
						<>
							<span className="text-text-tertiary">merge</span>
							<span className="font-mono">
								{formatShortSha(activeCompare.merge_base_sha)}
							</span>
						</>
					) : null}
					{report ? <span>{findingsLabel}</span> : null}
				</div>
			</div>
		</div>
	);

	return (
		<>
			<div className="workspace-shell min-h-screen">
				<div className="flex min-h-screen flex-col pb-4">
					<div className="px-4 pt-4">
						<CommitToolbar
							repoPath={repoPath}
							detailLabel="Review"
							onExit={() => navigate(repoPath ? buildRepoRoute(repoPath) : "/")}
							onCollapseAll={
								activeCompare?.file_changes?.length
									? () => diffWorkspaceRef.current?.collapseAll()
									: undefined
							}
						/>
					</div>

					<div className="px-4 pt-4">{pageTopContent}</div>

					<div className="px-4 pb-4 pt-4">
						<div className="sticky top-[calc(var(--header-height)+1rem)] z-10 h-[calc(100dvh-var(--header-height)-2rem)]">
							<DiffWorkspace
								ref={diffWorkspaceRef}
								repoPath={repoPath}
								viewerId={
									activeCompare
										? `review:${activeCompare.merge_base_sha}:${activeCompare.base_ref}:${activeCompare.head_ref}`
										: "review"
								}
								files={activeCompare?.file_changes ?? []}
								isLoading={isCompareLoading}
								error={
									!repoPath ? "No Git project path was provided." : compareError
								}
								topContent={workspaceTopContent}
								fileSearchInputId="review-file-search-input"
								codeSearchInputId="review-code-search-input"
								emptyTitle="Select two local branches to load the diff."
								emptyDescription="Review mode compares merge-base(base, head)...head directly from the live Git repository."
								chromeDensity="compact"
								fileTreeCollapsible
							/>
						</div>
					</div>
				</div>
			</div>

			<Sheet
				open={Boolean(report) && isInsightsOpen}
				onOpenChange={setIsInsightsOpen}
			>
				{report ? (
					<SheetContent side="right" className="w-[min(34rem,100vw)] gap-0 p-0">
						<SheetHeader className="border-b border-border-subtle p-5 pb-4">
							<div className="flex items-start justify-between gap-3 pr-8">
								<div className="min-w-0">
									<SheetTitle>Review Insights</SheetTitle>
									<SheetDescription className="mt-1 text-left">
										{`${baseRef || "Base"} -> ${headRef || "Head"} / Generated ${formatGeneratedAt(report.generated_at)}`}
									</SheetDescription>
								</div>
								{report.partial ? (
									<StatusPill tone="warning">Partial</StatusPill>
								) : null}
							</div>
						</SheetHeader>

						<div className="workspace-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
							<section className="rounded-[18px] border border-border-subtle bg-[rgba(255,255,255,0.026)] p-4">
								<div className="flex items-center justify-between gap-3">
									<div className="workspace-section-label">AI Summary</div>
									<div className="font-mono text-xs text-text-tertiary">
										{findingsLabel}
									</div>
								</div>
								<div className="mt-3 text-sm leading-6 text-text-secondary">
									<MarkdownRenderer content={report.summary} />
								</div>
							</section>

							<section className="mt-4 rounded-[18px] border border-border-subtle bg-[rgba(255,255,255,0.026)] p-4">
								<div className="flex items-center justify-between gap-3">
									<div className="workspace-section-label">Findings</div>
									<div className="font-mono text-xs text-text-tertiary">
										{report.findings.length}
									</div>
								</div>
								<div className="mt-3">
									<ReviewFindingsList
										findings={report.findings}
										onSelect={handleInsightFindingSelect}
									/>
								</div>
							</section>
						</div>
					</SheetContent>
				) : null}
			</Sheet>
		</>
	);
}
