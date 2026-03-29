import { describe, expect, it } from "vitest";

import {
	formatCommitTimestamp,
	formatShortSha,
	getCommitTitle,
	splitCommitMessage,
} from "@/lib/commitPresentation";

describe("commitPresentation", () => {
	it("splits commit messages into subject and body", () => {
		expect(
			splitCommitMessage("Fix login regression\n\nHandle null sessions"),
		).toEqual({
			subject: "Fix login regression",
			body: "Handle null sessions",
		});
	});

	it("formats short SHAs with fallbacks", () => {
		expect(formatShortSha("1234567890abcdef")).toBe("12345678");
		expect(formatShortSha("1234567890abcdef", 4)).toBe("1234");
		expect(formatShortSha(null)).toBe("Unavailable");
	});

	it("builds commit titles from the subject first and sha second", () => {
		expect(
			getCommitTitle({
				sha: "1234567890abcdef",
				message: "Refactor review panel\n\nMove hook wiring",
			}),
		).toBe("Refactor review panel");
		expect(
			getCommitTitle({
				sha: "1234567890abcdef",
				message: "",
			}),
		).toBe("Commit 1234567890ab");
	});

	it("formats commit timestamps with the provided options", () => {
		const timestamp = 1_700_000_000;
		expect(
			formatCommitTimestamp(timestamp, {
				month: "short",
				day: "numeric",
				year: "numeric",
			}),
		).toBe(
			new Date(timestamp * 1000).toLocaleString(undefined, {
				month: "short",
				day: "numeric",
				year: "numeric",
			}),
		);
	});
});
