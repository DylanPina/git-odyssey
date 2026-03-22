import {
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Check, Search, SlidersHorizontal, X } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";

import { Button } from "@/components/ui/button";
import { CommitFilePanel } from "@/components/ui/custom/CommitFilePanel";
import { CommitFileTree } from "@/components/ui/custom/CommitFileTree";
import { CommitToolbar } from "@/components/ui/custom/CommitToolbar";
import { LoadingOverlay } from "@/components/ui/custom/LoadingOverlay";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineBanner } from "@/components/ui/inline-banner";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
	InputGroupText,
} from "@/components/ui/input-group";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useCommitDetails } from "@/hooks/useCommitDetails";
import {
	fileChangeMatchesQuery,
	getFileChangeLabelPath,
	type DiffSearchScope,
} from "@/lib/diff";
import { buildRepoRoute, readRepoPathFromSearchParams } from "@/lib/repoPaths";

const SEARCH_SCOPES: Array<{ value: DiffSearchScope; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "files", label: "Files" },
	{ value: "code", label: "Code" },
];

const COMMIT_SEARCH_INPUT_ID = "commit-search-input";

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

function focusCommitSearchInput() {
	const input = document.getElementById(COMMIT_SEARCH_INPUT_ID);
	if (input instanceof HTMLInputElement) {
		input.focus();
		input.select();
	}
}

export function Commit() {
	const { commitSha } = useParams();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const repoPath = readRepoPathFromSearchParams(searchParams);

	const shortSha = useMemo(
		() => (commitSha ? commitSha.slice(0, 8) : ""),
		[commitSha],
	);

	const {
		isLoading,
		error,
		commit: targetCommit,
		expanded,
		setExpanded,
		fileSummaries,
		summaryOpen,
		setSummaryOpen,
		hunkSummaries,
		hunkSummaryOpen,
		setHunkSummaryOpen,
		handleSummarizeFile,
		handleSummarizeHunk,
	} = useCommitDetails({ repoPath, commitSha });

	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query);
	const [searchScope, setSearchScope] = useState<DiffSearchScope>("all");
	const [isScopeMenuOpen, setIsScopeMenuOpen] = useState(false);
	const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
	const diffListScrollRef = useRef<HTMLDivElement | null>(null);
	const fileSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

	const pageError = !repoPath ? "No Git project path was provided." : error;
	const allFiles = useMemo(
		() => targetCommit?.file_changes || [],
		[targetCommit?.file_changes],
	);
	const normalizedQuery = deferredQuery.trim();
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
		} catch (error) {
			console.error("Failed to copy text:", error);
			toast.error(`Failed to copy ${type.toLowerCase()}`, {
				position: "top-right",
				autoClose: 2600,
				theme: "dark",
			});
		}
	}, []);

	useEffect(() => {
		setQuery("");
		setSearchScope("all");
		setIsScopeMenuOpen(false);
		setSelectedFilePath(null);
		fileSectionRefs.current = {};
	}, [targetCommit?.sha]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
				return;
			}

			if (event.key.toLowerCase() !== "k") {
				return;
			}

			event.preventDefault();
			window.requestAnimationFrame(() => {
				focusCommitSearchInput();
			});
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	const filteredFiles = useMemo(
		() =>
			allFiles.filter((fileChange) =>
				fileChangeMatchesQuery(fileChange, normalizedQuery, searchScope),
			),
		[allFiles, normalizedQuery, searchScope],
	);

	useEffect(() => {
		const visiblePaths = filteredFiles.map((fileChange) =>
			getFileChangeLabelPath(fileChange),
		);

		setSelectedFilePath((prev) => {
			if (prev && visiblePaths.includes(prev)) {
				return prev;
			}

			return visiblePaths[0] ?? null;
		});
	}, [filteredFiles]);

	const collapseAll = () => {
		setExpanded((prev) => {
			const next = { ...prev };

			filteredFiles.forEach((fileChange) => {
				next[getFileChangeLabelPath(fileChange)] = false;
			});

			return next;
		});
	};

	const handleSelectFile = (path: string) => {
		setSelectedFilePath(path);
		setExpanded((prev) => ({
			...prev,
			[path]: true,
		}));

		const scrollToFile = () => {
			const container = diffListScrollRef.current;
			const target = fileSectionRefs.current[path];

			if (!container || !target) {
				return;
			}

			const containerRect = container.getBoundingClientRect();
			const targetRect = target.getBoundingClientRect();
			const top = targetRect.top - containerRect.top + container.scrollTop - 12;

			container.scrollTo({
				top: Math.max(0, top),
				behavior: "smooth",
			});
		};

		if (typeof window !== "undefined") {
			window.requestAnimationFrame(scrollToFile);
			return;
		}

		scrollToFile();
	};

	const renderDiffWorkspace = () => {
		if (!targetCommit) return null;

		if (allFiles.length === 0) {
			return (
				<div className="p-4 sm:p-5">
					<InlineBanner
						tone="info"
						title="No file changes in this commit."
						description="This commit does not contain diffable file content."
					/>
				</div>
			);
		}

		return (
			<>
				<div className="border-b border-border-subtle px-4 py-4 sm:px-5">
					<div className="flex flex-col gap-4">
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
											onClick={() =>
												void copyToClipboard(fullSha, "Commit hash")
											}
										>
											<span className="text-text-tertiary">Commit:</span>{" "}
											<span className="font-mono text-[11px]">{fullSha}</span>
										</button>
										<button
											type="button"
											className="rounded-full border border-border-subtle bg-control px-2.5 py-1 text-left text-text-primary transition-[background-color,border-color,color,box-shadow] duration-150 hover:border-border-strong hover:bg-control-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
											title={authorLabel}
											onClick={() =>
												void copyToClipboard(authorLabel, "Author")
											}
										>
											<span className="text-text-tertiary">Author:</span>{" "}
											<span>{authorLabel}</span>
										</button>
										<button
											type="button"
											className="rounded-full border border-border-subtle bg-control px-2.5 py-1 text-left text-text-primary transition-[background-color,border-color,color,box-shadow] duration-150 hover:border-border-strong hover:bg-control-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
											title={formattedTime}
											onClick={() =>
												void copyToClipboard(formattedTime, "Date")
											}
										>
											<span className="text-text-tertiary">Date:</span>{" "}
											<span>{formattedTime}</span>
										</button>
									</div>
								</div>

								<div className="w-full max-w-5xl">
									<InputGroup className="min-h-14 rounded-[18px] border-border-strong bg-[rgba(13,15,16,0.52)] px-2 shadow-[0_12px_30px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.03)]">
										<InputGroupAddon className="pl-2 sm:pl-3">
											<InputGroupText className="text-text-secondary">
												<Search className="size-4" />
											</InputGroupText>
										</InputGroupAddon>
										<InputGroupInput
											id={COMMIT_SEARCH_INPUT_ID}
											value={query}
											onChange={(event) => setQuery(event.target.value)}
											placeholder="Search changed files and code"
											aria-label="Search changed files and code"
											className="px-2 py-4 text-sm"
										/>
										<InputGroupAddon align="inline-end" className="pr-1">
											<div className="flex items-center gap-1">
												{query ? (
													<InputGroupButton
														size="icon-sm"
														aria-label="Clear search query"
														onClick={() => setQuery("")}
													>
														<X className="size-4" />
													</InputGroupButton>
												) : null}

												<Popover
													open={isScopeMenuOpen}
													onOpenChange={setIsScopeMenuOpen}
												>
													<PopoverTrigger asChild>
														<InputGroupButton
															size="icon-sm"
															variant={
																searchScope === "all" ? "ghost" : "accent"
															}
															aria-label="Open search filters"
															title="Search filters"
														>
															<SlidersHorizontal className="size-4" />
														</InputGroupButton>
													</PopoverTrigger>
													<PopoverContent align="end" className="w-64 p-3">
														<div className="workspace-section-label">
															Search Scope
														</div>
														<p className="mt-2 text-sm leading-6 text-text-secondary">
															Choose whether this search matches file names,
															code, or both.
														</p>
														<div className="mt-3 space-y-2">
															{SEARCH_SCOPES.map((scope) => {
																const isSelected = searchScope === scope.value;

																return (
																	<Button
																		key={scope.value}
																		type="button"
																		variant={isSelected ? "accent" : "toolbar"}
																		size="sm"
																		className="w-full justify-between"
																		onClick={() => {
																			setSearchScope(scope.value);
																			setIsScopeMenuOpen(false);
																			window.requestAnimationFrame(() => {
																				focusCommitSearchInput();
																			});
																		}}
																	>
																		{scope.label}
																		{isSelected ? (
																			<Check className="size-4" />
																		) : null}
																	</Button>
																);
															})}
														</div>
													</PopoverContent>
												</Popover>
											</div>
										</InputGroupAddon>
									</InputGroup>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div className="min-h-0 flex-1 overflow-hidden p-4 sm:p-5">
					<div className="flex h-full min-h-0 flex-col gap-4 xl:flex-row">
						<CommitFileTree
							files={filteredFiles}
							totalFileCount={allFiles.length}
							selectedFilePath={selectedFilePath}
							forceExpandAll={normalizedQuery.length > 0}
							onSelectFile={handleSelectFile}
						/>

						<div className="min-h-0 flex-1 overflow-hidden">
							<div
								ref={diffListScrollRef}
								className="workspace-scrollbar h-full min-h-0 overflow-y-auto pr-0 xl:pr-1"
							>
								{filteredFiles.length > 0 ? (
									<div className="space-y-4">
										{filteredFiles.map((fileChange) => {
											const labelPath = getFileChangeLabelPath(fileChange);
											const isExpanded = expanded[labelPath] ?? true;
											const summaryKey =
												fileChange.id != null
													? String(fileChange.id)
													: labelPath;
											const summaryState = fileSummaries[summaryKey];
											const isSummaryOpen = summaryOpen[summaryKey] ?? false;

											return (
												<div
													key={`${targetCommit.sha}-${labelPath}`}
													ref={(node) => {
														fileSectionRefs.current[labelPath] = node;
													}}
													className="scroll-mt-4"
													onMouseDownCapture={() =>
														setSelectedFilePath(labelPath)
													}
													onFocusCapture={() => setSelectedFilePath(labelPath)}
												>
													<CommitFilePanel
														repoPath={repoPath}
														commit={targetCommit}
														fileChange={fileChange}
														isExpanded={isExpanded}
														onToggleExpanded={() =>
															setExpanded((prev) => ({
																...prev,
																[labelPath]: !(prev[labelPath] ?? true),
															}))
														}
														fileSummary={summaryState}
														isFileSummaryOpen={isSummaryOpen}
														onToggleFileSummary={() =>
															setSummaryOpen((prev) => ({
																...prev,
																[summaryKey]: !(prev[summaryKey] ?? false),
															}))
														}
														onSummarizeFile={() =>
															handleSummarizeFile(fileChange)
														}
														hunkSummaries={hunkSummaries}
														hunkSummaryOpen={hunkSummaryOpen}
														onToggleHunkSummary={(hKey) =>
															setHunkSummaryOpen((prev) => ({
																...prev,
																[hKey]: !(prev[hKey] ?? false),
															}))
														}
														onSummarizeHunk={(hunk) =>
															handleSummarizeHunk(hunk)
														}
														isSelected={selectedFilePath === labelPath}
													/>
												</div>
											);
										})}
									</div>
								) : (
									<EmptyState
										icon={<Search className="size-5" />}
										title="No matching files"
										description="Try a broader query or switch the search scope in the file tree."
										className="h-full justify-center"
									/>
								)}
							</div>
						</div>
					</div>
				</div>
			</>
		);
	};

	return (
		<div className="workspace-shell">
			<div className="flex h-screen flex-col overflow-hidden">
				<div className="px-4 pt-4">
					<CommitToolbar
						repoPath={repoPath}
						shortSha={shortSha}
						onExit={() => navigate(repoPath ? buildRepoRoute(repoPath) : "/")}
						onCollapseAll={filteredFiles.length > 0 ? collapseAll : undefined}
					/>
				</div>

				<div className="min-h-0 flex-1 px-4 pb-4 pt-4">
					<div className="workspace-panel relative flex h-full flex-col overflow-hidden">
						<LoadingOverlay isVisible={Boolean(isLoading)} />

						{pageError ? (
							<div className="p-4 sm:p-5">
								<InlineBanner tone="danger" title={pageError} />
							</div>
						) : (
							renderDiffWorkspace()
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

export default Commit;
