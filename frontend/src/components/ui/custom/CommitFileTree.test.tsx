import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CommitFileTree } from "@/components/ui/custom/CommitFileTree";
import type { FileChange } from "@/lib/definitions/repo";

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

describe("CommitFileTree", () => {
	it("renders the bottom action with its label when expanded", async () => {
		const user = userEvent.setup();
		const handleBottomActionClick = vi.fn();

		render(
			<CommitFileTree
				files={[buildFileChange("src/alpha.ts")]}
				totalFileCount={1}
				selectedFilePath={null}
				bottomAction={{
					label: "Settings",
					ariaLabel: "Open review settings",
					icon: <svg aria-hidden="true" />,
					onClick: handleBottomActionClick,
				}}
				onSelectFile={vi.fn()}
			/>,
		);

		const settingsButton = screen.getByRole("button", { name: "Settings" });
		expect(settingsButton).toBeInTheDocument();

		await user.click(settingsButton);

		expect(handleBottomActionClick).toHaveBeenCalledTimes(1);
	});

	it("renders the bottom action as icon-only when collapsed", () => {
		render(
			<CommitFileTree
				files={[buildFileChange("src/alpha.ts")]}
				totalFileCount={1}
				selectedFilePath={null}
				bottomAction={{
					label: "Settings",
					ariaLabel: "Open review settings",
					icon: <svg aria-hidden="true" />,
					onClick: vi.fn(),
				}}
				isCollapsed
				onToggleCollapsed={vi.fn()}
				onSelectFile={vi.fn()}
			/>,
		);

		expect(
			screen.getByRole("button", { name: "Open review settings" }),
		).toBeInTheDocument();
		expect(screen.queryByText("Settings")).not.toBeInTheDocument();
	});
});
