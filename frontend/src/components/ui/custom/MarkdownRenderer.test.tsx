import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
	MarkdownRenderer,
	type ReviewChatReferenceTarget,
} from "@/components/ui/custom/MarkdownRenderer";

const reviewReferencePaths = [
	"frontend/src/pages/Review.tsx",
	"frontend/src/pages/review/components/ReviewChatPanel.tsx",
];

describe("MarkdownRenderer", () => {
	const repoPath = "/Users/dillonpina/Documents/code/git-odyssey";

	it("links references inside list items and inline code", async () => {
		const user = userEvent.setup();
		const onReviewReferenceClick = vi.fn<
			(target: ReviewChatReferenceTarget) => void
		>();

		render(
			<MarkdownRenderer
				content={[
					"- Check frontend/src/pages/Review.tsx#L42 for rail state.",
					"- Then inspect `frontend/src/pages/review/components/ReviewChatPanel.tsx:18`.",
				].join("\n")}
				reviewReferencePaths={reviewReferencePaths}
				onReviewReferenceClick={onReviewReferenceClick}
				reviewReferenceRepoPath={repoPath}
			/>,
		);

		await user.click(
			screen.getByRole("button", {
				name: "frontend/src/pages/Review.tsx#L42",
			}),
		);
		await user.click(
			screen.getByRole("button", {
				name: "frontend/src/pages/review/components/ReviewChatPanel.tsx:18",
			}),
		);

		expect(onReviewReferenceClick).toHaveBeenNthCalledWith(1, {
			filePath: "frontend/src/pages/Review.tsx",
			line: 42,
		});
		expect(onReviewReferenceClick).toHaveBeenNthCalledWith(2, {
			filePath: "frontend/src/pages/review/components/ReviewChatPanel.tsx",
			line: 18,
		});
	});

	it("does not link references inside fenced code blocks", () => {
		render(
			<MarkdownRenderer
				content={[
					"```ts",
					"const path = 'frontend/src/pages/Review.tsx:42';",
					"```",
				].join("\n")}
				reviewReferencePaths={reviewReferencePaths}
				onReviewReferenceClick={() => {}}
				reviewReferenceRepoPath={repoPath}
			/>,
		);

		expect(
			screen.queryByRole("button", {
				name: "frontend/src/pages/Review.tsx:42",
			}),
		).not.toBeInTheDocument();
		expect(
			screen.getByText(/frontend\/src\/pages\/review\.tsx:42/i),
		).toBeInTheDocument();
	});

	it("routes repo-local file hrefs in the diff to in-app diff navigation", async () => {
		const user = userEvent.setup();
		const onReviewReferenceClick = vi.fn<
			(target: ReviewChatReferenceTarget) => void
		>();

		render(
			<MarkdownRenderer
				content={`[Review file](${repoPath}/frontend/src/pages/Review.tsx)`}
				reviewReferencePaths={reviewReferencePaths}
				onReviewReferenceClick={onReviewReferenceClick}
				reviewReferenceRepoPath={repoPath}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Review file" }));

		expect(onReviewReferenceClick).toHaveBeenCalledWith({
			filePath: "frontend/src/pages/Review.tsx",
			line: null,
		});
	});

	it("does not keep non-diff local hrefs clickable in review chat mode", () => {
		render(
			<MarkdownRenderer
				content="[ProfessorTable](/Users/dillonpina/Documents/code/rucshub/components/ProfessorTable/ProfessorTable.tsx)"
				reviewReferencePaths={reviewReferencePaths}
				onReviewReferenceClick={() => {}}
				reviewReferenceRepoPath={repoPath}
			/>,
		);

		expect(
			screen.queryByRole("link", { name: "ProfessorTable" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "ProfessorTable" }),
		).not.toBeInTheDocument();
		expect(screen.getByText("ProfessorTable")).toBeInTheDocument();
	});
});
