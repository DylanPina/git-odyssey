import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import App from "@/App";

vi.mock("@/pages/Home", () => ({
	Home: () => <div>Home Page</div>,
}));

vi.mock("@/pages/Repo", () => ({
	Repo: () => <div>Repo Page</div>,
}));

vi.mock("@/pages/Review", () => ({
	Review: () => <div>Review Page</div>,
}));

vi.mock("@/components/ui/custom/DesktopSetupCard", () => ({
	DesktopSetupCard: () => <div>Desktop Setup Card</div>,
}));

vi.mock("@/components/ui/custom/TokenSecretsCard", () => ({
	TokenSecretsCard: () => <div>Token Secrets Card</div>,
}));

vi.mock("@/components/ui/custom/ReviewGuidelinesCard", () => ({
	ReviewGuidelinesCard: () => <div>Review Guidelines Card</div>,
}));

vi.mock("@/components/ui/custom/RepoSettingsCard", () => ({
	RepoSettingsCard: () => <div>Repo Settings Card</div>,
}));

vi.mock("@/hooks/useAuth", () => ({
	useAuth: () => ({
		desktopSettingsStatus: null,
		desktopHealth: null,
		isLoading: false,
		checkAuth: vi.fn(),
	}),
}));

vi.mock("@/hooks/useRepoNavigationShortcuts", () => ({
	useRepoNavigationShortcuts: vi.fn(),
}));

describe("App settings navigation", () => {
	it("uses the title bar navigation instead of an inline back link on settings", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/settings?path=/tmp/example-repo"]}>
				<App />
			</MemoryRouter>,
		);

		const goBackButton = screen.getByRole("button", { name: /go back/i });
		const goForwardButton = screen.getByRole("button", { name: /go forward/i });

		expect(goBackButton).toBeEnabled();
		expect(goForwardButton).toBeDisabled();
		expect(
			screen.queryByRole("link", { name: /back to repo/i }),
		).not.toBeInTheDocument();

		await user.click(goBackButton);

		expect(await screen.findByText("Repo Page")).toBeInTheDocument();
	});
});
