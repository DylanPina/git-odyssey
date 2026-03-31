import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DiffWorkspacePage } from "@/components/ui/custom/DiffWorkspacePage";

describe("DiffWorkspacePage", () => {
	it("renders bottom sections below the workspace", () => {
		render(
			<DiffWorkspacePage
				topSections={[<div key="top">Top section</div>]}
				bottomSections={[<div key="bottom">Bottom section</div>]}
				workspace={<div>Workspace</div>}
			/>,
		);

		expect(screen.getByText("Top section")).toBeInTheDocument();
		expect(screen.getByText("Workspace")).toBeInTheDocument();
		expect(screen.getByText("Bottom section")).toBeInTheDocument();
	});

	it("renders fixed layout content without dropping sections", () => {
		render(
			<DiffWorkspacePage
				layout="fixed"
				spacing="compact"
				topSections={[<div key="top">Top section</div>]}
				bottomSections={[<div key="bottom">Bottom section</div>]}
				workspace={<div>Workspace</div>}
			/>,
		);

		expect(screen.getByText("Top section")).toBeInTheDocument();
		expect(screen.getByText("Workspace")).toBeInTheDocument();
		expect(screen.getByText("Bottom section")).toBeInTheDocument();
	});
});
