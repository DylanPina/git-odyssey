import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import type * as MonacoEditor from "monaco-editor";
import {
	Columns2,
	ChevronDown,
	ChevronRight,
	Loader2,
	Maximize2,
	MessageSquarePlus,
	Minimize2,
	Rows3,
	Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/ui/custom/MarkdownRenderer";
import { InlineBanner } from "@/components/ui/inline-banner";
import { StatusPill } from "@/components/ui/status-pill";
import {
	getFileChangeDiffContents,
	type DiffFileStatus,
	type DiffCodeSearchFileIndex,
	type DiffCodeSearchMatch,
	type DiffNavigationTarget,
	type DiffSelectionContext,
	type DiffSearchHighlightStrategy,
	type DiffViewerSide,
	getDiffStatusLabel,
	getDiffStatusTone,
	getFileChangeLabelPath,
	inferLanguage,
} from "@/lib/diff";
import type { FileChange } from "@/lib/definitions/repo";
import { registerGitOdysseyMonacoTheme } from "@/lib/monacoTheme";
import { buildMonacoModelUri } from "@/lib/repoPaths";
import { cn } from "@/lib/utils";

type SummaryState = { loading: boolean; text?: string; error?: string };
type PendingNavigationState = {
	side: DiffViewerSide;
	line: number;
	highlight?: boolean;
};
type CodeNavigationTarget = DiffCodeSearchMatch & {
	token: number;
	focusEditor?: boolean;
};
type FileContextHighlight = {
	side?: DiffViewerSide;
	line?: number | null;
	highlightStrategy: DiffSearchHighlightStrategy;
};
type DiffMode = "inline" | "side-by-side";

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
	isSelected?: boolean;
	navigationTarget?: DiffNavigationTarget | null;
	onNavigationTargetHandled?: () => void;
	codeSearchIndex?: DiffCodeSearchFileIndex | null;
	activeCodeMatch?: DiffCodeSearchMatch | null;
	codeNavigationTarget?: CodeNavigationTarget | null;
	onCodeNavigationTargetHandled?: () => void;
	searchMatchCount?: number;
	contextHighlight?: FileContextHighlight | null;
	onInjectSelection?: (selection: DiffSelectionContext) => void;
	diffMode?: DiffMode;
	onDiffModeChange?: (mode: DiffMode) => void;
};

function resolveNavigationPosition(
	status: DiffFileStatus,
	target: Pick<DiffNavigationTarget, "newStart" | "oldStart">,
): { side: DiffViewerSide; line: number } | null {
	if (status === "deleted" && target.oldStart != null) {
		return {
			side: "original",
			line: target.oldStart,
		};
	}

	if (target.newStart != null) {
		return {
			side: "modified",
			line: target.newStart,
		};
	}

	if (target.oldStart != null) {
		return {
			side: "original",
			line: target.oldStart,
		};
	}

	return null;
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
	isSelected = false,
	navigationTarget = null,
	onNavigationTargetHandled,
	codeSearchIndex = null,
	activeCodeMatch = null,
	codeNavigationTarget = null,
	onCodeNavigationTargetHandled,
	searchMatchCount = 0,
	contextHighlight = null,
	onInjectSelection,
	diffMode: controlledDiffMode,
	onDiffModeChange,
}: CommitFilePanelProps) {
	const diffEditorsRef = useRef<
		Record<string, MonacoEditor.editor.IStandaloneDiffEditor | undefined>
	>({});
	const pendingScrollRef = useRef<
		Record<string, PendingNavigationState | undefined>
	>({});
	const monacoRef = useRef<typeof MonacoEditor | null>(null);
	const lineHighlightIdsRef = useRef<Record<DiffViewerSide, string[]>>({
		original: [],
		modified: [],
	});
	const searchDecorationIdsRef = useRef<Record<DiffViewerSide, string[]>>({
		original: [],
		modified: [],
	});
	const activeSearchDecorationIdsRef = useRef<Record<DiffViewerSide, string[]>>(
		{
			original: [],
			modified: [],
		},
	);
	const contextDecorationIdsRef = useRef<Record<DiffViewerSide, string[]>>({
		original: [],
		modified: [],
	});
	const lineHighlightTimerRef = useRef<number | null>(null);
	const pendingCodeNavigationRef = useRef<
		Record<string, CodeNavigationTarget | undefined>
	>({});
	const selectionListenerDisposablesRef = useRef<
		Record<string, MonacoEditor.IDisposable[]>
	>({});
	const contextMenuActionDisposablesRef = useRef<
		Record<string, MonacoEditor.IDisposable[]>
	>({});
	const [isViewerExpanded, setIsViewerExpanded] = useState(false);
	const [uncontrolledDiffMode, setUncontrolledDiffMode] =
		useState<DiffMode>("side-by-side");
	const [activeSelection, setActiveSelection] =
		useState<DiffSelectionContext | null>(null);
	const diffMode = controlledDiffMode ?? uncontrolledDiffMode;
	const { status, original, modified } = getFileChangeDiffContents(fileChange);
	const labelPath = getFileChangeLabelPath(fileChange);

	const diffOptions = useMemo(
		() => ({
			readOnly: true,
			renderSideBySide: diffMode === "side-by-side",
			useInlineViewWhenSpaceIsLimited: false,
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			automaticLayout: true,
			wordWrap: "on" as const,
			fontSize: 12,
			fontFamily: "IBM Plex Mono",
			lineDecorationsWidth: 12,
			glyphMargin: false,
			renderOverviewRuler: false,
			overviewRulerBorder: false,
			scrollbar: {
				verticalScrollbarSize: 10,
				horizontalScrollbarSize: 10,
				alwaysConsumeMouseWheel: false,
			},
			padding: {
				top: 14,
				bottom: 14,
			},
		}),
		[diffMode],
	);

	const clearSelectionListeners = useCallback(() => {
		const disposables =
			selectionListenerDisposablesRef.current[labelPath] ?? [];
		disposables.forEach((disposable) => disposable.dispose());
		selectionListenerDisposablesRef.current[labelPath] = [];
	}, [labelPath]);

	const clearContextMenuActions = useCallback(() => {
		const disposables =
			contextMenuActionDisposablesRef.current[labelPath] ?? [];
		disposables.forEach((disposable) => disposable.dispose());
		contextMenuActionDisposablesRef.current[labelPath] = [];
	}, [labelPath]);

	const buildSelectionFromEditor = useCallback(
		(
			editor: MonacoEditor.editor.ICodeEditor,
			side: DiffViewerSide,
		): DiffSelectionContext | null => {
			const model = editor.getModel();
			const selection = editor.getSelection();
			if (!model || !selection || selection.isEmpty()) {
				return null;
			}

			const selectedText = model.getValueInRange(selection);
			if (!selectedText.trim()) {
				return null;
			}

			return {
				filePath: labelPath,
				side,
				startLine: selection.startLineNumber,
				startColumn: selection.startColumn,
				endLine: selection.endLineNumber,
				endColumn: selection.endColumn,
				selectedText,
				language: inferLanguage(labelPath),
			};
		},
		[labelPath],
	);

	const bindSelectionListeners = useCallback(
		(editor: MonacoEditor.editor.IStandaloneDiffEditor) => {
			clearSelectionListeners();

			const originalEditor = editor.getOriginalEditor();
			const modifiedEditor = editor.getModifiedEditor();

			const handleOriginalSelectionChange = () => {
				setActiveSelection(
					buildSelectionFromEditor(originalEditor, "original"),
				);
			};
			const handleModifiedSelectionChange = () => {
				setActiveSelection(
					buildSelectionFromEditor(modifiedEditor, "modified"),
				);
			};

			handleOriginalSelectionChange();
			handleModifiedSelectionChange();

			selectionListenerDisposablesRef.current[labelPath] = [
				originalEditor.onDidChangeCursorSelection(
					handleOriginalSelectionChange,
				),
				modifiedEditor.onDidChangeCursorSelection(
					handleModifiedSelectionChange,
				),
			];
		},
		[buildSelectionFromEditor, clearSelectionListeners, labelPath],
	);

	const registerContextMenuActions = useCallback(
		(editor: MonacoEditor.editor.IStandaloneDiffEditor) => {
			clearContextMenuActions();

			if (!onInjectSelection) {
				return;
			}

			const registerEditorAction = (
				codeEditor: MonacoEditor.editor.IStandaloneCodeEditor,
				side: DiffViewerSide,
			) =>
				codeEditor.addAction({
					id: `git-odyssey.add-selection-to-chat.${side}`,
					label: "Add Selection to Chat",
					contextMenuGroupId: "navigation",
					contextMenuOrder: 3,
					run: (invokedEditor) => {
						const selection = buildSelectionFromEditor(invokedEditor, side);
						if (!selection) {
							return;
						}

						onInjectSelection(selection);
					},
				});

			contextMenuActionDisposablesRef.current[labelPath] = [
				registerEditorAction(editor.getOriginalEditor(), "original"),
				registerEditorAction(editor.getModifiedEditor(), "modified"),
			];
		},
		[
			buildSelectionFromEditor,
			clearContextMenuActions,
			labelPath,
			onInjectSelection,
		],
	);

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
		? "max(400px, calc(var(--app-content-height) - var(--header-height) - 11rem))"
		: 400;
	const canShowFileSummaryControls = Boolean(
		onToggleFileSummary ||
			onSummarizeFile ||
			fileSummary?.text ||
			fileSummary?.error,
	);
	const hunkList = useMemo(() => fileChange.hunks || [], [fileChange.hunks]);

	const clearLineHighlights = useCallback(() => {
		const editor = diffEditorsRef.current[labelPath];
		const originalEditor = editor?.getOriginalEditor();
		const modifiedEditor = editor?.getModifiedEditor();

		if (originalEditor) {
			lineHighlightIdsRef.current.original = originalEditor.deltaDecorations(
				lineHighlightIdsRef.current.original,
				[],
			);
		}

		if (modifiedEditor) {
			lineHighlightIdsRef.current.modified = modifiedEditor.deltaDecorations(
				lineHighlightIdsRef.current.modified,
				[],
			);
		}

		if (
			typeof window !== "undefined" &&
			lineHighlightTimerRef.current != null
		) {
			window.clearTimeout(lineHighlightTimerRef.current);
			lineHighlightTimerRef.current = null;
		}
	}, [labelPath]);

	const clearSearchDecorations = useCallback(() => {
		const editor = diffEditorsRef.current[labelPath];
		const originalEditor = editor?.getOriginalEditor();
		const modifiedEditor = editor?.getModifiedEditor();

		if (originalEditor) {
			searchDecorationIdsRef.current.original = originalEditor.deltaDecorations(
				searchDecorationIdsRef.current.original,
				[],
			);
			activeSearchDecorationIdsRef.current.original =
				originalEditor.deltaDecorations(
					activeSearchDecorationIdsRef.current.original,
					[],
				);
		}

		if (modifiedEditor) {
			searchDecorationIdsRef.current.modified = modifiedEditor.deltaDecorations(
				searchDecorationIdsRef.current.modified,
				[],
			);
			activeSearchDecorationIdsRef.current.modified =
				modifiedEditor.deltaDecorations(
					activeSearchDecorationIdsRef.current.modified,
					[],
				);
		}
	}, [labelPath]);

	const clearContextDecorations = useCallback(() => {
		const editor = diffEditorsRef.current[labelPath];
		const originalEditor = editor?.getOriginalEditor();
		const modifiedEditor = editor?.getModifiedEditor();

		if (originalEditor) {
			contextDecorationIdsRef.current.original =
				originalEditor.deltaDecorations(
					contextDecorationIdsRef.current.original,
					[],
				);
		}

		if (modifiedEditor) {
			contextDecorationIdsRef.current.modified =
				modifiedEditor.deltaDecorations(
					contextDecorationIdsRef.current.modified,
					[],
				);
		}
	}, [labelPath]);

	const applyCodeSearchDecorations = useCallback(() => {
		const editor = diffEditorsRef.current[labelPath];
		const monaco = monacoRef.current;
		if (!editor || !monaco) {
			return;
		}

		const originalEditor = editor.getOriginalEditor();
		const modifiedEditor = editor.getModifiedEditor();

		const buildDecorations = (matches: DiffCodeSearchMatch[]) =>
			matches.map((match) => ({
				range: new monaco.Range(
					match.startLine,
					match.startColumn,
					match.endLine,
					match.endColumn,
				),
				options: {
					inlineClassName: "git-odyssey-search-match",
				},
			}));

		searchDecorationIdsRef.current.original = originalEditor.deltaDecorations(
			searchDecorationIdsRef.current.original,
			buildDecorations(codeSearchIndex?.original ?? []),
		);
		searchDecorationIdsRef.current.modified = modifiedEditor.deltaDecorations(
			searchDecorationIdsRef.current.modified,
			buildDecorations(codeSearchIndex?.modified ?? []),
		);

		const activeOriginalMatch =
			activeCodeMatch?.side === "original" ? activeCodeMatch : null;
		const activeModifiedMatch =
			activeCodeMatch?.side === "modified" ? activeCodeMatch : null;

		activeSearchDecorationIdsRef.current.original =
			originalEditor.deltaDecorations(
				activeSearchDecorationIdsRef.current.original,
				activeOriginalMatch
					? [
							{
								range: new monaco.Range(
									activeOriginalMatch.startLine,
									activeOriginalMatch.startColumn,
									activeOriginalMatch.endLine,
									activeOriginalMatch.endColumn,
								),
								options: {
									inlineClassName: "git-odyssey-search-match-active",
								},
							},
						]
					: [],
			);
		activeSearchDecorationIdsRef.current.modified =
			modifiedEditor.deltaDecorations(
				activeSearchDecorationIdsRef.current.modified,
				activeModifiedMatch
					? [
							{
								range: new monaco.Range(
									activeModifiedMatch.startLine,
									activeModifiedMatch.startColumn,
									activeModifiedMatch.endLine,
									activeModifiedMatch.endColumn,
								),
								options: {
									inlineClassName: "git-odyssey-search-match-active",
								},
							},
						]
					: [],
			);
	}, [activeCodeMatch, codeSearchIndex, labelPath]);

	const applyContextDecorations = useCallback(() => {
		const editor = diffEditorsRef.current[labelPath];
		const monaco = monacoRef.current;
		if (!editor || !monaco) {
			return;
		}

		const originalEditor = editor.getOriginalEditor();
		const modifiedEditor = editor.getModifiedEditor();

		const buildLineDecoration = (line: number) => [
			{
				range: new monaco.Range(line, 1, line, 1),
				options: {
					isWholeLine: true,
					className: "git-odyssey-context-line-highlight",
					linesDecorationsClassName: "git-odyssey-context-line-gutter",
				},
			},
		];

		const shouldHighlightLine =
			contextHighlight?.highlightStrategy === "target_hunk" &&
			contextHighlight.line != null &&
			contextHighlight.side != null;

		contextDecorationIdsRef.current.original = originalEditor.deltaDecorations(
			contextDecorationIdsRef.current.original,
			shouldHighlightLine && contextHighlight?.side === "original"
				? buildLineDecoration(contextHighlight.line ?? 1)
				: [],
		);
		contextDecorationIdsRef.current.modified = modifiedEditor.deltaDecorations(
			contextDecorationIdsRef.current.modified,
			shouldHighlightLine && contextHighlight?.side === "modified"
				? buildLineDecoration(contextHighlight.line ?? 1)
				: [],
		);
	}, [contextHighlight, labelPath]);

	const focusMountedLine = useCallback(
		(
			editor: MonacoEditor.editor.IStandaloneDiffEditor,
			target: PendingNavigationState,
		) => {
			const targetEditor =
				target.side === "original"
					? editor.getOriginalEditor()
					: editor.getModifiedEditor();
			const model = targetEditor?.getModel();
			const lineCount = model?.getLineCount() ?? target.line;
			const resolvedLine = Math.max(1, Math.min(target.line, lineCount));

			targetEditor?.revealLineInCenter(resolvedLine);
			targetEditor?.setPosition({ lineNumber: resolvedLine, column: 1 });
			targetEditor?.focus();

			if (!target.highlight || !targetEditor || !monacoRef.current) {
				return;
			}

			clearLineHighlights();
			const decorationIds = targetEditor.deltaDecorations(
				[],
				[
					{
						range: new monacoRef.current.Range(
							resolvedLine,
							1,
							resolvedLine,
							1,
						),
						options: {
							isWholeLine: true,
							className: "git-odyssey-target-line-highlight",
							linesDecorationsClassName: "git-odyssey-target-line-gutter",
						},
					},
				],
			);

			lineHighlightIdsRef.current[target.side] = decorationIds;
			lineHighlightIdsRef.current[
				target.side === "original" ? "modified" : "original"
			] = [];

			if (typeof window !== "undefined") {
				lineHighlightTimerRef.current = window.setTimeout(() => {
					clearLineHighlights();
				}, 2600);
			}
		},
		[clearLineHighlights],
	);

	const focusDiffLine = useCallback(
		(target: PendingNavigationState) => {
			const editor = diffEditorsRef.current[labelPath];
			if (editor) {
				focusMountedLine(editor, target);
				return;
			}

			pendingScrollRef.current[labelPath] = target;
		},
		[focusMountedLine, labelPath],
	);

	const focusMountedCodeMatch = useCallback(
		(
			editor: MonacoEditor.editor.IStandaloneDiffEditor,
			target: CodeNavigationTarget,
		) => {
			const targetEditor =
				target.side === "original"
					? editor.getOriginalEditor()
					: editor.getModifiedEditor();
			const model = targetEditor?.getModel();
			if (!targetEditor || !model) {
				return;
			}

			const lineCount = model.getLineCount();
			const resolvedLine = Math.max(1, Math.min(target.startLine, lineCount));
			const lineLength = model.getLineLength(resolvedLine);
			const startColumn = Math.max(
				1,
				Math.min(target.startColumn, lineLength + 1),
			);
			const endColumn = Math.max(
				startColumn + 1,
				Math.min(target.endColumn, lineLength + 1),
			);
			const range = new monacoRef.current!.Range(
				resolvedLine,
				startColumn,
				resolvedLine,
				endColumn,
			);

			targetEditor.revealRangeInCenter(range);
			targetEditor.setSelection(range);
			if (target.focusEditor) {
				targetEditor.focus();
			}
		},
		[],
	);

	const focusCodeMatch = useCallback(
		(target: CodeNavigationTarget) => {
			const editor = diffEditorsRef.current[labelPath];
			if (editor) {
				focusMountedCodeMatch(editor, target);
				return;
			}

			pendingCodeNavigationRef.current[labelPath] = target;
		},
		[focusMountedCodeMatch, labelPath],
	);

	useEffect(() => {
		if (!navigationTarget || !isExpanded) {
			return;
		}

		const navigationPosition = resolveNavigationPosition(
			status,
			navigationTarget,
		);
		if (!navigationPosition) {
			onNavigationTargetHandled?.();
			return;
		}

		focusDiffLine({
			...navigationPosition,
			highlight: true,
		});

		onNavigationTargetHandled?.();
	}, [
		focusDiffLine,
		hunkList,
		isExpanded,
		navigationTarget,
		onNavigationTargetHandled,
		status,
	]);

	useEffect(() => {
		if (!codeNavigationTarget || !isExpanded) {
			return;
		}

		focusCodeMatch(codeNavigationTarget);
		onCodeNavigationTargetHandled?.();
	}, [
		codeNavigationTarget,
		focusCodeMatch,
		isExpanded,
		onCodeNavigationTargetHandled,
	]);

	useEffect(() => {
		applyCodeSearchDecorations();
	}, [
		activeCodeMatch,
		applyCodeSearchDecorations,
		codeSearchIndex,
		isExpanded,
	]);

	useEffect(() => {
		applyContextDecorations();
	}, [applyContextDecorations, contextHighlight, isExpanded]);

	useEffect(() => {
		if (!isExpanded) {
			setActiveSelection(null);
			clearSelectionListeners();
		}
	}, [clearSelectionListeners, isExpanded]);

	useEffect(() => {
		return () => {
			clearLineHighlights();
			clearSearchDecorations();
			clearContextDecorations();
			clearSelectionListeners();
			clearContextMenuActions();
		};
	}, [
		clearContextMenuActions,
		clearContextDecorations,
		clearLineHighlights,
		clearSearchDecorations,
		clearSelectionListeners,
	]);
	const searchContextLabel =
		contextHighlight?.highlightStrategy === "exact_query"
			? "Search hit"
			: contextHighlight?.highlightStrategy === "target_hunk"
				? "Best hunk"
				: contextHighlight?.highlightStrategy === "file_header"
					? "Matched file"
					: null;
	const selectionLabel = activeSelection
		? `${activeSelection.side === "modified" ? "modified" : "original"} ${activeSelection.startLine}:${activeSelection.startColumn}-${activeSelection.endLine}:${activeSelection.endColumn}`
		: null;
	const isSearchContextTarget = Boolean(contextHighlight);
	const panelSelectionClass = isSelected
		? "border-[rgba(122,162,255,0.42)] shadow-[0_0_0_1px_rgba(122,162,255,0.18)]"
		: isSearchContextTarget
			? "border-[rgba(122,162,255,0.26)] shadow-[0_0_0_1px_rgba(122,162,255,0.08)]"
			: undefined;

	return (
		<section className="relative overflow-hidden rounded-[18px] bg-surface">
			<div className="sticky top-0 z-20">
				<div
					className={cn(
						"workspace-panel flex items-center justify-between gap-2.5 border-b border-border-subtle bg-[rgba(12,15,19,0.94)] px-3 py-2 backdrop-blur-md transition-[border-color,box-shadow,background-color] duration-150",
						"rounded-b-none",
						panelSelectionClass,
					)}
				>
					<button
						type="button"
						className="flex min-w-0 items-center gap-2.5 text-left"
						onClick={onToggleExpanded}
					>
						<span className="flex size-5 items-center justify-center rounded-[7px] border border-border-subtle bg-control text-text-tertiary">
							{isExpanded ? (
								<ChevronDown className="size-3.5" />
							) : (
								<ChevronRight className="size-3.5" />
							)}
						</span>
						<div className="min-w-0">
							<div className="flex flex-wrap items-center gap-1.5">
								<StatusPill
									tone={getDiffStatusTone(status)}
									className="min-h-5 px-2 py-0.5 text-[10px] uppercase"
								>
									{getDiffStatusLabel(status)}
								</StatusPill>
								<span className="truncate font-mono text-[10px] text-text-secondary">
									{labelPath}
								</span>
								{searchContextLabel ? (
									<span className="rounded-full border border-[rgba(122,162,255,0.24)] bg-[rgba(122,162,255,0.12)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-text-primary">
										{searchContextLabel}
									</span>
								) : null}
								{searchMatchCount > 0 ? (
									<span className="rounded-full border border-border-subtle bg-control px-1.5 py-0.5 font-mono text-[9px] text-text-secondary">
										{searchMatchCount} match{searchMatchCount === 1 ? "" : "es"}
									</span>
								) : null}
							</div>
						</div>
					</button>

					<div className="flex shrink-0 items-center gap-1.5">
						<Button
							variant="toolbar"
							size="sm"
							className="h-8 gap-1.5 px-2.5 text-[12px] [&_svg:not([class*='size-'])]:size-3.5"
							aria-label={`Diff mode: ${diffMode}. Switch to ${
								diffMode === "side-by-side" ? "inline" : "side-by-side"
							}.`}
							onClick={(event) => {
								event.stopPropagation();
								const nextMode =
									diffMode === "side-by-side" ? "inline" : "side-by-side";
								if (onDiffModeChange) {
									onDiffModeChange(nextMode);
									return;
								}
								setUncontrolledDiffMode(nextMode);
							}}
							title={`Switch to ${
								diffMode === "side-by-side" ? "inline" : "side-by-side"
							} diff`}
						>
							{diffMode === "side-by-side" ? (
								<Columns2 className="size-3.5" />
							) : (
								<Rows3 className="size-3.5" />
							)}
							<span>{diffMode === "side-by-side" ? "Split" : "Inline"}</span>
						</Button>

						{activeSelection && onInjectSelection ? (
							<Button
								variant="toolbar"
								size="sm"
								className="h-8 gap-1.5 px-2.5 text-[12px] [&_svg:not([class*='size-'])]:size-3.5"
								onClick={(event) => {
									event.stopPropagation();
									onInjectSelection(activeSelection);
								}}
								title={`Add selected code to chat (${selectionLabel})`}
							>
								<MessageSquarePlus className="size-4" />
								Add to Chat
							</Button>
						) : null}

						<Button
							variant="toolbar"
							size="toolbar-icon"
							className="size-8 [&_svg:not([class*='size-'])]:size-3.5"
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
								className="h-8 gap-1.5 px-2.5 text-[12px] [&_svg:not([class*='size-'])]:size-3.5"
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
			</div>

			<div
				className={cn(
					"workspace-panel -mt-px overflow-hidden rounded-t-none transition-[border-color,box-shadow] duration-150",
					panelSelectionClass,
				)}
			>
				{canShowFileSummaryControls &&
				isFileSummaryOpen &&
				(fileSummary?.text || fileSummary?.error) ? (
					<div className="space-y-2.5 border-b border-border-subtle bg-[rgba(255,255,255,0.02)] px-3 py-3">
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
						className="border-b border-border-subtle bg-surface"
						style={{ height: diffHeight }}
					>
						<DiffEditor
							original={original}
							modified={modified}
							language={inferLanguage(labelPath)}
							theme="git-odyssey-dark"
							beforeMount={(monaco) => {
								monacoRef.current = monaco;
								registerGitOdysseyMonacoTheme(monaco);
							}}
							originalModelPath={originalModelPath}
							modifiedModelPath={modifiedModelPath}
							options={diffOptions}
							onMount={(editor) => {
								diffEditorsRef.current[labelPath] =
									editor as unknown as MonacoEditor.editor.IStandaloneDiffEditor;
								bindSelectionListeners(
									editor as unknown as MonacoEditor.editor.IStandaloneDiffEditor,
								);
								registerContextMenuActions(
									editor as unknown as MonacoEditor.editor.IStandaloneDiffEditor,
								);
								applyCodeSearchDecorations();
								applyContextDecorations();
								const pending = pendingScrollRef.current[labelPath];
								if (pending) {
									focusMountedLine(
										editor as unknown as MonacoEditor.editor.IStandaloneDiffEditor,
										pending,
									);
									pendingScrollRef.current[labelPath] = undefined;
								}
								const pendingCodeTarget =
									pendingCodeNavigationRef.current[labelPath];
								if (pendingCodeTarget) {
									focusMountedCodeMatch(
										editor as unknown as MonacoEditor.editor.IStandaloneDiffEditor,
										pendingCodeTarget,
									);
									pendingCodeNavigationRef.current[labelPath] = undefined;
								}
							}}
						/>
					</div>
				) : null}

			</div>
		</section>
	);
}

export default CommitFilePanel;
