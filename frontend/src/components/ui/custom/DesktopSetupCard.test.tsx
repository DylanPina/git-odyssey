import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DesktopSetupCard } from "@/components/ui/custom/DesktopSetupCard";
import type {
	CapabilityName,
	DesktopAiValidationResult,
	DesktopHealthStatus,
	DesktopSettingsStatus,
	GoogleAITarget,
	GoogleModelGardenEntry,
} from "@/lib/definitions/desktop";

const apiMocks = vi.hoisted(() => ({
	deployGoogleModel: vi.fn(),
	listGoogleModelGarden: vi.fn(),
	saveDesktopAiConfig: vi.fn(),
	validateDesktopAiConfig: vi.fn(),
	validateGoogleTarget: vi.fn(),
}));

vi.mock("@/api/api", () => ({
	deployGoogleModel: apiMocks.deployGoogleModel,
	listGoogleModelGarden: apiMocks.listGoogleModelGarden,
	saveDesktopAiConfig: apiMocks.saveDesktopAiConfig,
	validateDesktopAiConfig: apiMocks.validateDesktopAiConfig,
	validateGoogleTarget: apiMocks.validateGoogleTarget,
}));

const geminiTarget: GoogleAITarget = {
	target_kind: "managed_model",
	resource_name: "publishers/google/models/gemini-2.5-flash",
	display_name: "Gemini 2.5 Flash",
	publisher: "google",
	version: "2.5",
	location: "us-central1",
	capabilities: ["text_generation", "review"],
	adapter_family: "gemini",
	embedding_output_dimension: null,
	source: "managed_api_model",
};

const embeddingTarget: GoogleAITarget = {
	target_kind: "managed_model",
	resource_name: "publishers/google/models/text-embedding-005",
	display_name: "Text Embedding 005",
	publisher: "google",
	version: "005",
	location: "us-central1",
	capabilities: ["embeddings"],
	adapter_family: "text_embedding",
	embedding_output_dimension: 768,
	source: "managed_api_model",
};

function catalogEntry(target: GoogleAITarget): GoogleModelGardenEntry {
	return {
		id: target.resource_name,
		resource_name: target.resource_name,
		display_name: target.display_name,
		publisher: target.publisher,
		version: target.version,
		location: target.location ?? "us-central1",
		target_kind: target.target_kind,
		source: target.source ?? "managed_api_model",
		capabilities: target.capabilities,
		adapter_family: target.adapter_family,
		deployable: false,
		description: null,
	};
}

function capabilityStatus(target: GoogleAITarget | null) {
	return {
		configured: Boolean(target),
		ready: Boolean(target),
		targetKind: target?.target_kind ?? null,
		resourceName: target?.resource_name ?? null,
		displayName: target?.display_name ?? null,
		publisher: target?.publisher ?? null,
		version: target?.version ?? null,
		location: target?.location ?? null,
		adapterFamily: target?.adapter_family ?? null,
		embeddingOutputDimension: target?.embedding_output_dimension ?? null,
	};
}

function buildSettingsStatus(
	overrides: Partial<DesktopSettingsStatus> = {},
): DesktopSettingsStatus {
	return {
		firstRunCompleted: true,
		backendPort: 48120,
		dataDir: "/tmp/git-odyssey/data",
		logDir: "/tmp/git-odyssey/logs",
		databaseUrlConfigured: true,
		aiRuntimeConfig: {
			schema_version: 2,
			google_project_id: "git-odyssey-test",
			google_location: "us-central1",
			capabilities: {
				text_generation: null,
				embeddings: null,
				review: null,
			},
		},
		savedAiProfiles: [],
		reviewSettings: {
			pullRequestGuidelines: "",
		},
		ai: {
			google: {
				projectId: "git-odyssey-test",
				location: "us-central1",
				adcReady: true,
				adcProjectId: "git-odyssey-test",
				message: null,
			},
			textGeneration: capabilityStatus(null),
			embeddings: capabilityStatus(null),
			review: capabilityStatus(null),
		},
		...overrides,
	};
}

function buildHealthStatus(): DesktopHealthStatus {
	const settings = buildSettingsStatus();
	return {
		backend: { state: "running" },
		postgres: { state: "running" },
		authentication: {
			ready: true,
			desktopBackendReachable: true,
			desktopUserAvailable: true,
		},
		ai: settings.ai,
		desktopUser: null,
		credentials: {
			secretRefs: {},
		},
		settings,
	};
}

function buildValidationResult(
	overrides: Partial<DesktopAiValidationResult> = {},
): DesktopAiValidationResult {
	return {
		text_generation: {
			configured: true,
			ready: true,
			target_kind: geminiTarget.target_kind,
			resource_name: geminiTarget.resource_name,
			display_name: geminiTarget.display_name,
			publisher: geminiTarget.publisher ?? null,
			version: geminiTarget.version ?? null,
			location: geminiTarget.location ?? null,
			adapter_family: geminiTarget.adapter_family ?? null,
			embedding_output_dimension: null,
			message: "Text probe passed.",
		},
		embeddings: {
			configured: true,
			ready: true,
			target_kind: embeddingTarget.target_kind,
			resource_name: embeddingTarget.resource_name,
			display_name: embeddingTarget.display_name,
			publisher: embeddingTarget.publisher ?? null,
			version: embeddingTarget.version ?? null,
			location: embeddingTarget.location ?? null,
			adapter_family: embeddingTarget.adapter_family ?? null,
			embedding_output_dimension: 768,
			message: "Embedding probe returned 768 dimensions.",
			reindex_required: false,
		},
		review: {
			configured: true,
			ready: true,
			target_kind: geminiTarget.target_kind,
			resource_name: geminiTarget.resource_name,
			display_name: geminiTarget.display_name,
			publisher: geminiTarget.publisher ?? null,
			version: geminiTarget.version ?? null,
			location: geminiTarget.location ?? null,
			adapter_family: geminiTarget.adapter_family ?? null,
			embedding_output_dimension: null,
			message: "Review JSON probe passed.",
		},
		...overrides,
	};
}

async function chooseTarget(capability: CapabilityName, label: RegExp) {
	const section = screen
		.getByText(
			capability === "text_generation"
				? "Chat And Summaries"
				: capability === "embeddings"
					? "Semantic Search"
					: "Code Review",
		)
		.closest("section");
	expect(section).not.toBeNull();
	await userEvent.click(within(section!).getByRole("button", { name: label }));
}

describe("DesktopSetupCard", () => {
	beforeEach(() => {
		apiMocks.deployGoogleModel.mockReset();
		apiMocks.listGoogleModelGarden.mockReset();
		apiMocks.saveDesktopAiConfig.mockReset();
		apiMocks.validateDesktopAiConfig.mockReset();
		apiMocks.validateGoogleTarget.mockReset();

		apiMocks.listGoogleModelGarden.mockResolvedValue({
			items: [catalogEntry(geminiTarget), catalogEntry(embeddingTarget)],
		});
		apiMocks.validateDesktopAiConfig.mockResolvedValue(buildValidationResult());
		apiMocks.saveDesktopAiConfig.mockResolvedValue(buildSettingsStatus());
	});

	it("browses Model Garden targets, validates every capability, then saves", async () => {
		const user = userEvent.setup();
		const onCredentialsSaved = vi.fn().mockResolvedValue(undefined);

		render(
			<DesktopSetupCard
				desktopSettingsStatus={buildSettingsStatus()}
				desktopHealth={buildHealthStatus()}
				onCredentialsSaved={onCredentialsSaved}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /browse targets/i }));

		await waitFor(() => {
			expect(apiMocks.listGoogleModelGarden).toHaveBeenCalledWith({
				googleProjectId: "git-odyssey-test",
				googleLocation: "us-central1",
			});
		});

		await chooseTarget("text_generation", /Gemini 2\.5 Flash/i);
		await chooseTarget("embeddings", /Text Embedding 005/i);
		await chooseTarget("review", /Gemini 2\.5 Flash/i);

		await user.click(screen.getByRole("button", { name: /^save$/i }));

		await waitFor(() => {
			expect(apiMocks.validateDesktopAiConfig).toHaveBeenCalledTimes(1);
		});
		await waitFor(() => {
			expect(apiMocks.saveDesktopAiConfig).toHaveBeenCalledWith({
				config: expect.objectContaining({
					schema_version: 2,
					google_project_id: "git-odyssey-test",
					google_location: "us-central1",
					capabilities: expect.objectContaining({
						text_generation: expect.objectContaining({
							resource_name: geminiTarget.resource_name,
						}),
						embeddings: expect.objectContaining({
							resource_name: embeddingTarget.resource_name,
							embedding_output_dimension: 768,
						}),
						review: expect.objectContaining({
							resource_name: geminiTarget.resource_name,
						}),
					}),
				}),
				secretValues: {},
			});
		});
		expect(onCredentialsSaved).toHaveBeenCalledTimes(1);
	});

	it("keeps saving blocked when a selected target fails its validation probe", async () => {
		const user = userEvent.setup();
		apiMocks.validateDesktopAiConfig.mockResolvedValue(
			buildValidationResult({
				review: {
					...buildValidationResult().review,
					ready: false,
					message: "Review output was not structured JSON.",
				},
			}),
		);

		render(
			<DesktopSetupCard
				desktopSettingsStatus={buildSettingsStatus()}
				desktopHealth={buildHealthStatus()}
				onCredentialsSaved={vi.fn().mockResolvedValue(undefined)}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /browse targets/i }));
		await chooseTarget("text_generation", /Gemini 2\.5 Flash/i);
		await chooseTarget("embeddings", /Text Embedding 005/i);
		await chooseTarget("review", /Gemini 2\.5 Flash/i);
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		await waitFor(() => {
			expect(screen.getByText(/validation failed/i)).toBeInTheDocument();
		});
		expect(apiMocks.saveDesktopAiConfig).not.toHaveBeenCalled();
	});
});
