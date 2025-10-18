import { useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { DiffEditor } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { MarkdownRenderer } from "@/components/ui/custom/MarkdownRenderer";
import type { Commit, FileChange, FileHunk } from "@/lib/definitions/repo";
import { formatHunkLabel, inferLanguage } from "@/lib/diff";

type SummaryState = { loading: boolean; text?: string; error?: string };

type CommitFilePanelProps = {
	owner?: string;
	repoName?: string;
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
};

export function CommitFilePanel({
	owner,
	repoName,
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
}: CommitFilePanelProps) {
	const diffEditorsRef = useRef<
		Record<string, MonacoEditor.IStandaloneDiffEditor | undefined>
	>({});
	const pendingScrollRef = useRef<
		Record<string, { side: "original" | "modified"; line: number } | undefined>
	>({});

	const diffOptions = useMemo(
		() => ({
			readOnly: true,
			renderSideBySide: true,
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			automaticLayout: true,
			wordWrap: "on" as const,
		}),
		[]
	);

	const status = (fileChange.status || "").toLowerCase();
	let original = "";
	let modified = "";
	if (status === "added" || status === "copy" || status === "copied") {
		original = "";
		modified = fileChange.snapshot?.content || "";
	} else if (status === "deleted") {
		original = fileChange.snapshot?.content || "";
		modified = "";
	} else {
		original = fileChange.snapshot?.previous_snapshot?.content || "";
		modified = fileChange.snapshot?.content || "";
	}

	const labelPath = fileChange.new_path || "unknown";
	const originalModelPath = `file://${owner}/${repoName}/${commit.sha}/${labelPath}?side=original`;
	const modifiedModelPath = `file://${owner}/${repoName}/${commit.sha}/${labelPath}?side=modified`;
	const summaryLoading = Boolean(fileSummary?.loading);

	return (
		<div className="rounded-lg border border-white/10 bg-black/30">
			<div className="flex items-center justify-between px-3 py-2 border-b border-white/10 text-white/80">
				<button
					type="button"
					className="flex items-center gap-2 !p-0 !bg-transparent"
					onClick={onToggleExpanded}
				>
					<span className="rounded" title={isExpanded ? "Collapse" : "Expand"}>
						<ChevronRight
							className={`w-4 h-4 text-white/70 transform transition-transform ${isExpanded ? "rotate-90" : "rotate-0"}`}
						/>
					</span>
					<span className="text-xs px-1.5 py-0.5 rounded bg-white/10 border border-white/20 uppercase">
						{status || "modified"}
					</span>
					<span className="text-sm font-mono">{labelPath}</span>
				</button>
				<div className="flex items-center gap-2">
					<Button
						size="sm"
						className="bg-white/10 hover:bg-white/20 border border-white/20 text-white"
						disabled={
							summaryLoading || (!fileSummary?.text && fileChange.id == null)
						}
						onClick={(e) => {
							e.stopPropagation();
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
								<Loader2 className="w-4 h-4 animate-spin" />
								<span className="text-xs">Summarizing…</span>
							</>
						) : fileSummary?.text ? (
							<>
								{isFileSummaryOpen ? (
									<ChevronDown className="w-4 h-4" />
								) : (
									<ChevronRight className="w-4 h-4" />
								)}
								<span className="text-xs">
									{isFileSummaryOpen ? "Hide Summary" : "View Summary"}
								</span>
							</>
						) : (
							<>
								<Sparkles className="w-4 h-4" />
								<span className="text-xs">Summarize</span>
							</>
						)}
					</Button>
				</div>
			</div>

			{isFileSummaryOpen && (fileSummary?.text || fileSummary?.error) && (
				<div className="px-3 py-2 border-b border-white/10 bg-white/5">
					{fileSummary?.error && (
						<div className="text-xs text-red-400">{fileSummary.error}</div>
					)}
					{fileSummary?.text && <MarkdownRenderer content={fileSummary.text} />}
				</div>
			)}

			{isExpanded && (
				<div style={{ height: 420 }}>
					<DiffEditor
						original={original}
						modified={modified}
						language={inferLanguage(labelPath)}
						theme="vs-dark"
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
			)}

			{fileChange.hunks && fileChange.hunks.length > 0 && (
				<div className="px-3 py-2 border-t border-white/10 bg-white/5">
					<div className="text-xs uppercase tracking-wide text-white/60 mb-2">
						Hunks
					</div>
					<div className="flex flex-col gap-2">
						{fileChange.hunks.map((hunk) => {
							const hKey = hunk.id != null ? String(hunk.id) : undefined;
							const hState = hKey ? hunkSummaries[hKey] : undefined;
							const hOpen = hKey ? (hunkSummaryOpen[hKey] ?? false) : false;
							const label = formatHunkLabel(hunk);
							const handleJump = () => {
								const statusLower = (fileChange.status || "").toLowerCase();
								const side: "original" | "modified" =
									statusLower === "deleted" ? "original" : "modified";
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
									key={`${commit.sha}-${labelPath}-${label}-${hKey ?? Math.random()}`}
									className="rounded border border-white/10 bg-black/30"
								>
									<div className="flex items-center justify-between px-2 py-1 text-white/80">
										<button
											type="button"
											className="flex items-center gap-2 !p-0 !bg-transparent"
											onClick={handleJump}
											title="Jump to hunk in diff"
										>
											<span
												className="text-xs font-mono bg-white/10 border border-white/20 px-1.5 py-0.5 rounded"
												title="Hunk range"
											>
												{label}
											</span>
										</button>
										<div className="flex items-center gap-2">
											<Button
												size="sm"
												className="!bg-transparent hover:bg-white/20 border border-white/20 text-white"
												disabled={hState?.loading || hKey == null}
												onClick={(e) => {
													e.stopPropagation();
													if (!hKey) return;
													if (hState?.text) onToggleHunkSummary(hKey);
													else onSummarizeHunk(hunk);
												}}
												title={
													hState?.text
														? hOpen
															? "Hide hunk summary"
															: "View hunk summary"
														: hKey == null
															? "Hunk ID not available"
															: "Summarize hunk"
												}
											>
												{hState?.loading ? (
													<>
														<Loader2 className="w-4 h-4 animate-spin" />
														<span className="text-xs">Summarizing…</span>
													</>
												) : hState?.text ? (
													<>
														{hOpen ? (
															<ChevronDown className="w-4 h-4" />
														) : (
															<ChevronRight className="w-4 h-4" />
														)}
														<span className="text-xs">
															{hOpen ? "Hide Summary" : "View Summary"}
														</span>
													</>
												) : (
													<>
														<Sparkles className="w-4 h-4" />
														<span className="text-xs">Summarize</span>
													</>
												)}
											</Button>
										</div>
									</div>
									{hOpen && (hState?.text || hState?.error) && (
										<div className="px-3 py-2 border-t border-white/10 bg-white/5">
											{hState?.error && (
												<div className="text-xs text-red-400">
													{hState.error}
												</div>
											)}
											{hState?.text && (
												<MarkdownRenderer content={hState.text} />
											)}
										</div>
									)}
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}

export default CommitFilePanel;
