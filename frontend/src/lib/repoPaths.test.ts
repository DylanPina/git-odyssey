import { describe, expect, it } from "vitest";

import {
	buildReviewRoute,
	readReviewTabIdFromSearchParams,
	readReviewTargetFromSearchParams,
} from "@/lib/repoPaths";

describe("repoPaths review routes", () => {
	it("builds compare review routes", () => {
		expect(
			buildReviewRoute("/tmp/example-repo", {
				mode: "compare",
				baseRef: "main",
				headRef: "feature",
			}),
		).toBe("/repo/review?path=%2Ftmp%2Fexample-repo&base=main&head=feature");
	});

	it("builds review routes with a tab id", () => {
		expect(
			buildReviewRoute(
				"/tmp/example-repo",
				{
					mode: "compare",
					baseRef: "main",
					headRef: "feature",
				},
				{ tabId: "tab-123" },
			),
		).toBe(
			"/repo/review?path=%2Ftmp%2Fexample-repo&tab=tab-123&base=main&head=feature",
		);
	});

	it("builds commit review routes with search context", () => {
		expect(
			buildReviewRoute("/tmp/example-repo", {
				mode: "commit",
				commitSha: "abcdef1234567890",
				searchContext: {
					query: "auth",
					matchType: "hunk",
					filePath: "src/auth.ts",
					newStart: 42,
					oldStart: null,
					highlightStrategy: "target_hunk",
				},
			}),
		).toBe(
			"/repo/review?path=%2Ftmp%2Fexample-repo&commit=abcdef1234567890&match_type=hunk&highlight_strategy=target_hunk&search=auth&match_file=src%2Fauth.ts&match_new_start=42",
		);
	});

	it("parses commit review targets from search params", () => {
		const target = readReviewTargetFromSearchParams(
			new URLSearchParams(
				"path=%2Ftmp%2Fexample-repo&commit=abcdef1234567890&match_type=hunk&highlight_strategy=target_hunk&match_file=src%2Fauth.ts",
			),
		);

		expect(target).toEqual({
			mode: "commit",
			commitSha: "abcdef1234567890",
			searchContext: {
				query: null,
				matchType: "hunk",
				filePath: "src/auth.ts",
				newStart: null,
				oldStart: null,
				highlightStrategy: "target_hunk",
			},
		});
	});

	it("parses compare review targets from search params", () => {
		expect(
			readReviewTargetFromSearchParams(
				new URLSearchParams("path=%2Ftmp%2Fexample-repo&base=main&head=feature"),
			),
		).toEqual({
			mode: "compare",
			baseRef: "main",
			headRef: "feature",
		});
	});

	it("parses review tab ids from search params", () => {
		expect(
			readReviewTabIdFromSearchParams(
				new URLSearchParams("path=%2Ftmp%2Fexample-repo&tab=tab-123"),
			),
		).toBe("tab-123");
	});
});
