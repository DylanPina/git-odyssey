import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
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
import { StatusPill } from "@/components/ui/status-pill";
import { useRepoData } from "@/hooks/useRepoData";
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

function writeCachedReview(compare: ReviewCompareResponse, report: ReviewReport) {
	try {
		window.localStorage.setItem(getReviewCacheKey(compare), JSON.stringify(report));
	} catch {
		// Ignore localStorage write failures.
	}
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

	const [baseRef, setBaseRef] = useState(queryBaseRef ?? "");
	const [headRef, setHeadRef] = useState(queryHeadRef ?? "");
	const [compare, setCompare] = useState<ReviewCompareResponse | null>(null);
	const [compareError, setCompareError] = useState<string | null>(null);
	const [isCompareLoading, setIsCompareLoading] = useState(false);
	const [report, setReport] = useState<ReviewReport | null>(null);
	const [reportError, setReportError] = useState<string | null>(null);
	const [isGenerating, setIsGenerating] = useState(false);

	const {
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
		if (
			compare &&
			(compare.base_ref !== baseRef || compare.head_ref !== headRef)
		) {
			setCompare(null);
			setCompareError(null);
			setReport(null);
			setReportError(null);
		}
	}, [baseRef, compare, headRef]);

	useEffect(() => {
		if (!compare) {
			setReport(null);
			setReportError(null);
			return;
		}

		setReport(readCachedReview(compare));
		setReportError(null);
	}, [compare]);

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

	const updateRoute = useCallback(
		(nextBaseRef: string, nextHeadRef: string) => {
			if (!repoPath) {
				return;
			}

			navigate(buildReviewRoute(repoPath, nextBaseRef || null, nextHeadRef || null), {
				replace: true,
			});
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

	const loadCompare = useCallback(async (): Promise<ReviewCompareResponse | null> => {
		if (!repoPath) {
			setCompareError("No Git project path was provided.");
			return null;
		}

		if (!baseRef || !headRef) {
			setCompareError(
				"Select both a base branch and a head branch before loading the diff.",
			);
			return null;
		}

		setIsCompareLoading(true);
		setCompareError(null);
		setReportError(null);

		try {
			const repoSettings = await getDesktopRepoSettings(repoPath);
			const response = await compareReviewTarget({
				repoPath,
				baseRef,
				headRef,
				contextLines: repoSettings.contextLines,
			});
			setCompare(response);
			return response;
		} catch (error) {
			const message = getErrorMessage(error);
			setCompare(null);
			setCompareError(message);
			setReport(null);
			return null;
		} finally {
			setIsCompareLoading(false);
		}
	}, [baseRef, headRef, repoPath]);

	const handleGenerateReview = useCallback(async () => {
		if (!repoPath) {
			setReportError("No Git project path was provided.");
			return;
		}

		const activeCompare = await loadCompare();
		if (!activeCompare) {
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
			writeCachedReview(activeCompare, nextReport);
		} catch (error) {
			setReportError(getErrorMessage(error));
		} finally {
			setIsGenerating(false);
		}
	}, [baseRef, headRef, loadCompare, repoPath]);

	const handleFindingSelect = useCallback((finding: ReviewFinding) => {
		diffWorkspaceRef.current?.focusLocation({
			filePath: finding.file_path,
			newStart: finding.new_start ?? null,
			oldStart: finding.old_start ?? null,
		});
	}, []);

	const topContent = (
		<div className="space-y-4">
			<div className="rounded-[22px] border border-border-strong bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
						<div className="grid gap-4 md:grid-cols-2 xl:min-w-[32rem]">
							<label className="flex flex-col gap-2">
								<span className="workspace-section-label">Base Branch</span>
								<Combobox
									options={branchOptions}
									value={baseRef}
									onSelect={handleBaseRefChange}
									disabled={branchOptions.length === 0 || isRepoLoading}
									placeholder="Select base branch"
								/>
							</label>

							<label className="flex flex-col gap-2">
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

						<div className="flex flex-wrap items-center gap-2">
							<Button
								variant="toolbar"
								size="sm"
								onClick={() => void loadCompare()}
								disabled={
									!repoPath ||
									!baseRef ||
									!headRef ||
									isCompareLoading ||
									isGenerating
								}
							>
								{isCompareLoading ? (
									<>
										<Loader2 className="size-4 animate-spin" />
										Loading diff
									</>
								) : (
									"Load diff"
								)}
							</Button>
							<Button
								variant="accent"
								size="sm"
								onClick={() => void handleGenerateReview()}
								disabled={
									!repoPath ||
									!baseRef ||
									!headRef ||
									isCompareLoading ||
									isGenerating
								}
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
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
						<span className="rounded-full border border-border-subtle bg-control px-2.5 py-1">
							<span className="text-text-tertiary">Base:</span>{" "}
							<span className="font-mono text-text-primary">
								{compare?.base_ref || baseRef || "Not selected"}
							</span>
						</span>
						<span className="rounded-full border border-border-subtle bg-control px-2.5 py-1">
							<span className="text-text-tertiary">Head:</span>{" "}
							<span className="font-mono text-text-primary">
								{compare?.head_ref || headRef || "Not selected"}
							</span>
						</span>
						<span className="rounded-full border border-border-subtle bg-control px-2.5 py-1">
							<span className="text-text-tertiary">Merge Base:</span>{" "}
							<span className="font-mono text-text-primary">
								{compare?.merge_base_sha
									? compare.merge_base_sha.slice(0, 8)
									: "Pending"}
							</span>
						</span>
						<span className="rounded-full border border-border-subtle bg-control px-2.5 py-1">
							<span className="text-text-tertiary">Files:</span>{" "}
							<span className="font-mono text-text-primary">
								{compare?.stats.files_changed ?? 0}
							</span>
						</span>
						<span className="rounded-full border border-border-subtle bg-control px-2.5 py-1">
							<span className="text-text-tertiary">Additions:</span>{" "}
							<span className="font-mono text-text-primary">
								{compare?.stats.additions ?? 0}
							</span>
						</span>
						<span className="rounded-full border border-border-subtle bg-control px-2.5 py-1">
							<span className="text-text-tertiary">Deletions:</span>{" "}
							<span className="font-mono text-text-primary">
								{compare?.stats.deletions ?? 0}
							</span>
						</span>
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
				</div>
			</div>

			{reportError ? <InlineBanner tone="danger" title={reportError} /> : null}

			{report ? (
				<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
					<section className="rounded-[20px] border border-border-subtle bg-[rgba(255,255,255,0.028)] p-4">
						<div className="flex items-center justify-between gap-3">
							<div className="workspace-section-label">AI Summary</div>
							<div className="flex items-center gap-2">
								{report.partial ? (
									<StatusPill tone="warning">Partial</StatusPill>
								) : null}
								<span className="text-xs text-text-tertiary">
									Generated {formatGeneratedAt(report.generated_at)}
								</span>
							</div>
						</div>
						<div className="mt-3 text-sm leading-6 text-text-secondary">
							<MarkdownRenderer content={report.summary} />
						</div>
					</section>

					<section className="rounded-[20px] border border-border-subtle bg-[rgba(255,255,255,0.028)] p-4">
						<div className="flex items-center justify-between gap-3">
							<div className="workspace-section-label">Findings</div>
							<div className="font-mono text-xs text-text-tertiary">
								{report.findings.length}
							</div>
						</div>
						<div className="mt-3 space-y-3">
							{report.findings.length > 0 ? (
								report.findings.map((finding) => (
									<button
										key={finding.id}
										type="button"
										className="w-full rounded-[16px] border border-border-subtle bg-control/50 px-3 py-3 text-left transition-colors hover:border-border-strong hover:bg-control"
										onClick={() => handleFindingSelect(finding)}
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
											{finding.new_start != null
												? ` @ new:${finding.new_start}`
												: ""}
											{finding.old_start != null
												? ` old:${finding.old_start}`
												: ""}
										</div>
										<div className="mt-2 text-sm leading-6 text-text-secondary">
											<p className="whitespace-pre-wrap">
												{finding.body}
											</p>
										</div>
									</button>
								))
							) : (
								<div className="rounded-[16px] border border-dashed border-border-subtle px-3 py-4 text-sm text-text-secondary">
									No structured findings were generated for this diff.
								</div>
							)}
						</div>
					</section>
				</div>
			) : null}
		</div>
	);

	return (
		<div className="workspace-shell">
			<div className="flex h-screen flex-col overflow-hidden">
				<div className="px-4 pt-4">
					<CommitToolbar
						repoPath={repoPath}
						detailLabel="Review"
						onExit={() => navigate(repoPath ? buildRepoRoute(repoPath) : "/")}
						onCollapseAll={
							compare?.file_changes?.length
								? () => diffWorkspaceRef.current?.collapseAll()
								: undefined
						}
					/>
				</div>

				<div className="min-h-0 flex-1 px-4 pb-4 pt-4">
					<DiffWorkspace
						ref={diffWorkspaceRef}
						repoPath={repoPath}
						viewerId={
							compare
								? `review:${compare.merge_base_sha}:${compare.base_ref}:${compare.head_ref}`
								: "review"
						}
						files={compare?.file_changes ?? []}
						isLoading={isCompareLoading}
						error={!repoPath ? "No Git project path was provided." : compareError}
						topContent={topContent}
						searchInputId="review-search-input"
						emptyTitle="Select two local branches, then load the diff."
						emptyDescription="Review mode compares merge-base(base, head)...head directly from the live Git repository."
					/>
				</div>
			</div>
		</div>
	);
}
