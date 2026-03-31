import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DiffWorkspace } from "@/components/ui/custom/DiffWorkspace";
import type { FileChange } from "@/lib/definitions/repo";

vi.mock("@/components/ui/custom/CommitFilePanel", () => ({
	CommitFilePanel: (props: {
		fileChange: FileChange;
		diffMode?: "inline" | "side-by-side";
		onDiffModeChange?: (mode: "inline" | "side-by-side") => void;
	}) => (
		<div data-testid={`panel-${props.fileChange.new_path}`}>
			<span>{props.fileChange.new_path}</span>
			<span>{props.diffMode}</span>
			<button
				type="button"
				onClick={() =>
					props.onDiffModeChange?.(
						props.diffMode === "side-by-side" ? "inline" : "side-by-side",
					)
				}
			>
				Toggle {props.fileChange.new_path}
			</button>
		</div>
	),
}));

function buildFileChange(path: string): FileChange {
	return {
		commit_sha: "abc123",
		new_path: path,
		old_path: path,
		status: "modified",
		hunks: [],
		snapshot: {
			id: Math.floor(Math.random() * 100000),
			path,
			content: "export const value = 1;",
			previous_snapshot: {
				id: Math.floor(Math.random() * 100000) + 100000,
				path,
				content: "export const value = 0;",
				commit_sha: "def456",
			},
			commit_sha: "abc123",
		},
	};
}

describe("DiffWorkspace", () => {
	it("keeps diff mode in sync across all file panels", async () => {
		const user = userEvent.setup();

		if (typeof ResizeObserver === "undefined") {
			vi.stubGlobal(
				"ResizeObserver",
				class ResizeObserver {
					observe() {}
					disconnect() {}
					unobserve() {}
				},
			);
		}

		render(
			<DiffWorkspace
				repoPath="/Users/dillonpina/Documents/code/git-odyssey"
				viewerId="review:test"
				files={[
					buildFileChange("src/alpha.ts"),
					buildFileChange("src/beta.ts"),
				]}
				fileSearchInputId="file-search"
				codeSearchInputId="code-search"
				emptyTitle="No files"
			/>,
		);

		expect(screen.getByTestId("panel-src/alpha.ts")).toHaveTextContent(
			"side-by-side",
		);
		expect(screen.getByTestId("panel-src/beta.ts")).toHaveTextContent(
			"side-by-side",
		);

		await user.click(screen.getByRole("button", { name: "Toggle src/alpha.ts" }));

		expect(screen.getByTestId("panel-src/alpha.ts")).toHaveTextContent("inline");
		expect(screen.getByTestId("panel-src/beta.ts")).toHaveTextContent("inline");
	});
});
