import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	getDesktopAdditionalReviewGuidelines,
	saveDesktopAdditionalReviewGuidelines,
} from "@/api/api";
import { ReviewTitleBarTrailing } from "@/pages/review/components/ReviewTitleBarTrailing";
import { getAdditionalReviewGuidelinesStorageKey } from "@/pages/review/review-storage";
import type { ReviewHistoryEntry } from "@/lib/definitions/review";
import { useReviewHistoryFilters } from "@/pages/review/useReviewHistoryFilters";

const additionalGuidelineStore = vi.hoisted(() => {
	type PersistedState = {
		repoPath: string;
		draftGuideline: string;
		guidelines: Array<{ id: string; text: string }>;
		updatedAt: string | null;
	};
	const statesByRepo = new Map<
		string,
		PersistedState
	>();

	const buildEmptyState = (repoPath: string): PersistedState => ({
		repoPath,
		draftGuideline: "",
		guidelines: [],
		updatedAt: null,
	});

	const cloneState = (state: PersistedState): PersistedState => ({
		...state,
		guidelines: state.guidelines.map((guideline) => ({ ...guideline })),
	});

	return {
		reset() {
			statesByRepo.clear();
		},
		getDesktopAdditionalReviewGuidelines: vi.fn(async (repoPath: string) => {
			return cloneState(statesByRepo.get(repoPath) ?? buildEmptyState(repoPath));
		}),
		saveDesktopAdditionalReviewGuidelines: vi.fn(
			async (input: {
				repoPath: string;
				draftGuideline: string;
				guidelines: Array<{ id: string; text: string }>;
			}) => {
				const nextState = {
					repoPath: input.repoPath,
					draftGuideline: input.draftGuideline.trimEnd(),
					guidelines: input.guidelines
						.map((guideline, index) => ({
							id:
								typeof guideline.id === "string" && guideline.id.trim()
									? guideline.id.trim()
									: `guideline-${index + 1}`,
							text:
								typeof guideline.text === "string"
									? guideline.text.trim()
									: "",
						}))
						.filter((guideline) => guideline.text),
					updatedAt: "2026-04-10T00:00:00.000Z",
				};

				if (!nextState.draftGuideline && nextState.guidelines.length === 0) {
					statesByRepo.delete(input.repoPath);
					return buildEmptyState(input.repoPath);
				}

				statesByRepo.set(input.repoPath, nextState);
				return cloneState(nextState);
			},
		),
	};
});

vi.mock("@/api/api", () => ({
	getDesktopAdditionalReviewGuidelines:
		additionalGuidelineStore.getDesktopAdditionalReviewGuidelines,
	saveDesktopAdditionalReviewGuidelines:
		additionalGuidelineStore.saveDesktopAdditionalReviewGuidelines,
}));

function buildHistoryEntry(overrides: Partial<ReviewHistoryEntry> = {}): ReviewHistoryEntry {
	return {
		run_id: "run-1",
		session_id: "session-1",
		repo_path: "/tmp/example-repo",
		target_mode: "compare",
		base_ref: "main",
		head_ref: "feature",
		commit_sha: null,
		base_head_sha: "aaaaaaaa",
		head_head_sha: "bbbbbbbb",
		merge_base_sha: "cccccccc",
		engine: "codex_cli",
		mode: "native_review",
		partial: false,
		findings_count: 1,
		severity_counts: {
			high: 1,
			medium: 0,
			low: 0,
		},
		summary: "Found one issue.",
		generated_at: "2026-03-20T10:02:00.000Z",
		completed_at: "2026-03-20T10:03:00.000Z",
		run_created_at: "2026-03-20T10:00:00.000Z",
		...overrides,
	};
}

function ReviewTitleBarTrailingHarness({
	reviewHistory,
	isViewingHistory = false,
	targetMode = "compare",
	repoPath = "/tmp/example-repo",
	savedGuidelines = {
		appWide: "Focus on auth.\n\nReview rollback safety.",
		repoSpecific: "Check migrations.",
	},
	onStartReview = () => {},
}: {
	reviewHistory: ReviewHistoryEntry[];
	isViewingHistory?: boolean;
	targetMode?: "compare" | "commit";
	repoPath?: string;
	savedGuidelines?: {
		appWide: string;
		repoSpecific: string;
	};
	onStartReview?: (customInstructions: string) => void;
}) {
	const filters = useReviewHistoryFilters(reviewHistory);

	return (
		<ReviewTitleBarTrailing
			repoPath={repoPath}
			targetMode={targetMode}
			branchOptions={["main", "feature"]}
			baseRef="main"
			headRef="feature"
			commitSha={targetMode === "commit" ? "1234567890abcdef" : null}
			onBaseRefChange={() => {}}
			onHeadRefChange={() => {}}
			canStartReview
			canCancelReview={false}
			hasCancelableRun={false}
			reviewHistory={reviewHistory}
			filteredReviewHistory={filters.filteredReviewHistory}
			filters={filters}
			isViewingHistory={isViewingHistory}
			selectedHistoryRunId={isViewingHistory ? reviewHistory[0]?.run_id ?? null : null}
			historySelectionLoadingRunId={null}
			historyError={null}
			isHistoryLoading={false}
			onReturnToLatestReview={() => {}}
			onSelectHistoryReview={() => {}}
			savedGuidelines={savedGuidelines}
			appliedInstructions={
				isViewingHistory
					? "App-wide review guidelines:\nFocus on auth.\n\nAdditional review guidelines:\nDouble-check rollback paths."
					: null
			}
			onStartReview={onStartReview}
			onCancelReview={() => {}}
		/>
	);
}

describe("ReviewTitleBarTrailing", () => {
	beforeEach(() => {
		window.localStorage.clear();
		additionalGuidelineStore.reset();
		vi.mocked(getDesktopAdditionalReviewGuidelines).mockClear();
		vi.mocked(saveDesktopAdditionalReviewGuidelines).mockClear();
	});

	afterEach(() => {
		window.localStorage.clear();
		additionalGuidelineStore.reset();
	});

	it("does not render previous reviews button when history is empty", () => {
		render(<ReviewTitleBarTrailingHarness reviewHistory={[]} />);

		expect(
			screen.queryByRole("button", { name: /previous reviews/i }),
		).not.toBeInTheDocument();
	});

	it("opens previous reviews overlay from the titlebar button", async () => {
		const user = userEvent.setup();

		render(
			<ReviewTitleBarTrailingHarness
				reviewHistory={[buildHistoryEntry()]}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /reviews/i }));

		expect(screen.getByPlaceholderText(/search ids, refs, shas/i)).toBeInTheDocument();
		expect(screen.getByText(/found one issue/i)).toBeInTheDocument();
	});

	it("shows return to latest inside the overlay when viewing history", async () => {
		const user = userEvent.setup();

		render(
			<ReviewTitleBarTrailingHarness
				reviewHistory={[buildHistoryEntry()]}
				isViewingHistory
			/>,
		);

		await user.click(screen.getByRole("button", { name: /reviews/i }));

		expect(
			screen.getByRole("button", { name: /return to latest/i }),
		).toBeInTheDocument();
	});

	it("shows a commit chip instead of branch pickers in commit mode", () => {
		render(
			<ReviewTitleBarTrailingHarness
				reviewHistory={[buildHistoryEntry({ target_mode: "commit", commit_sha: "1234567890abcdef" })]}
				targetMode="commit"
			/>,
		);

		expect(screen.getByText(/commit/i)).toBeInTheDocument();
		expect(screen.getByText("1234567890ab")).toBeInTheDocument();
		expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
	});

	it("renders saved guidelines as a flattened list with source badges", async () => {
		const user = userEvent.setup();

		render(
			<ReviewTitleBarTrailingHarness
				reviewHistory={[buildHistoryEntry()]}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /guidelines/i }));
		await waitFor(() => {
			expect(vi.mocked(getDesktopAdditionalReviewGuidelines)).toHaveBeenCalled();
		});

		const savedGuidelineList = screen.getByRole("list", {
			name: /existing review guideline list/i,
		});
		const savedGuidelineItems = within(savedGuidelineList).getAllByRole("listitem");

		expect(savedGuidelineItems).toHaveLength(3);
		expect(screen.getAllByText("App-wide")).toHaveLength(2);
		expect(screen.getByText("Repo-specific")).toBeInTheDocument();
		expect(screen.getByText("Focus on auth.")).toBeInTheDocument();
		expect(screen.getByText("Review rollback safety.")).toBeInTheDocument();
		expect(screen.getByText("Check migrations.")).toBeInTheDocument();
	});

	it("shows a snippet preview for long saved guidelines and expands it", async () => {
		const user = userEvent.setup();
		const longGuideline =
			"Focus on authentication boundaries, rollback safety, schema drift, and all migration edge cases before approving.";
		const previewText = `${longGuideline.slice(0, 96).trimEnd()}...`;

		render(
			<ReviewTitleBarTrailingHarness
				reviewHistory={[buildHistoryEntry()]}
				savedGuidelines={{
					appWide: longGuideline,
					repoSpecific: "",
				}}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /guidelines/i }));
		await waitFor(() => {
			expect(vi.mocked(getDesktopAdditionalReviewGuidelines)).toHaveBeenCalled();
		});

		expect(screen.getByText(previewText)).toBeInTheDocument();
		expect(screen.queryByText(longGuideline)).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: /expand/i }));

		expect(screen.getByText(longGuideline)).toBeInTheDocument();
	});

	it("hides the existing-guidelines section when no saved guidelines exist", async () => {
		const user = userEvent.setup();

		render(
			<ReviewTitleBarTrailingHarness
				reviewHistory={[buildHistoryEntry()]}
				savedGuidelines={{
					appWide: " \n ",
					repoSpecific: "",
				}}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /guidelines/i }));
		await waitFor(() => {
			expect(vi.mocked(getDesktopAdditionalReviewGuidelines)).toHaveBeenCalled();
		});

		expect(
			screen.queryByRole("list", { name: /existing review guideline list/i }),
		).not.toBeInTheDocument();
		expect(screen.queryByText(/existing review guidelines/i)).not.toBeInTheDocument();
	});

	it("lets users add, edit, and remove additional review guidelines", async () => {
		const user = userEvent.setup();

		render(
			<ReviewTitleBarTrailingHarness
				reviewHistory={[buildHistoryEntry()]}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /guidelines/i }));
		await waitFor(() => {
			expect(vi.mocked(getDesktopAdditionalReviewGuidelines)).toHaveBeenCalled();
		});

		const newGuidelineInput = screen.getByRole("textbox", {
			name: /new review guideline/i,
		});
		const addGuidelineButton = screen.getByRole("button", {
			name: /add guideline/i,
		});

		expect(addGuidelineButton).toBeDisabled();

		await user.type(newGuidelineInput, "Flag risky cache invalidation.");
		expect(addGuidelineButton).toBeEnabled();
		await user.click(addGuidelineButton);

		const additionalGuidelineList = screen.getByRole("list", {
			name: /additional review guideline list/i,
		});
		expect(
			within(additionalGuidelineList).getByText("Flag risky cache invalidation."),
		).toBeInTheDocument();
		expect(newGuidelineInput).toHaveValue("");

		await user.click(screen.getByRole("button", { name: /edit/i }));
		const editGuidelineInput = screen.getByRole("textbox", {
			name: /edit review guideline/i,
		});
		await user.clear(editGuidelineInput);
		await user.type(editGuidelineInput, "Flag risky cache invalidation paths.");
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(
			screen.getByText("Flag risky cache invalidation paths."),
		).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: /remove/i }));
		expect(
			screen.queryByRole("list", { name: /additional review guideline list/i }),
		).not.toBeInTheDocument();
	});

	it("submits a new guideline when pressing enter in the additional guideline field", async () => {
		const user = userEvent.setup();

		render(
			<ReviewTitleBarTrailingHarness
				reviewHistory={[buildHistoryEntry()]}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /guidelines/i }));
		await waitFor(() => {
			expect(vi.mocked(getDesktopAdditionalReviewGuidelines)).toHaveBeenCalled();
		});

		const newGuidelineInput = screen.getByRole("textbox", {
			name: /new review guideline/i,
		});
		await user.type(newGuidelineInput, "Check rollback safety.{enter}");

		const additionalGuidelineList = screen.getByRole("list", {
			name: /additional review guideline list/i,
		});
		expect(
			within(additionalGuidelineList).getByText("Check rollback safety."),
		).toBeInTheDocument();
		expect(newGuidelineInput).toHaveValue("");
	});

	it("starts the review with only submitted additional guidelines", async () => {
		const user = userEvent.setup();
		const onStartReview = vi.fn();

		render(
			<ReviewTitleBarTrailingHarness
				reviewHistory={[buildHistoryEntry()]}
				onStartReview={onStartReview}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /guidelines/i }));
		await waitFor(() => {
			expect(vi.mocked(getDesktopAdditionalReviewGuidelines)).toHaveBeenCalled();
		});

		const newGuidelineInput = screen.getByRole("textbox", {
			name: /new review guideline/i,
		});
		await user.type(newGuidelineInput, "Check rollback safety.");
		await user.click(screen.getByRole("button", { name: /add guideline/i }));
		await user.type(newGuidelineInput, "This draft should stay unsaved.");
		await user.click(screen.getByRole("button", { name: /start ai review/i }));

		expect(onStartReview).toHaveBeenCalledWith("Check rollback safety.");
	});

	it("persists submitted additional guidelines for the same review scope", async () => {
		const user = userEvent.setup();
		const sharedRepoPath = "/tmp/example-repo";

		const firstRender = render(
			<ReviewTitleBarTrailingHarness
				reviewHistory={[buildHistoryEntry()]}
				repoPath={sharedRepoPath}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /guidelines/i }));
		await waitFor(() => {
			expect(vi.mocked(getDesktopAdditionalReviewGuidelines)).toHaveBeenCalled();
		});
		await user.type(
			screen.getByRole("textbox", { name: /new review guideline/i }),
			"Persist this guideline.{enter}",
		);
		expect(screen.getByText("Persist this guideline.")).toBeInTheDocument();

		firstRender.unmount();

		render(
			<ReviewTitleBarTrailingHarness
				reviewHistory={[buildHistoryEntry()]}
				repoPath={sharedRepoPath}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /guidelines/i }));
		await waitFor(() => {
			expect(screen.getByText("Persist this guideline.")).toBeInTheDocument();
		});
	});

	it("persists the draft additional guideline for the same review scope", async () => {
		const user = userEvent.setup();
		const sharedRepoPath = "/tmp/example-repo";

		const firstRender = render(
			<ReviewTitleBarTrailingHarness
				reviewHistory={[buildHistoryEntry()]}
				repoPath={sharedRepoPath}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /guidelines/i }));
		await waitFor(() => {
			expect(vi.mocked(getDesktopAdditionalReviewGuidelines)).toHaveBeenCalled();
		});
		await user.type(
			screen.getByRole("textbox", { name: /new review guideline/i }),
			"Unsaved draft guideline",
		);

		firstRender.unmount();

		render(
			<ReviewTitleBarTrailingHarness
				reviewHistory={[buildHistoryEntry()]}
				repoPath={sharedRepoPath}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /guidelines/i }));
		await waitFor(() => {
			expect(
				screen.getByRole("textbox", { name: /new review guideline/i }),
			).toHaveValue("Unsaved draft guideline");
		});
	});

	it("shares additional review guidelines across compare and commit mode for the same repo", async () => {
		const user = userEvent.setup();
		const sharedRepoPath = "/tmp/example-repo";

		const firstRender = render(
			<ReviewTitleBarTrailingHarness
				reviewHistory={[buildHistoryEntry()]}
				targetMode="compare"
				repoPath={sharedRepoPath}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /guidelines/i }));
		await waitFor(() => {
			expect(vi.mocked(getDesktopAdditionalReviewGuidelines)).toHaveBeenCalled();
		});
		await user.type(
			screen.getByRole("textbox", { name: /new review guideline/i }),
			"Shared repo guideline.{enter}",
		);

		firstRender.unmount();

		render(
			<ReviewTitleBarTrailingHarness
				reviewHistory={[
					buildHistoryEntry({
						target_mode: "commit",
						commit_sha: "1234567890abcdef",
					}),
				]}
				targetMode="commit"
				repoPath={sharedRepoPath}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /guidelines/i }));
		await waitFor(() => {
			expect(screen.getByText("Shared repo guideline.")).toBeInTheDocument();
		});
	});

	it("migrates legacy browser-stored additional guidelines into the durable desktop store", async () => {
		const user = userEvent.setup();
		const repoPath = "/tmp/example-repo";
		const legacyStorageKey = getAdditionalReviewGuidelinesStorageKey(
			`${repoPath}:compare`,
		);
		expect(legacyStorageKey).not.toBeNull();

		window.localStorage.setItem(
			legacyStorageKey!,
			JSON.stringify({
				draftGuideline: "Legacy draft",
				guidelines: [
					{
						id: "guideline-1",
						text: "Legacy submitted guideline",
					},
				],
			}),
		);

		render(
			<ReviewTitleBarTrailingHarness
				reviewHistory={[buildHistoryEntry()]}
				targetMode="compare"
				repoPath={repoPath}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /guidelines/i }));
		await waitFor(() => {
			expect(screen.getByText("Legacy submitted guideline")).toBeInTheDocument();
		});
		expect(
			screen.getByRole("textbox", { name: /new review guideline/i }),
		).toHaveValue("Legacy draft");
		expect(vi.mocked(saveDesktopAdditionalReviewGuidelines)).toHaveBeenCalled();
		expect(window.localStorage.getItem(legacyStorageKey!)).toBeNull();
	});

	it("shows applied guidance read-only when viewing history", async () => {
		const user = userEvent.setup();

		render(
			<ReviewTitleBarTrailingHarness
				reviewHistory={[buildHistoryEntry()]}
				isViewingHistory
			/>,
		);

		await user.click(screen.getByRole("button", { name: /guidelines/i }));
		await waitFor(() => {
			expect(vi.mocked(getDesktopAdditionalReviewGuidelines)).toHaveBeenCalled();
		});

		expect(
			screen.getByRole("textbox", { name: /applied review guidance/i }),
		).toHaveValue(
			"App-wide review guidelines:\nFocus on auth.\n\nAdditional review guidelines:\nDouble-check rollback paths.",
		);
		expect(
			screen.queryByRole("textbox", { name: /additional review guidelines/i }),
		).not.toBeInTheDocument();
	});
});
