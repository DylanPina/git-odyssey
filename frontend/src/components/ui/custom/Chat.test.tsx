import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import Chat from "@/components/ui/custom/Chat";
import type { ChatMessage } from "@/lib/definitions/chat";
import type { GoogleAITarget } from "@/lib/definitions/desktop";

const configuredTarget: GoogleAITarget = {
	target_kind: "managed_model",
	resource_name: "publishers/google/models/gemini-2.5-flash",
	display_name: "Gemini 2.5 Flash",
	publisher: "google",
	version: "2.5",
	location: "us-central1",
	capabilities: ["text_generation"],
	adapter_family: "gemini",
	embedding_output_dimension: null,
	source: "managed_api_model",
};

function buildMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
	return {
		id: "message-1",
		role: "assistant",
		content: "Repository summary",
		timestamp: new Date("2026-04-18T10:00:00.000Z"),
		...overrides,
	};
}

describe("Chat", () => {
	it("renders a repo chat target picker and allows the configured target", async () => {
		const user = userEvent.setup();
		const onSelectedTargetChange = vi.fn();

		render(
			<Chat
				selectedTarget={null}
				configuredTarget={configuredTarget}
				onSelectedTargetChange={onSelectedTargetChange}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /select chat target/i }));
		await user.click(screen.getByRole("button", { name: /Gemini 2\.5 Flash/i }));

		expect(onSelectedTargetChange).toHaveBeenCalledWith(configuredTarget);
	});

	it("accepts manual Google AI resources from the repo chat picker", async () => {
		const user = userEvent.setup();
		const onSelectedTargetChange = vi.fn();
		const endpointResource =
			"projects/git-odyssey-test/locations/us-central1/endpoints/123";

		render(
			<Chat
				selectedTarget={configuredTarget}
				onSelectedTargetChange={onSelectedTargetChange}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /select chat target/i }));
		await user.clear(screen.getByLabelText(/manual google ai resource/i));
		await user.type(screen.getByLabelText(/manual google ai resource/i), endpointResource);

		expect(onSelectedTargetChange).toHaveBeenLastCalledWith(
			expect.objectContaining({
				target_kind: "vertex_endpoint",
				resource_name: endpointResource,
				source: "manual_resource_name",
			}),
		);
	});

	it("keeps send behavior and target picker together in the composer footer", async () => {
		const user = userEvent.setup();
		const onSendMessage = vi.fn();

		render(
			<Chat
				onSendMessage={onSendMessage}
				selectedTarget={configuredTarget}
				onSelectedTargetChange={() => {}}
				messages={[buildMessage()]}
			/>,
		);

		await user.type(
			screen.getByPlaceholderText(/ask about this repository/i),
			"Summarize this repo{enter}",
		);

		expect(onSendMessage).toHaveBeenCalledWith("Summarize this repo");
		expect(
			screen.getByRole("button", { name: /select chat target/i }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /send message/i })).toBeInTheDocument();
	});

	it("disables the target picker while chat is loading", () => {
		render(
			<Chat
				isLoading
				selectedTarget={configuredTarget}
				onSelectedTargetChange={() => {}}
			/>,
		);

		expect(
			screen.getByRole("button", { name: /select chat target/i }),
		).toBeDisabled();
	});
});
