import type { ReviewRunEvent } from "@/lib/definitions/review";
import type { ReasoningTraceEntry } from "@/pages/review/review-types";

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getPayloadMethod(event: ReviewRunEvent) {
	if (!isRecord(event.payload)) {
		return null;
	}

	return typeof event.payload.method === "string" ? event.payload.method : null;
}

function getPayloadParams(event: ReviewRunEvent) {
	if (!isRecord(event.payload)) {
		return null;
	}

	return isRecord(event.payload.params) ? event.payload.params : null;
}

function getStringField(record: Record<string, unknown> | null, key: string) {
	if (!record) {
		return null;
	}

	const value = record[key];
	return typeof value === "string" ? value : null;
}

function extractSummaryText(value: unknown) {
	if (!Array.isArray(value)) {
		return null;
	}

	const parts = value.flatMap((entry) => {
		if (!isRecord(entry)) {
			return [];
		}

		return typeof entry.text === "string" && entry.text.trim()
			? [entry.text.trim()]
			: [];
	});

	return parts.length > 0 ? parts.join("\n\n") : null;
}

function isReasoningMethod(method: string | null) {
	if (!method) {
		return false;
	}

	const normalized = method.toLowerCase();
	return normalized.includes("reason") || normalized.includes("agentmessage");
}

function isReasoningItem(item: Record<string, unknown> | null) {
	const itemType = getStringField(item, "type");
	if (!itemType) {
		return false;
	}

	const normalized = itemType.toLowerCase();
	return normalized.includes("reason") || normalized.includes("agentmessage");
}

function extractReasoningText(
	item: Record<string, unknown> | null,
	params: Record<string, unknown>,
) {
	return (
		extractSummaryText(item?.summary) ||
		extractSummaryText(params.summary) ||
		getStringField(item, "text")?.trim() ||
		getStringField(params, "text")?.trim() ||
		getStringField(params, "delta") ||
		null
	);
}

export function extractReasoningTraces(events: ReviewRunEvent[]): ReasoningTraceEntry[] {
	const tracesById = new Map<string, ReasoningTraceEntry>();
	const standaloneTraces: ReasoningTraceEntry[] = [];

	for (const event of events) {
		if (event.event_type !== "codex_notification") {
			continue;
		}

		const method = getPayloadMethod(event);
		const params = getPayloadParams(event);
		if (!params) {
			continue;
		}

		const item = isRecord(params.item) ? params.item : null;
		if (!isReasoningMethod(method) && !isReasoningItem(item)) {
			continue;
		}

		const text = extractReasoningText(item, params);
		if (!text?.trim()) {
			continue;
		}

		const isDeltaUpdate = Boolean(
			method?.toLowerCase().includes("delta") && getStringField(params, "delta"),
		);
		const normalizedText = isDeltaUpdate ? text : text.trim();
		if (normalizedText.trim() === "READY.") {
			continue;
		}

		const itemId =
			getStringField(params, "itemId") || getStringField(item, "id");

		if (!itemId) {
			standaloneTraces.push({
				id: `reasoning-${event.id}`,
				method,
				text: normalizedText.trim(),
				stableText: normalizedText.trim(),
				latestDeltaText: null,
				sequence: event.sequence,
				createdAt: event.created_at,
			});
			continue;
		}

		const existingTrace = tracesById.get(itemId);
		const nextText = isDeltaUpdate
			? `${existingTrace?.text || ""}${normalizedText}`
			: normalizedText;

		tracesById.set(itemId, {
			id: itemId,
			method,
			text: isDeltaUpdate ? nextText : nextText.trim(),
			stableText: isDeltaUpdate ? existingTrace?.text || "" : nextText.trim(),
			latestDeltaText: isDeltaUpdate ? normalizedText : null,
			sequence: event.sequence,
			createdAt: event.created_at,
		});
	}

	return [...tracesById.values(), ...standaloneTraces]
		.filter((trace) => trace.text.trim())
		.sort((left, right) => right.sequence - left.sequence);
}
