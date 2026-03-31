import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Branch, Commit } from "@/lib/definitions/repo";
import { buildReviewRoute } from "@/lib/repoPaths";
import { useReviewRefSelection } from "@/pages/review/useReviewRefSelection";

const repoPath = "/tmp/example-repo";
const storageKey = "git-odyssey.review.selected_refs:%2Ftmp%2Fexample-repo";

function buildBranch(name: string, commits: string[]): Branch {
	return {
		name,
		repo_path: repoPath,
		commits,
	};
}

function buildCommit(sha: string): Commit {
	return {
		sha,
		repo_path: repoPath,
		message: `Commit ${sha}`,
		author: "Author",
		time: 1_700_000_000,
		file_changes: [],
		parents: [],
		summary: null,
	};
}

describe("useReviewRefSelection", () => {
	beforeEach(() => {
		const store: Record<string, string> = {};
		Object.defineProperty(window, "localStorage", {
			configurable: true,
			value: {
				getItem: (key: string) => store[key] ?? null,
				setItem: (key: string, value: string) => {
					store[key] = value;
				},
				removeItem: (key: string) => {
					delete store[key];
				},
			},
		});
	});

	it("restores stored refs, resolves branch tips, and backfills the route", async () => {
		const navigate = vi.fn();
		window.localStorage.setItem(
			storageKey,
			JSON.stringify({ baseRef: "main", headRef: "feature" }),
		);

		const { result } = renderHook(() =>
			useReviewRefSelection({
				repoPath,
				queryBaseRef: null,
				queryHeadRef: null,
				branches: [
					buildBranch("main", ["aaaaaaaa"]),
					buildBranch("feature", ["bbbbbbbb"]),
				],
				commits: [buildCommit("aaaaaaaa"), buildCommit("bbbbbbbb")],
				isRepoLoading: false,
				navigate,
			}),
		);

		await waitFor(() => {
			expect(result.current.baseRef).toBe("main");
			expect(result.current.headRef).toBe("feature");
		});

		expect(result.current.baseTipCommit?.sha).toBe("aaaaaaaa");
		expect(result.current.headTipCommit?.sha).toBe("bbbbbbbb");
		expect(navigate).toHaveBeenCalledWith(
			buildReviewRoute(repoPath, "main", "feature"),
			{ replace: true },
		);
	});

	it("clears invalid refs once branch data is available", async () => {
		const navigate = vi.fn();

		const { result } = renderHook(() =>
			useReviewRefSelection({
				repoPath,
				queryBaseRef: "missing",
				queryHeadRef: "feature",
				branches: [
					buildBranch("main", ["aaaaaaaa"]),
					buildBranch("feature", ["bbbbbbbb"]),
				],
				commits: [buildCommit("aaaaaaaa"), buildCommit("bbbbbbbb")],
				isRepoLoading: false,
				navigate,
			}),
		);

		await waitFor(() => {
			expect(result.current.baseRef).toBe("");
			expect(result.current.headRef).toBe("feature");
		});

		expect(window.localStorage.getItem(storageKey)).toBe(
			JSON.stringify({ baseRef: "", headRef: "feature" }),
		);
	});

	it("preserves stored refs during initial empty repo hydration", async () => {
		const navigate = vi.fn();
		window.localStorage.setItem(
			storageKey,
			JSON.stringify({ baseRef: "main", headRef: "feature" }),
		);

		const { result, rerender } = renderHook(
			({
				branches,
				commits,
				isRepoLoading,
			}: {
				branches: Branch[];
				commits: Commit[];
				isRepoLoading: boolean;
			}) =>
				useReviewRefSelection({
					repoPath,
					queryBaseRef: null,
					queryHeadRef: null,
					branches,
					commits,
					isRepoLoading,
					navigate,
				}),
			{
				initialProps: {
					branches: [] as Branch[],
					commits: [] as Commit[],
					isRepoLoading: false,
				},
			},
		);

		expect(result.current.baseRef).toBe("main");
		expect(result.current.headRef).toBe("feature");
		expect(window.localStorage.getItem(storageKey)).toBe(
			JSON.stringify({ baseRef: "main", headRef: "feature" }),
		);

		rerender({
			branches: [
				buildBranch("main", ["aaaaaaaa"]),
				buildBranch("feature", ["bbbbbbbb"]),
			],
			commits: [buildCommit("aaaaaaaa"), buildCommit("bbbbbbbb")],
			isRepoLoading: false,
		});

		await waitFor(() => {
			expect(result.current.baseTipCommit?.sha).toBe("aaaaaaaa");
			expect(result.current.headTipCommit?.sha).toBe("bbbbbbbb");
		});
	});
});
