import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { RepoSettingsCard } from "@/components/ui/custom/RepoSettingsCard";

const apiMocks = vi.hoisted(() => ({
  getDesktopRepoSettings: vi.fn(),
  getRecentProjects: vi.fn(),
  pickGitProject: vi.fn(),
  saveDesktopRepoSettings: vi.fn(),
}));

vi.mock("@/api/api", () => ({
  getDesktopRepoSettings: apiMocks.getDesktopRepoSettings,
  getRecentProjects: apiMocks.getRecentProjects,
  pickGitProject: apiMocks.pickGitProject,
  saveDesktopRepoSettings: apiMocks.saveDesktopRepoSettings,
}));

describe("RepoSettingsCard", () => {
  it("loads and saves repo-specific review guidelines", async () => {
    const user = userEvent.setup();
    apiMocks.getRecentProjects.mockResolvedValue([]);
    apiMocks.getDesktopRepoSettings.mockResolvedValue({
      maxCommits: 50,
      contextLines: 10,
      pullRequestGuidelines: "Check migrations carefully.",
    });
    apiMocks.saveDesktopRepoSettings.mockResolvedValue({
      maxCommits: 50,
      contextLines: 10,
      pullRequestGuidelines: "Check migrations and auth carefully.",
    });

    render(
      <MemoryRouter>
        <RepoSettingsCard repoPath="/tmp/example-repo" />
      </MemoryRouter>,
    );

    const textarea = await screen.findByRole("textbox", {
      name: /repo-specific review guidelines/i,
    });
    const diffContextInput = screen.getByRole("spinbutton", {
      name: /diff context lines/i,
    });

    expect(diffContextInput).toHaveValue(10);
    expect(textarea).toHaveValue("Check migrations carefully.");
    expect(
      screen.getByText(
        /diff viewer keeps visible around each change, and the diff context gitodyssey stores for this repo/i,
      ),
    ).toBeInTheDocument();

    await user.clear(textarea);
    await user.type(textarea, "Check migrations and auth carefully.");
    await user.click(
      screen.getByRole("button", { name: /save repository settings/i }),
    );

    await waitFor(() => {
      expect(apiMocks.saveDesktopRepoSettings).toHaveBeenCalledWith({
        repoPath: "/tmp/example-repo",
        maxCommits: 50,
        contextLines: 10,
        pullRequestGuidelines: "Check migrations and auth carefully.",
      });
    });

    expect(screen.getByText(/repository settings saved/i)).toBeInTheDocument();
  });
});
