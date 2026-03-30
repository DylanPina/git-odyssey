export type ReviewChatReferenceTarget = {
	filePath: string;
	line?: number | null;
};

export type ReviewChatReferenceMatch = {
	start: number;
	end: number;
	text: string;
	target: ReviewChatReferenceTarget;
};

type ReviewChatReferenceMatcher = {
	findMatches: (text: string) => ReviewChatReferenceMatch[];
	resolveExactReference: (text: string) => ReviewChatReferenceTarget | null;
};

const LEADING_REFERENCE_CHAR = /[A-Za-z0-9_./-]/;
const TRAILING_REFERENCE_CHAR = /[A-Za-z0-9_/-]/;

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasInvalidLeadingBoundary(text: string, start: number) {
	if (start <= 0) {
		return false;
	}

	return LEADING_REFERENCE_CHAR.test(text[start - 1] ?? "");
}

function hasInvalidTrailingBoundary(text: string, end: number) {
	const nextChar = text[end] ?? "";
	if (!nextChar) {
		return false;
	}

	if (TRAILING_REFERENCE_CHAR.test(nextChar)) {
		return true;
	}

	if (
		nextChar === "." &&
		TRAILING_REFERENCE_CHAR.test(text[end + 1] ?? "")
	) {
		return true;
	}

	return false;
}

export function createReviewChatReferenceMatcher(
	validPaths: readonly string[],
): ReviewChatReferenceMatcher | null {
	const uniquePaths = Array.from(
		new Set(validPaths.filter((path) => path.trim().length > 0)),
	).sort((left, right) => right.length - left.length);

	if (uniquePaths.length === 0) {
		return null;
	}

	const pathAlternation = uniquePaths.map(escapeRegExp).join("|");
	const referencePattern = new RegExp(
		`(${pathAlternation})(?::(\\d+)(?:-\\d+)?|#L(\\d+)(?:-L?(\\d+))?)?`,
		"g",
	);

	const findMatches = (text: string): ReviewChatReferenceMatch[] => {
		if (!text) {
			return [];
		}

		const matches: ReviewChatReferenceMatch[] = [];

		for (const match of text.matchAll(referencePattern)) {
			const matchedText = match[0];
			const matchedPath = match[1];
			const start = match.index ?? -1;
			if (!matchedText || !matchedPath || start < 0) {
				continue;
			}

			const end = start + matchedText.length;
			if (
				hasInvalidLeadingBoundary(text, start) ||
				hasInvalidTrailingBoundary(text, end)
			) {
				continue;
			}

			const line =
				match[2] != null
					? Number.parseInt(match[2], 10)
					: match[3] != null
						? Number.parseInt(match[3], 10)
						: null;

			matches.push({
				start,
				end,
				text: matchedText,
				target: {
					filePath: matchedPath,
					line,
				},
			});
		}

		return matches;
	};

	const resolveExactReference = (text: string) => {
		const matches = findMatches(text);
		if (matches.length !== 1) {
			return null;
		}

		const [match] = matches;
		if (match.start !== 0 || match.end !== text.length) {
			return null;
		}

		return match.target;
	};

	return {
		findMatches,
		resolveExactReference,
	};
}
