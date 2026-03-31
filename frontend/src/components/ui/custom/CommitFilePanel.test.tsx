import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CommitFilePanel } from "@/components/ui/custom/CommitFilePanel";
import type { FileChange } from "@/lib/definitions/repo";

const monacoHarness = vi.hoisted(() => {
	type MockSelection = {
		startLineNumber: number;
		startColumn: number;
		endLineNumber: number;
		endColumn: number;
		isEmpty: () => boolean;
	};

	const createSelection = (
		startLineNumber: number,
		startColumn: number,
		endLineNumber: number,
		endColumn: number,
	): MockSelection => ({
		startLineNumber,
		startColumn,
		endLineNumber,
		endColumn,
		isEmpty: () =>
			startLineNumber === endLineNumber && startColumn === endColumn,
	});

	const createCodeEditor = () => {
		let selectedText = "";
		let selection = createSelection(1, 1, 1, 1);
		const selectionListeners: Array<() => void> = [];
		const actions: Array<{
			id: string;
			label: string;
			contextMenuGroupId?: string;
			contextMenuOrder?: number;
			run: (editor: unknown) => unknown;
		}> = [];

		return {
			getModel: () => ({
				getValueInRange: () => selectedText,
				getLineCount: () => 200,
				getLineLength: () => 120,
			}),
			getSelection: () => selection,
			onDidChangeCursorSelection: (listener: () => void) => {
				selectionListeners.push(listener);
				return { dispose() {} };
			},
			addAction: (action: {
				id: string;
				label: string;
				contextMenuGroupId?: string;
				contextMenuOrder?: number;
				run: (editor: unknown) => unknown;
			}) => {
				actions.push(action);
				return { dispose() {} };
			},
			deltaDecorations: () => [],
			revealLineInCenter() {},
			setPosition() {},
			focus() {},
			revealRangeInCenter() {},
			setSelection() {},
			__setSelection: (
				nextSelection: MockSelection,
				nextSelectedText: string,
			) => {
				selection = nextSelection;
				selectedText = nextSelectedText;
				selectionListeners.forEach((listener) => listener());
			},
			__getActions: () => actions,
		};
	};

	const state: {
		originalEditor: ReturnType<typeof createCodeEditor> | null;
		modifiedEditor: ReturnType<typeof createCodeEditor> | null;
		diffEditor: {
			getOriginalEditor: () => ReturnType<typeof createCodeEditor>;
			getModifiedEditor: () => ReturnType<typeof createCodeEditor>;
		} | null;
		lastOptions: Record<string, unknown> | null;
		reset: () => void;
		createSelection: typeof createSelection;
	} = {
		originalEditor: null,
		modifiedEditor: null,
		diffEditor: null,
		lastOptions: null,
		reset() {
			const originalEditor = createCodeEditor();
			const modifiedEditor = createCodeEditor();
			this.originalEditor = originalEditor;
			this.modifiedEditor = modifiedEditor;
			this.diffEditor = {
				getOriginalEditor: () => originalEditor,
				getModifiedEditor: () => modifiedEditor,
			};
		},
		createSelection,
	};

	return state;
});

vi.mock("@monaco-editor/react", async () => {
	const React = await import("react");

	return {
		DiffEditor: (props: {
			beforeMount?: (monaco: unknown) => void;
			onMount?: (editor: unknown) => void;
			options?: Record<string, unknown>;
		}) => {
			monacoHarness.lastOptions = props.options ?? null;

			React.useEffect(() => {
				monacoHarness.reset();
				const monaco = {
					Range: class Range {
						startLineNumber: number;
						startColumn: number;
						endLineNumber: number;
						endColumn: number;

						constructor(
							startLineNumber: number,
							startColumn: number,
							endLineNumber: number,
							endColumn: number,
						) {
							this.startLineNumber = startLineNumber;
							this.startColumn = startColumn;
							this.endLineNumber = endLineNumber;
							this.endColumn = endColumn;
						}
					},
					editor: {
						defineTheme() {},
					},
				};
				props.beforeMount?.(monaco);
				props.onMount?.(monacoHarness.diffEditor);
			}, [props]);

			return React.createElement("div", { "data-testid": "mock-diff-editor" });
		},
	};
});

function buildFileChange(overrides: Partial<FileChange> = {}): FileChange {
	return {
		commit_sha: "abc123",
		new_path: "frontend/src/components/ui/custom/CommitFilePanel.tsx",
		old_path: "frontend/src/components/ui/custom/CommitFilePanel.tsx",
		status: "modified",
		hunks: [],
		snapshot: {
			id: 1,
			path: "frontend/src/components/ui/custom/CommitFilePanel.tsx",
			content: "export function CommitFilePanel() {}",
			previous_snapshot: {
				id: 2,
				path: "frontend/src/components/ui/custom/CommitFilePanel.tsx",
				content: "export function CommitFilePanel() {}",
				commit_sha: "def456",
			},
			commit_sha: "abc123",
		},
		...overrides,
	};
}

describe("CommitFilePanel", () => {
	it("registers Add Selection to Chat actions for both diff editors", async () => {
		render(
			<CommitFilePanel
				repoPath="/Users/dillonpina/Documents/code/git-odyssey"
				viewerId="review:test"
				fileChange={buildFileChange()}
				isExpanded
				onToggleExpanded={() => {}}
				onInjectSelection={() => {}}
			/>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("mock-diff-editor")).toBeInTheDocument();
			expect(monacoHarness.originalEditor?.__getActions()).toHaveLength(1);
			expect(monacoHarness.modifiedEditor?.__getActions()).toHaveLength(1);
		});

		expect(monacoHarness.originalEditor?.__getActions()[0]).toMatchObject({
			label: "Add Selection to Chat",
			contextMenuGroupId: "navigation",
		});
		expect(monacoHarness.modifiedEditor?.__getActions()[0]).toMatchObject({
			label: "Add Selection to Chat",
			contextMenuGroupId: "navigation",
		});
	});

	it("injects the original-side selection from the context menu action", async () => {
		const onInjectSelection = vi.fn();

		render(
			<CommitFilePanel
				repoPath="/Users/dillonpina/Documents/code/git-odyssey"
				viewerId="review:test"
				fileChange={buildFileChange()}
				isExpanded
				onToggleExpanded={() => {}}
				onInjectSelection={onInjectSelection}
			/>,
		);

		await waitFor(() => {
			expect(monacoHarness.originalEditor?.__getActions()).toHaveLength(1);
		});

		await act(async () => {
			monacoHarness.originalEditor?.__setSelection(
				monacoHarness.createSelection(12, 3, 14, 9),
				"const selection = true;",
			);

			await monacoHarness.originalEditor?.__getActions()[0].run(
				monacoHarness.originalEditor,
			);
		});

		expect(onInjectSelection).toHaveBeenCalledWith({
			filePath: "frontend/src/components/ui/custom/CommitFilePanel.tsx",
			side: "original",
			startLine: 12,
			startColumn: 3,
			endLine: 14,
			endColumn: 9,
			selectedText: "const selection = true;",
			language: "typescript",
		});
	});

	it("does nothing for empty or whitespace-only context-menu selections", async () => {
		const onInjectSelection = vi.fn();

		render(
			<CommitFilePanel
				repoPath="/Users/dillonpina/Documents/code/git-odyssey"
				viewerId="review:test"
				fileChange={buildFileChange()}
				isExpanded
				onToggleExpanded={() => {}}
				onInjectSelection={onInjectSelection}
			/>,
		);

		await waitFor(() => {
			expect(monacoHarness.modifiedEditor?.__getActions()).toHaveLength(1);
		});

		await act(async () => {
			monacoHarness.modifiedEditor?.__setSelection(
				monacoHarness.createSelection(8, 1, 8, 1),
				"",
			);
			await monacoHarness.modifiedEditor?.__getActions()[0].run(
				monacoHarness.modifiedEditor,
			);

			monacoHarness.modifiedEditor?.__setSelection(
				monacoHarness.createSelection(8, 1, 9, 1),
				"   \n\t",
			);
			await monacoHarness.modifiedEditor?.__getActions()[0].run(
				monacoHarness.modifiedEditor,
			);
		});

		expect(onInjectSelection).not.toHaveBeenCalled();
	});

	it("switches the diff viewer between side-by-side and inline modes", async () => {
		const user = userEvent.setup();

		render(
			<CommitFilePanel
				repoPath="/Users/dillonpina/Documents/code/git-odyssey"
				viewerId="review:test"
				fileChange={buildFileChange()}
				isExpanded
				onToggleExpanded={() => {}}
			/>,
		);

		await waitFor(() => {
			expect(monacoHarness.lastOptions?.renderSideBySide).toBe(true);
		});

		await user.click(
			screen.getByRole("button", {
				name: "Diff mode: side-by-side. Switch to inline.",
			}),
		);

		await waitFor(() => {
			expect(monacoHarness.lastOptions?.renderSideBySide).toBe(false);
		});

		await user.click(
			screen.getByRole("button", {
				name: "Diff mode: inline. Switch to side-by-side.",
			}),
		);

		await waitFor(() => {
			expect(monacoHarness.lastOptions?.renderSideBySide).toBe(true);
		});
	});
});
