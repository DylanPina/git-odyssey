import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DesktopTitleBar } from "@/components/ui/custom/DesktopTitleBar";

describe("DesktopTitleBar", () => {
	it("renders a custom center slot without breaking navigation or trailing chrome", async () => {
		const user = userEvent.setup();
		const handleBack = vi.fn();
		const handleForward = vi.fn();
		const handleAction = vi.fn();

		render(
			<DesktopTitleBar
				meta={{
					sectionLabel: null,
					scopeLabel: "Repository",
					detailLabel: "main -> feature",
					documentTitle: "Review · GitOdyssey",
					surface: "default",
				}}
				chrome={{
					center: <div>Review Tabs</div>,
					trailing: <button onClick={handleAction}>Action</button>,
				}}
				navigation={{
					canGoBack: true,
					canGoForward: true,
					onGoBack: handleBack,
					onGoForward: handleForward,
				}}
			/>,
		);

		expect(screen.getByText("Review Tabs")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: /go back/i }));
		await user.click(screen.getByRole("button", { name: /go forward/i }));
		await user.click(screen.getByRole("button", { name: "Action" }));

		expect(handleBack).toHaveBeenCalledTimes(1);
		expect(handleForward).toHaveBeenCalledTimes(1);
		expect(handleAction).toHaveBeenCalledTimes(1);
	});
});
