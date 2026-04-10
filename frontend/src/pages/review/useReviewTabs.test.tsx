import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	cancelReviewRun,
	getReviewSession,
	onReviewRuntimeEvent,
} from "@/api/api";
import type {
	ReviewResult,
	ReviewRun,
	ReviewSession,
} from "@/lib/definitions/review";
import { buildReviewRoute } from "@/lib/repoPaths";
import {
	REVIEW_TABS_STORAGE_VERSION,
} from "@/pages/review/review-constants";
import {
	getReviewRefsStorageKey,
	getReviewTabsStorageKey,
} from "@/pages/review/review-storage";
import type {
	PersistedReviewTabsState,
	ReviewTab,
} from "@/pages/review/review-types";
import {
	getRelativeReviewTabId,
	useReviewTabs,
} from "@/pages/review/useReviewTabs";

vi.mock("@/api/api", () => ({
	cancelReviewRun: vi.fn(),
	getReviewSession: vi.fn(),
	onReviewRuntimeEvent: vi.fn(),
}));

const repoPath = "/tmp/example-repo";

function buildReviewResult(
	overrides: Partial<ReviewResult> = {},
): ReviewResult {
	return {
		id: "result-1",
		run_id: "run-1",
		summary: "Review summary",
		findings: [],
		partial: false,
		generated_at: "2026-04-01T12:00:00.000Z",
		created_at: "2026-04-01T12:00:00.000Z",
		updated_at: "2026-04-01T12:00:00.000Z",
		...overrides,
	};
}

function buildReviewRun(overrides: Partial<ReviewRun> = {}): ReviewRun {
	return {
		id: "run-1",
		session_id: "session-1",
		engine: "codex_cli",
		mode: "native_review",
		status: "completed",
		error_detail: null,
		review_thread_id: null,
		worktree_path: null,
		codex_home_path: null,
		started_at: "2026-04-01T12:00:00.000Z",
		completed_at: "2026-04-01T12:01:00.000Z",
		created_at: "2026-04-01T12:00:00.000Z",
		updated_at: "2026-04-01T12:01:00.000Z",
		events: [],
		approvals: [],
		result: buildReviewResult(),
		...overrides,
	};
}

function buildReviewSession(overrides: Partial<ReviewSession> = {}): ReviewSession {
	return {
		id: "session-1",
		repo_path: repoPath,
		target_mode: "compare",
		base_ref: "main",
		head_ref: "feature",
		commit_sha: null,
		merge_base_sha: "merge-sha",
		base_head_sha: "base-sha",
		head_head_sha: "head-sha",
		stats: {
			files_changed: 1,
			additions: 5,
			deletions: 1,
		},
		file_changes: [],
		truncated: false,
		status: "completed",
		created_at: "2026-04-01T12:00:00.000Z",
		updated_at: "2026-04-01T12:01:00.000Z",
		runs: [buildReviewRun()],
		...overrides,
	};
}

function buildCompareTab(overrides: Partial<ReviewTab> = {}): ReviewTab {
	return {
		id: overrides.id ?? "tab-compare",
		target: {
			mode: "compare",
			baseRef: "main",
			headRef: "feature",
		},
		sessionId: null,
		sessionStatus: null,
		sessionBaseHeadSha: null,
		sessionHeadHeadSha: null,
		latestRunId: null,
		latestRunStatus: null,
		latestSummary: null,
		latestFindingsCount: null,
		createdAt: "2026-04-01T12:00:00.000Z",
		updatedAt: "2026-04-01T12:00:00.000Z",
		...overrides,
	};
}

function buildCommitTab(overrides: Partial<ReviewTab> = {}): ReviewTab {
	return {
		id: overrides.id ?? "tab-commit",
		target: {
			mode: "commit",
			commitSha: "abcdef1234567890",
			searchContext: null,
		},
		sessionId: null,
		sessionStatus: null,
		sessionBaseHeadSha: null,
		sessionHeadHeadSha: null,
		latestRunId: null,
		latestRunStatus: null,
		latestSummary: null,
		latestFindingsCount: null,
		createdAt: "2026-04-01T12:00:00.000Z",
		updatedAt: "2026-04-01T12:00:00.000Z",
		...overrides,
	};
}

function seedTabsState(state: PersistedReviewTabsState) {
	localStorage.setItem(
		getReviewTabsStorageKey(repoPath)!,
		JSON.stringify(state),
	);
}

describe("useReviewTabs", () => {
	const navigate = vi.fn();
	let runtimeListener:
		| ((event: { type: string; sessionId?: string; runId?: string }) => void)
		| null = null;

	beforeEach(() => {
		localStorage.clear();
		navigate.mockReset();
		runtimeListener = null;
		vi.mocked(cancelReviewRun).mockReset();
		vi.mocked(getReviewSession).mockReset();
		vi.mocked(onReviewRuntimeEvent).mockImplementation((listener) => {
			runtimeListener = listener as typeof runtimeListener;
			return () => {
				runtimeListener = null;
			};
		});
		vi.spyOn(window, "confirm").mockReturnValue(true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
		localStorage.clear();
	});

	it("falls back to the stored active tab when the route tab id is stale", async () => {
		seedTabsState({
			version: REVIEW_TABS_STORAGE_VERSION,
			activeTabId: "tab-commit",
			tabs: [
				buildCompareTab({ id: "tab-compare" }),
				buildCommitTab({ id: "tab-commit" }),
			],
		});

		const { result } = renderHook(() =>
			useReviewTabs({
				repoPath,
				reviewTarget: {
					mode: "compare",
					baseRef: null,
					headRef: null,
				},
				routeTabId: "missing-tab",
				branches: [],
				commits: [],
				isRepoLoading: true,
				navigate,
			}),
		);

		await waitFor(() => {
			expect(result.current.activeTabId).toBe("tab-commit");
		});

		expect(navigate).toHaveBeenLastCalledWith(
			buildReviewRoute(
				repoPath,
				{
					mode: "commit",
					commitSha: "abcdef1234567890",
				},
				{ tabId: "tab-commit" },
			),
			{ replace: true },
		);
	});

	it("creates a new tab from a legacy commit route and normalizes the url", async () => {
		const { result } = renderHook(() =>
			useReviewTabs({
				repoPath,
				reviewTarget: {
					mode: "commit",
					commitSha: "fedcba0987654321",
					searchContext: null,
				},
				routeTabId: null,
				branches: [],
				commits: [],
				isRepoLoading: true,
				navigate,
			}),
		);

		await waitFor(() => {
			expect(result.current.tabs).toHaveLength(1);
			expect(result.current.activeTarget).toEqual({
				mode: "commit",
				commitSha: "fedcba0987654321",
				searchContext: null,
			});
		});

		const activeTabId = result.current.activeTabId;
		expect(activeTabId).toBeTruthy();
		expect(navigate).toHaveBeenLastCalledWith(
			buildReviewRoute(
				repoPath,
				{
					mode: "commit",
					commitSha: "fedcba0987654321",
					searchContext: null,
				},
				{ tabId: activeTabId },
			),
			{ replace: true },
		);
	});

	it("reuses an existing compare tab when retargeting the active tab to an open branch pair", async () => {
		seedTabsState({
			version: REVIEW_TABS_STORAGE_VERSION,
			activeTabId: "tab-a",
			tabs: [
				buildCompareTab({
					id: "tab-a",
					target: {
						mode: "compare",
						baseRef: "main",
						headRef: "feature",
					},
				}),
				buildCompareTab({
					id: "tab-b",
					target: {
						mode: "compare",
						baseRef: "main",
						headRef: "release",
					},
				}),
			],
		});

		const { result } = renderHook(() =>
			useReviewTabs({
				repoPath,
				reviewTarget: {
					mode: "compare",
					baseRef: null,
					headRef: null,
				},
				routeTabId: "tab-a",
				branches: [],
				commits: [],
				isRepoLoading: true,
				navigate,
			}),
		);

		await act(async () => {
			await result.current.updateActiveCompareRefs("main", "release");
		});

		await waitFor(() => {
			expect(result.current.activeTabId).toBe("tab-b");
			expect(result.current.tabs).toHaveLength(1);
		});
	});

	it("computes next and previous tab ids with wraparound", () => {
		const tabs = [
			buildCompareTab({ id: "tab-a" }),
			buildCompareTab({ id: "tab-b" }),
			buildCompareTab({ id: "tab-c" }),
		];

		expect(getRelativeReviewTabId(tabs, "tab-a", 1)).toBe("tab-b");
		expect(getRelativeReviewTabId(tabs, "tab-b", 1)).toBe("tab-c");
		expect(getRelativeReviewTabId(tabs, "tab-c", 1)).toBe("tab-a");
		expect(getRelativeReviewTabId(tabs, "tab-a", -1)).toBe("tab-c");
	});

	it("cancels an active run before closing the last tab and replaces it with a fresh compare tab", async () => {
		localStorage.setItem(
			getReviewRefsStorageKey(repoPath)!,
			JSON.stringify({ baseRef: "main", headRef: "feature" }),
		);
		seedTabsState({
			version: REVIEW_TABS_STORAGE_VERSION,
			activeTabId: "tab-running",
			tabs: [
				buildCompareTab({
					id: "tab-running",
					sessionId: "session-running",
					latestRunId: "run-running",
					latestRunStatus: "running",
				}),
			],
		});
		vi.mocked(cancelReviewRun).mockResolvedValue(buildReviewRun({ status: "cancelled" }));

		const { result } = renderHook(() =>
			useReviewTabs({
				repoPath,
				reviewTarget: {
					mode: "compare",
					baseRef: null,
					headRef: null,
				},
				routeTabId: "tab-running",
				branches: [],
				commits: [],
				isRepoLoading: true,
				navigate,
			}),
		);

		await act(async () => {
			await result.current.closeTab("tab-running");
		});

		await waitFor(() => {
			expect(result.current.tabs).toHaveLength(1);
			expect(result.current.activeTab?.id).not.toBe("tab-running");
		});

		expect(vi.mocked(cancelReviewRun)).toHaveBeenCalledWith({
			sessionId: "session-running",
			runId: "run-running",
		});
		expect(result.current.activeTarget).toEqual({
			mode: "compare",
			baseRef: "main",
			headRef: "feature",
		});
		expect(result.current.activeTab?.sessionId).toBeNull();
	});

	it("refreshes inactive tab summaries from runtime events", async () => {
		vi.useFakeTimers();
		seedTabsState({
			version: REVIEW_TABS_STORAGE_VERSION,
			activeTabId: "tab-active",
			tabs: [
				buildCompareTab({ id: "tab-active" }),
				buildCompareTab({
					id: "tab-inactive",
					sessionId: "session-2",
					latestRunId: "run-2",
					latestRunStatus: "running",
				}),
			],
		});
		vi.mocked(getReviewSession).mockResolvedValue(
			buildReviewSession({
				id: "session-2",
				runs: [
					buildReviewRun({
						id: "run-2",
						session_id: "session-2",
						status: "completed",
						result: buildReviewResult({
							findings: [
								{
									id: "finding-1",
									severity: "medium",
									title: "Issue",
									body: "Body",
									file_path: "src/file.ts",
									new_start: 4,
								},
								{
									id: "finding-2",
									severity: "low",
									title: "Nit",
									body: "Body",
									file_path: "src/file.ts",
									new_start: 8,
								},
							],
						}),
					}),
				],
			}),
		);

		const { result } = renderHook(() =>
			useReviewTabs({
				repoPath,
				reviewTarget: {
					mode: "compare",
					baseRef: null,
					headRef: null,
				},
				routeTabId: "tab-active",
				branches: [],
				commits: [],
				isRepoLoading: true,
				navigate,
			}),
		);

		expect(runtimeListener).toBeTypeOf("function");

		await act(async () => {
			runtimeListener?.({
				type: "review-runtime-changed",
				sessionId: "session-2",
				runId: "run-2",
			});
			await vi.advanceTimersByTimeAsync(200);
		});

		const inactiveTab = result.current.tabs.find((tab) => tab.id === "tab-inactive");
		expect(inactiveTab?.latestRunStatus).toBe("completed");
		expect(inactiveTab?.latestFindingsCount).toBe(2);
	});
});
