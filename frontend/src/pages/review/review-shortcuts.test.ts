import { describe, expect, it } from "vitest";

import { getReviewTabShortcutDirection } from "@/pages/review/review-shortcuts";

describe("getReviewTabShortcutDirection", () => {
	it("maps chrome mac tab shortcuts to previous and next tab", () => {
		expect(
			getReviewTabShortcutDirection({
				key: "ArrowLeft",
				ctrlKey: false,
				metaKey: true,
				shiftKey: false,
				altKey: true,
			}),
		).toBe("previous");

		expect(
			getReviewTabShortcutDirection({
				key: "ArrowRight",
				ctrlKey: false,
				metaKey: true,
				shiftKey: false,
				altKey: true,
			}),
		).toBe("next");
	});

	it("maps chrome windows linux tab shortcuts and ignores non-chrome variants", () => {
		expect(
			getReviewTabShortcutDirection({
				key: "Tab",
				ctrlKey: true,
				metaKey: false,
				shiftKey: false,
				altKey: false,
			}),
		).toBe("next");

		expect(
			getReviewTabShortcutDirection({
				key: "Tab",
				ctrlKey: true,
				metaKey: false,
				shiftKey: true,
				altKey: false,
			}),
		).toBe("previous");

		expect(
			getReviewTabShortcutDirection({
				key: "PageDown",
				ctrlKey: true,
				metaKey: false,
				shiftKey: false,
				altKey: true,
			}),
		).toBeNull();

		expect(
			getReviewTabShortcutDirection({
				key: "[",
				ctrlKey: false,
				metaKey: true,
				shiftKey: true,
				altKey: false,
			}),
		).toBeNull();
	});
});
