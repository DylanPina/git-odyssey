import { useMemo, useRef, useState } from "react";
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
import { cn } from "@/lib/utils";
import type { Commit, FileChange, FileHunk } from "@/lib/definitions/repo";
import {
	formatHunkLabel,
	getDiffStatusLabel,
	getDiffStatusTone,
	getFileChangeLabelPath,
	inferLanguage,
	normalizeDiffFileStatus,
} from "@/lib/diff";
import { registerGitOdysseyMonacoTheme } from "@/lib/monacoTheme";
import { buildMonacoModelUri } from "@/lib/repoPaths";

type SummaryState = { loading: boolean; text?: string; error?: string };

type CommitFilePanelProps = {
	repoPath?: string | null;
	commit: Commit;
	fileChange: FileChange;
	isExpanded: boolean;
	onToggleExpanded: () => void;
	fileSummary: SummaryState | undefined;
	isFileSummaryOpen: boolean;
	onToggleFileSummary: () => void;
	onSummarizeFile: () => void;
	hunkSummaries: Record<string, SummaryState>;
	hunkSummaryOpen: Record<string, boolean>;
	onToggleHunkSummary: (hunkId: string) => void;
	onSummarizeHunk: (hunk: FileHunk) => void;
	isSelected?: boolean;
};

export function CommitFilePanel({
	repoPath,
	commit,
	fileChange,
	isExpanded,
	onToggleExpanded,
	fileSummary,
	isFileSummaryOpen,
	onToggleFileSummary,
	onSummarizeFile,
	hunkSummaries,
	hunkSummaryOpen,
	onToggleHunkSummary,
	onSummarizeHunk,
	isSelected = false,
}: CommitFilePanelProps) {
	const diffEditorsRef = useRef<
		Record<string, MonacoEditor.IStandaloneDiffEditor | undefined>
	>({});
	const pendingScrollRef = useRef<
		Record<string, { side: "original" | "modified"; line: number } | undefined>
	>({});
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
		repoPath ?? commit.repo_path,
		commit.sha,
		labelPath,
		"original",
	);
	const modifiedModelPath = buildMonacoModelUri(
		repoPath ?? commit.repo_path,
		commit.sha,
		labelPath,
		"modified",
	);
	const summaryLoading = Boolean(fileSummary?.loading);
	const diffHeight = isViewerExpanded
		? "max(440px, calc(100dvh - var(--header-height) - 12rem))"
		: 440;

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

					<Button
						variant={fileSummary?.text ? "toolbar" : "subtle"}
						size="sm"
						disabled={
							summaryLoading || (!fileSummary?.text && fileChange.id == null)
						}
						onClick={(event) => {
							event.stopPropagation();
							if (fileSummary?.text) onToggleFileSummary();
							else onSummarizeFile();
						}}
						title={
							fileSummary?.text
								? isFileSummaryOpen
									? "Hide summary"
									: "View summary"
								: fileChange.id == null
									? "File change ID not available"
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
				</div>
			</div>

			{isFileSummaryOpen && (fileSummary?.text || fileSummary?.error) ? (
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

			{fileChange.hunks?.length ? (
				<div className="space-y-2 px-4 py-4">
					<div className="workspace-section-label">Hunks</div>
					{fileChange.hunks.map((hunk) => {
						const hKey = hunk.id != null ? String(hunk.id) : undefined;
						const hState = hKey ? hunkSummaries[hKey] : undefined;
						const hOpen = hKey ? (hunkSummaryOpen[hKey] ?? false) : false;
						const label = formatHunkLabel(hunk);

						const handleJump = () => {
							const side: "original" | "modified" =
								status === "deleted" ? "original" : "modified";
							const line =
								side === "original" ? hunk.old_start : hunk.new_start;
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
						};

						return (
							<div
								key={`${commit.sha}-${labelPath}-${label}-${hKey ?? label}`}
								className="rounded-[12px] border border-border-subtle bg-control/40"
							>
								<div className="flex items-center justify-between gap-3 px-3 py-2.5">
									<button
										type="button"
										className="font-mono text-xs text-text-secondary transition-colors hover:text-text-primary"
										onClick={handleJump}
										title="Jump to hunk in diff"
									>
										{label}
									</button>
									<Button
										variant={hState?.text ? "toolbar" : "ghost"}
										size="sm"
										disabled={hState?.loading || hKey == null}
										onClick={(event) => {
											event.stopPropagation();
											if (!hKey) return;
											if (hState?.text) onToggleHunkSummary(hKey);
											else onSummarizeHunk(hunk);
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
								</div>

								{hOpen && (hState?.text || hState?.error) ? (
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
