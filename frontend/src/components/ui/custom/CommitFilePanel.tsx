import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import {
	ChevronDown,
	ChevronRight,
	Loader2,
	Maximize2,
	Minimize2,
	Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { InlineBanner } from "@/components/ui/inline-banner";
import { MarkdownRenderer } from "@/components/ui/custom/MarkdownRenderer";
import { StatusPill } from "@/components/ui/status-pill";
import {
	findClosestHunk,
	formatHunkLabel,
	getDiffStatusLabel,
	getDiffStatusTone,
	getFileChangeLabelPath,
	inferLanguage,
	normalizeDiffFileStatus,
	type DiffNavigationTarget,
} from "@/lib/diff";
import type { FileChange, FileHunk } from "@/lib/definitions/repo";
import { registerGitOdysseyMonacoTheme } from "@/lib/monacoTheme";
import { buildMonacoModelUri } from "@/lib/repoPaths";
import { cn } from "@/lib/utils";

type SummaryState = { loading: boolean; text?: string; error?: string };

type CommitFilePanelProps = {
	repoPath?: string | null;
	viewerId: string;
	fileChange: FileChange;
	isExpanded: boolean;
	onToggleExpanded: () => void;
	fileSummary?: SummaryState;
	isFileSummaryOpen?: boolean;
	onToggleFileSummary?: () => void;
	onSummarizeFile?: () => void;
	hunkSummaries?: Record<string, SummaryState>;
	hunkSummaryOpen?: Record<string, boolean>;
	onToggleHunkSummary?: (hunkId: string) => void;
	onSummarizeHunk?: (hunk: FileHunk) => void;
	isSelected?: boolean;
	navigationTarget?: DiffNavigationTarget | null;
	onNavigationTargetHandled?: () => void;
};

function getHunkAnchorKey(hunk: FileHunk, index: number): string {
	return hunk.id != null
		? `id:${hunk.id}`
		: `range:${index}:${hunk.old_start}:${hunk.new_start}`;
}

export function CommitFilePanel({
	repoPath,
	viewerId,
	fileChange,
	isExpanded,
	onToggleExpanded,
	fileSummary,
	isFileSummaryOpen = false,
	onToggleFileSummary,
	onSummarizeFile,
	hunkSummaries = {},
	hunkSummaryOpen = {},
	onToggleHunkSummary,
	onSummarizeHunk,
	isSelected = false,
	navigationTarget = null,
	onNavigationTargetHandled,
}: CommitFilePanelProps) {
	const diffEditorsRef = useRef<
		Record<string, MonacoEditor.IStandaloneDiffEditor | undefined>
	>({});
	const pendingScrollRef = useRef<
		Record<string, { side: "original" | "modified"; line: number } | undefined>
	>({});
	const hunkRefs = useRef<Record<string, HTMLDivElement | null>>({});
	const [isViewerExpanded, setIsViewerExpanded] = useState(false);

	const diffOptions = useMemo(
		() => ({
			readOnly: true,
			renderSideBySide: true,
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			automaticLayout: true,
			wordWrap: "on" as const,
			fontSize: 12,
			fontFamily: "IBM Plex Mono",
			lineDecorationsWidth: 8,
			glyphMargin: false,
			renderOverviewRuler: false,
			overviewRulerBorder: false,
			scrollbar: {
				verticalScrollbarSize: 10,
				horizontalScrollbarSize: 10,
			},
			padding: {
				top: 14,
				bottom: 14,
			},
		}),
		[],
	);

	const status = normalizeDiffFileStatus(fileChange.status);
	let original = "";
	let modified = "";
	if (status === "added") {
		original = "";
		modified = fileChange.snapshot?.content || "";
	} else if (status === "deleted") {
		original = fileChange.snapshot?.content || "";
		modified = "";
	} else {
		original = fileChange.snapshot?.previous_snapshot?.content || "";
		modified = fileChange.snapshot?.content || "";
	}

	const labelPath = getFileChangeLabelPath(fileChange);
	const originalModelPath = buildMonacoModelUri(
		repoPath ?? "",
		viewerId,
		labelPath,
		"original",
	);
	const modifiedModelPath = buildMonacoModelUri(
		repoPath ?? "",
		viewerId,
		labelPath,
		"modified",
	);
	const summaryLoading = Boolean(fileSummary?.loading);
	const diffHeight = isViewerExpanded
		? "max(440px, calc(100dvh - var(--header-height) - 12rem))"
		: 440;
	const canShowFileSummaryControls = Boolean(
		onToggleFileSummary || onSummarizeFile || fileSummary?.text || fileSummary?.error,
	);
	const hunkList = useMemo(() => fileChange.hunks || [], [fileChange.hunks]);

	const revealHunk = useCallback(
		(hunk: FileHunk) => {
			const side: "original" | "modified" =
				status === "deleted" ? "original" : "modified";
			const line = side === "original" ? hunk.old_start : hunk.new_start;
			const editor = diffEditorsRef.current[labelPath];
			if (editor) {
				const target =
					side === "original"
						? editor.getOriginalEditor()
						: editor.getModifiedEditor();
				target?.revealLineInCenter(line);
				target?.setPosition({ lineNumber: line, column: 1 });
				target?.focus();
			} else {
				pendingScrollRef.current[labelPath] = { side, line };
			}
		},
		[labelPath, status],
	);

	useEffect(() => {
		if (!navigationTarget || !isExpanded) {
			return;
		}

		if (hunkList.length === 0) {
			onNavigationTargetHandled?.();
			return;
		}

		const closestHunk = findClosestHunk(hunkList, navigationTarget);
		if (!closestHunk) {
			onNavigationTargetHandled?.();
			return;
		}

		const hunkIndex = hunkList.findIndex((candidate) => candidate === closestHunk);
		const anchorKey = getHunkAnchorKey(closestHunk, Math.max(hunkIndex, 0));

		revealHunk(closestHunk);
		window.requestAnimationFrame(() => {
			hunkRefs.current[anchorKey]?.scrollIntoView({
				behavior: "smooth",
				block: "center",
			});
		});
		onNavigationTargetHandled?.();
	}, [
		hunkList,
		isExpanded,
		navigationTarget,
		onNavigationTargetHandled,
		revealHunk,
	]);

	return (
		<section
			className={cn(
				"workspace-panel overflow-hidden transition-[border-color,box-shadow] duration-150",
				isSelected &&
					"border-[rgba(122,162,255,0.42)] shadow-[0_0_0_1px_rgba(122,162,255,0.18)]",
			)}
		>
			<div className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
				<button
					type="button"
					className="flex min-w-0 items-start gap-3 text-left"
					onClick={onToggleExpanded}
				>
					<span className="mt-0.5 flex size-6 items-center justify-center rounded-[8px] border border-border-subtle bg-control text-text-tertiary">
						{isExpanded ? (
							<ChevronDown className="size-4" />
						) : (
							<ChevronRight className="size-4" />
						)}
					</span>
					<div className="min-w-0 space-y-1">
						<div className="flex flex-wrap items-center gap-2">
							<StatusPill
								tone={getDiffStatusTone(status)}
								className="uppercase"
							>
								{getDiffStatusLabel(status)}
							</StatusPill>
							<span className="truncate font-mono text-xs text-text-secondary">
								{labelPath}
							</span>
						</div>
					</div>
				</button>

				<div className="flex items-center gap-2">
					<Button
						variant="toolbar"
						size="toolbar-icon"
						aria-pressed={isViewerExpanded}
						onClick={(event) => {
							event.stopPropagation();
							if (!isExpanded) onToggleExpanded();
							setIsViewerExpanded((prev) => !prev);
						}}
						title={
							isViewerExpanded
								? "Restore diff viewer size"
								: "Expand diff viewer"
						}
					>
						{isViewerExpanded ? (
							<Minimize2 className="size-4" />
						) : (
							<Maximize2 className="size-4" />
						)}
						<span className="sr-only">
							{isViewerExpanded
								? "Restore diff viewer size"
								: "Expand diff viewer"}
						</span>
					</Button>

					{canShowFileSummaryControls ? (
						<Button
							variant={fileSummary?.text ? "toolbar" : "subtle"}
							size="sm"
							disabled={
								summaryLoading ||
								(!fileSummary?.text && typeof onSummarizeFile !== "function")
							}
							onClick={(event) => {
								event.stopPropagation();
								if (fileSummary?.text) onToggleFileSummary?.();
								else onSummarizeFile?.();
							}}
							title={
								fileSummary?.text
									? isFileSummaryOpen
										? "Hide summary"
										: "View summary"
									: typeof onSummarizeFile !== "function"
										? "File summaries are unavailable for this diff"
										: "Summarize file change"
							}
						>
							{summaryLoading ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Summarizing
								</>
							) : fileSummary?.text ? (
								<>
									{isFileSummaryOpen ? (
										<ChevronDown className="size-4" />
									) : (
										<ChevronRight className="size-4" />
									)}
									Summary
								</>
							) : (
								<>
									<Sparkles className="size-4" />
									Summarize
								</>
							)}
						</Button>
					) : null}
				</div>
			</div>

			{canShowFileSummaryControls &&
			isFileSummaryOpen &&
			(fileSummary?.text || fileSummary?.error) ? (
				<div className="space-y-3 border-b border-border-subtle bg-[rgba(255,255,255,0.02)] px-4 py-4">
					{fileSummary?.error ? (
						<InlineBanner tone="danger" title={fileSummary.error} />
					) : null}
					{fileSummary?.text ? (
						<MarkdownRenderer content={fileSummary.text} />
					) : null}
				</div>
			) : null}

			{isExpanded ? (
				<div
					className="border-b border-border-subtle bg-[rgba(13,15,16,0.36)]"
					style={{ height: diffHeight }}
				>
					<DiffEditor
						original={original}
						modified={modified}
						language={inferLanguage(labelPath)}
						theme="git-odyssey-dark"
						beforeMount={registerGitOdysseyMonacoTheme}
						originalModelPath={originalModelPath}
						modifiedModelPath={modifiedModelPath}
						options={diffOptions}
						onMount={(editor) => {
							diffEditorsRef.current[labelPath] =
								editor as unknown as MonacoEditor.IStandaloneDiffEditor;
							const pending = pendingScrollRef.current[labelPath];
							if (pending) {
								const targetEditor =
									pending.side === "original"
										? editor.getOriginalEditor()
										: editor.getModifiedEditor();
								targetEditor?.revealLineInCenter(pending.line);
								pendingScrollRef.current[labelPath] = undefined;
							}
						}}
					/>
				</div>
			) : null}

			{hunkList.length ? (
				<div className="space-y-2 px-4 py-4">
					<div className="workspace-section-label">Hunks</div>
					{hunkList.map((hunk, index) => {
						const hKey = hunk.id != null ? String(hunk.id) : undefined;
						const hState = hKey ? hunkSummaries[hKey] : undefined;
						const hOpen = hKey ? (hunkSummaryOpen[hKey] ?? false) : false;
						const label = formatHunkLabel(hunk);
						const anchorKey = getHunkAnchorKey(hunk, index);
						const canShowHunkSummaryControls = Boolean(
							hKey &&
								(onToggleHunkSummary ||
									onSummarizeHunk ||
									hState?.text ||
									hState?.error),
						);

						return (
							<div
								key={`${viewerId}-${labelPath}-${anchorKey}`}
								ref={(node) => {
									hunkRefs.current[anchorKey] = node;
								}}
								className="rounded-[12px] border border-border-subtle bg-control/40"
							>
								<div className="flex items-center justify-between gap-3 px-3 py-2.5">
									<button
										type="button"
										className="font-mono text-xs text-text-secondary transition-colors hover:text-text-primary"
										onClick={() => revealHunk(hunk)}
										title="Jump to hunk in diff"
									>
										{label}
									</button>

									{canShowHunkSummaryControls ? (
										<Button
											variant={hState?.text ? "toolbar" : "ghost"}
											size="sm"
											disabled={
												Boolean(hState?.loading) ||
												(hState?.text
													? typeof onToggleHunkSummary !== "function"
													: typeof onSummarizeHunk !== "function")
											}
											onClick={(event) => {
												event.stopPropagation();
												if (!hKey) return;
												if (hState?.text) onToggleHunkSummary?.(hKey);
												else onSummarizeHunk?.(hunk);
											}}
										>
											{hState?.loading ? (
												<>
													<Loader2 className="size-4 animate-spin" />
													Summarizing
												</>
											) : hState?.text ? (
												<>
													{hOpen ? (
														<ChevronDown className="size-4" />
													) : (
														<ChevronRight className="size-4" />
													)}
													Summary
												</>
											) : (
												<>
													<Sparkles className="size-4" />
													Summarize
												</>
											)}
										</Button>
									) : null}
								</div>

								{canShowHunkSummaryControls &&
								hOpen &&
								(hState?.text || hState?.error) ? (
									<div className="space-y-3 border-t border-border-subtle px-3 py-3">
										{hState?.error ? (
											<InlineBanner tone="danger" title={hState.error} />
										) : null}
										{hState?.text ? (
											<MarkdownRenderer content={hState.text} />
										) : null}
									</div>
								) : null}
							</div>
						);
					})}
				</div>
			) : null}
		</section>
	);
}

export default CommitFilePanel;
