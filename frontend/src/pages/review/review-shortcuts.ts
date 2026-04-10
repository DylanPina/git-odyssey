export type ReviewTabShortcutDirection = "next" | "previous";

type ReviewTabShortcutEvent = {
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
};

export function getReviewTabShortcutDirection(
	event: ReviewTabShortcutEvent,
): ReviewTabShortcutDirection | null {
	const key = event.key;
	if (event.metaKey && event.altKey && !event.ctrlKey && !event.shiftKey) {
		if (key === "ArrowLeft") {
			return "previous";
		}

		if (key === "ArrowRight") {
			return "next";
		}
	}

	if (event.ctrlKey && !event.metaKey && !event.altKey) {
		if (key === "Tab") {
			return event.shiftKey ? "previous" : "next";
		}

		if (!event.shiftKey && key === "PageDown") {
			return "next";
		}

		if (!event.shiftKey && key === "PageUp") {
			return "previous";
		}
	}

	return null;
}
