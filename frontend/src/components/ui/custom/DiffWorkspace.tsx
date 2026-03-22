import {
	forwardRef,
	useCallback,
	useDeferredValue,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { Check, Search, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CommitFilePanel } from "@/components/ui/custom/CommitFilePanel";
import { CommitFileTree } from "@/components/ui/custom/CommitFileTree";
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
import {
	fileChangeMatchesQuery,
	getFileChangeLabelPath,
	type DiffNavigationTarget,
	type DiffSearchScope,
} from "@/lib/diff";
import type { FileChange, FileHunk } from "@/lib/definitions/repo";

const SEARCH_SCOPES: Array<{ value: DiffSearchScope; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "files", label: "Files" },
	{ value: "code", label: "Code" },
];

type SummaryState = { loading: boolean; text?: string; error?: string };

export type DiffWorkspaceHandle = {
	collapseAll: () => void;
	focusLocation: (target: {
		filePath: string;
		newStart?: number | null;
		oldStart?: number | null;
	}) => void;
};

type DiffWorkspaceSummaryActions = {
	fileSummaries: Record<string, SummaryState>;
	summaryOpen: Record<string, boolean>;
	onToggleFileSummary: (summaryKey: string) => void;
	onSummarizeFile: (fileChange: FileChange) => void;
	hunkSummaries: Record<string, SummaryState>;
	hunkSummaryOpen: Record<string, boolean>;
	onToggleHunkSummary: (hunkKey: string) => void;
	onSummarizeHunk: (hunk: FileHunk) => void;
};

type DiffWorkspaceProps = {
	repoPath?: string | null;
	viewerId: string;
	files: FileChange[];
	isLoading?: boolean;
	error?: string | null;
	topContent?: ReactNode;
	searchInputId: string;
	searchPlaceholder?: string;
	emptyTitle: string;
	emptyDescription?: string;
	summaryActions?: DiffWorkspaceSummaryActions;
};

function focusSearchInput(inputId: string) {
	const input = document.getElementById(inputId);
	if (input instanceof HTMLInputElement) {
		input.focus();
		input.select();
	}
}

export const DiffWorkspace = forwardRef<DiffWorkspaceHandle, DiffWorkspaceProps>(
	function DiffWorkspace(
		{
			repoPath,
			viewerId,
			files,
			isLoading = false,
			error = null,
			topContent,
			searchInputId,
			searchPlaceholder = "Search changed files and code",
			emptyTitle,
			emptyDescription,
			summaryActions,
		},
		ref,
	) {
		const [query, setQuery] = useState("");
		const deferredQuery = useDeferredValue(query);
		const [searchScope, setSearchScope] = useState<DiffSearchScope>("all");
		const [isScopeMenuOpen, setIsScopeMenuOpen] = useState(false);
		const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
		const [expanded, setExpanded] = useState<Record<string, boolean>>({});
		const [navigationTarget, setNavigationTarget] =
			useState<DiffNavigationTarget | null>(null);
		const diffListScrollRef = useRef<HTMLDivElement | null>(null);
		const fileSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

		const normalizedQuery = deferredQuery.trim();
		const filteredFiles = useMemo(
			() =>
				files.filter((fileChange) =>
					fileChangeMatchesQuery(fileChange, normalizedQuery, searchScope),
				),
			[files, normalizedQuery, searchScope],
		);

		useEffect(() => {
			const nextExpanded: Record<string, boolean> = {};
			files.forEach((fileChange) => {
				nextExpanded[getFileChangeLabelPath(fileChange)] = true;
			});
			setExpanded(nextExpanded);
		}, [files, viewerId]);

		useEffect(() => {
			setQuery("");
			setSearchScope("all");
			setIsScopeMenuOpen(false);
			setSelectedFilePath(null);
			setNavigationTarget(null);
			fileSectionRefs.current = {};
		}, [viewerId]);

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
					focusSearchInput(searchInputId);
				});
			};

			window.addEventListener("keydown", handleKeyDown);
			return () => window.removeEventListener("keydown", handleKeyDown);
		}, [searchInputId]);

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

		const scrollToFile = useCallback((path: string) => {
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
		}, []);

		const handleSelectFile = useCallback(
			(path: string) => {
				setSelectedFilePath(path);
				setExpanded((prev) => ({
					...prev,
					[path]: true,
				}));

				if (typeof window !== "undefined") {
					window.requestAnimationFrame(() => {
						scrollToFile(path);
					});
					return;
				}

				scrollToFile(path);
			},
			[scrollToFile],
		);

		const resolveFilePath = useCallback(
			(filePath: string) => {
				const match = files.find((fileChange) => {
					const knownPaths = new Set([
						getFileChangeLabelPath(fileChange),
						fileChange.new_path,
						fileChange.old_path,
					]);
					return knownPaths.has(filePath);
				});

				return match ? getFileChangeLabelPath(match) : null;
			},
			[files],
		);

		const collapseAll = useCallback(() => {
			setExpanded((prev) => {
				const next = { ...prev };

				filteredFiles.forEach((fileChange) => {
					next[getFileChangeLabelPath(fileChange)] = false;
				});

				return next;
			});
		}, [filteredFiles]);

		const focusLocation = useCallback(
			(target: {
				filePath: string;
				newStart?: number | null;
				oldStart?: number | null;
			}) => {
				const resolvedPath = resolveFilePath(target.filePath);
				if (!resolvedPath) {
					return;
				}

				setQuery("");
				setSearchScope("all");
				setExpanded((prev) => ({
					...prev,
					[resolvedPath]: true,
				}));
				setNavigationTarget({
					filePath: resolvedPath,
					newStart: target.newStart ?? null,
					oldStart: target.oldStart ?? null,
					token: Date.now(),
				});
				handleSelectFile(resolvedPath);
			},
			[handleSelectFile, resolveFilePath],
		);

		useImperativeHandle(
			ref,
			() => ({
				collapseAll,
				focusLocation,
			}),
			[collapseAll, focusLocation],
		);

		const hasFiles = files.length > 0;

		return (
			<div className="workspace-panel relative flex h-full flex-col overflow-hidden">
				<LoadingOverlay isVisible={Boolean(isLoading)} />

				{topContent ? (
					<div className="border-b border-border-subtle px-4 py-4 sm:px-5">
						{topContent}
					</div>
				) : null}

				{error ? (
					<div className="p-4 sm:p-5">
						<InlineBanner tone="danger" title={error} />
					</div>
				) : hasFiles ? (
					<>
						<div className="border-b border-border-subtle px-4 py-4 sm:px-5">
							<InputGroup className="min-h-14 rounded-[18px] border-border-strong bg-[rgba(13,15,16,0.52)] px-2 shadow-[0_12px_30px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.03)]">
								<InputGroupAddon className="pl-2 sm:pl-3">
									<InputGroupText className="text-text-secondary">
										<Search className="size-4" />
									</InputGroupText>
								</InputGroupAddon>
								<InputGroupInput
									id={searchInputId}
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									placeholder={searchPlaceholder}
									aria-label={searchPlaceholder}
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
																		focusSearchInput(searchInputId);
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

						<div className="min-h-0 flex-1 overflow-hidden p-4 sm:p-5">
							<div className="flex h-full min-h-0 flex-col gap-4 xl:flex-row">
								<CommitFileTree
									files={filteredFiles}
									totalFileCount={files.length}
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

													return (
														<div
															key={`${viewerId}-${labelPath}`}
															ref={(node) => {
																fileSectionRefs.current[labelPath] = node;
															}}
															className="scroll-mt-4"
															onMouseDownCapture={() =>
																setSelectedFilePath(labelPath)
															}
															onFocusCapture={() =>
																setSelectedFilePath(labelPath)
															}
														>
															<CommitFilePanel
																repoPath={repoPath}
																viewerId={viewerId}
																fileChange={fileChange}
																isExpanded={isExpanded}
																onToggleExpanded={() =>
																	setExpanded((prev) => ({
																		...prev,
																		[labelPath]: !(prev[labelPath] ?? true),
																	}))
																}
																fileSummary={
																	summaryActions?.fileSummaries[summaryKey]
																}
																isFileSummaryOpen={
																	summaryActions?.summaryOpen[summaryKey] ?? false
																}
																onToggleFileSummary={
																	summaryActions
																		? () =>
																			summaryActions.onToggleFileSummary(
																				summaryKey,
																			)
																		: undefined
																}
																onSummarizeFile={
																	summaryActions
																		? () =>
																			summaryActions.onSummarizeFile(fileChange)
																		: undefined
																}
																hunkSummaries={
																	summaryActions?.hunkSummaries
																}
																hunkSummaryOpen={
																	summaryActions?.hunkSummaryOpen
																}
																onToggleHunkSummary={
																	summaryActions?.onToggleHunkSummary
																}
																onSummarizeHunk={
																	summaryActions?.onSummarizeHunk
																}
																isSelected={selectedFilePath === labelPath}
																navigationTarget={
																	navigationTarget?.filePath === labelPath
																		? navigationTarget
																		: null
																}
																onNavigationTargetHandled={() =>
																	setNavigationTarget((current) =>
																		current?.filePath === labelPath
																			? null
																			: current,
																	)
																}
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
				) : (
					<div className="p-4 sm:p-5">
						<InlineBanner
							tone="info"
							title={emptyTitle}
							description={emptyDescription}
						/>
					</div>
				)}
			</div>
		);
	},
);

DiffWorkspace.displayName = "DiffWorkspace";

export default DiffWorkspace;
