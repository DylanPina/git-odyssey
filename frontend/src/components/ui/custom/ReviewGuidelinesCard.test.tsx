import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReviewGuidelinesCard } from "@/components/ui/custom/ReviewGuidelinesCard";

const apiMocks = vi.hoisted(() => ({
  saveDesktopReviewSettings: vi.fn(),
}));

vi.mock("@/api/api", () => ({
  saveDesktopReviewSettings: apiMocks.saveDesktopReviewSettings,
}));

describe("ReviewGuidelinesCard", () => {
  it("loads saved app-wide guidelines and saves updates", async () => {
    const user = userEvent.setup();
    apiMocks.saveDesktopReviewSettings.mockResolvedValue({
      pullRequestGuidelines: "Prioritize auth and rollback safety.",
    });

    render(
      <ReviewGuidelinesCard
        desktopSettingsStatus={
          {
            reviewSettings: {
              pullRequestGuidelines: "Review migrations carefully.",
            },
          } as any
        }
      />
    );

    const textarea = screen.getByRole("textbox", {
      name: /app-wide review guidelines/i,
    });
    expect(textarea).toHaveValue("Review migrations carefully.");

    await user.clear(textarea);
    await user.type(textarea, "Prioritize auth and rollback safety.");
    await user.click(
      screen.getByRole("button", { name: /save review guidelines/i })
    );

    await waitFor(() => {
      expect(apiMocks.saveDesktopReviewSettings).toHaveBeenCalledWith({
        pullRequestGuidelines: "Prioritize auth and rollback safety.",
      });
    });

    expect(
      screen.getByText(/app-wide review guidelines saved/i)
    ).toBeInTheDocument();
  });
});
