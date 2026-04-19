import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DesktopSetupCard } from "@/components/ui/custom/DesktopSetupCard";
import type {
	DesktopAiSavedProfile,
	DesktopHealthStatus,
	DesktopSettingsStatus,
} from "@/lib/definitions/desktop";

const apiMocks = vi.hoisted(() => ({
	deleteDesktopAiProfile: vi.fn(),
	saveDesktopAiConfig: vi.fn(),
	saveDesktopAiProfile: vi.fn(),
	validateDesktopAiConfig: vi.fn(),
}));

vi.mock("@/api/api", () => ({
	deleteDesktopAiProfile: apiMocks.deleteDesktopAiProfile,
	saveDesktopAiConfig: apiMocks.saveDesktopAiConfig,
	saveDesktopAiProfile: apiMocks.saveDesktopAiProfile,
	validateDesktopAiConfig: apiMocks.validateDesktopAiConfig,
}));

function buildSettingsStatus(
	savedAiProfiles: DesktopAiSavedProfile[] = [],
): DesktopSettingsStatus {
	return {
		firstRunCompleted: true,
		backendPort: 48120,
		dataDir: "/tmp/git-odyssey/data",
		logDir: "/tmp/git-odyssey/logs",
		databaseUrlConfigured: true,
		aiRuntimeConfig: {
			schema_version: 1,
			profiles: [
				{
					id: "openai-default",
					provider_type: "openai",
					label: "OpenAI",
					base_url: "https://api.openai.com",
					auth_mode: "bearer",
					api_key_secret_ref: "provider:openai-default:api-key",
					supports_text_generation: true,
					supports_embeddings: true,
				},
			],
			capabilities: {
				text_generation: {
					provider_profile_id: "openai-default",
					model_id: "gpt-5.4-mini",
					temperature: 0.2,
					reasoning_effort: null,
				},
				embeddings: null,
			},
		},
		savedAiProfiles,
		reviewSettings: {
			pullRequestGuidelines: "",
		},
		ai: {
			textGeneration: {
				configured: true,
				ready: true,
				providerType: "openai",
				modelId: "gpt-5.4-mini",
				baseUrl: "https://api.openai.com",
				authMode: "bearer",
				secretPresent: true,
			},
			embeddings: {
				configured: false,
				ready: false,
				providerType: null,
				modelId: null,
				baseUrl: null,
				authMode: null,
				secretPresent: false,
				message: "Semantic search is disabled.",
			},
		},
	};
}

function buildHealthStatus(): DesktopHealthStatus {
	return {
		backend: { state: "running" },
		postgres: { state: "running" },
		authentication: {
			ready: true,
			desktopBackendReachable: true,
			desktopUserAvailable: true,
		},
		ai: {
			textGeneration: {
				configured: true,
				ready: true,
				providerType: "openai",
				modelId: "gpt-5.4-mini",
				baseUrl: "https://api.openai.com",
				authMode: "bearer",
				secretPresent: true,
			},
			embeddings: {
				configured: false,
				ready: false,
				providerType: null,
				modelId: null,
				baseUrl: null,
				authMode: null,
				secretPresent: false,
				message: "Semantic search is disabled.",
			},
		},
		desktopUser: null,
		credentials: {
			secretRefs: {
				"provider:openai-default:api-key": true,
			},
		},
		settings: buildSettingsStatus(),
	};
}

describe("DesktopSetupCard", () => {
	it("loads, saves, updates, and deletes saved AI profiles without auto-applying the runtime", async () => {
		const user = userEvent.setup();
		const onCredentialsSaved = vi.fn().mockResolvedValue(undefined);
		const existingProfile: DesktopAiSavedProfile = {
			id: "profile-local",
			name: "Local runtime",
			config: {
				schema_version: 1,
				profiles: [
					{
						id: "text-provider",
						provider_type: "openai_compatible",
						label: "Local runtime",
						base_url: "http://127.0.0.1:11434/v1/responses",
						auth_mode: "bearer",
						api_key_secret_ref: "provider:text-provider:api-key",
						supports_text_generation: true,
						supports_embeddings: false,
					},
				],
				capabilities: {
						text_generation: {
							provider_profile_id: "text-provider",
							model_id: "llama-3.1",
							temperature: 0.4,
							reasoning_effort: "high",
						},
					embeddings: null,
				},
			},
			secretValues: {
				"provider:text-provider:api-key": "sk-profile",
			},
			updatedAt: "2026-04-18T10:00:00.000Z",
		};
		const createdProfile: DesktopAiSavedProfile = {
			id: "profile-weekend",
			name: "Weekend profile",
			config: {
				...existingProfile.config,
				capabilities: {
					text_generation: {
						provider_profile_id: "text-provider",
						model_id: "llama-3.1-instruct",
						temperature: 0.4,
						reasoning_effort: "minimal",
					},
					embeddings: null,
				},
			},
			secretValues: {
				"provider:text-provider:api-key": "sk-profile",
			},
			updatedAt: "2026-04-18T11:00:00.000Z",
		};

		apiMocks.saveDesktopAiProfile
			.mockResolvedValueOnce(buildSettingsStatus([createdProfile, existingProfile]))
			.mockResolvedValueOnce(buildSettingsStatus([createdProfile, existingProfile]));
		apiMocks.deleteDesktopAiProfile.mockResolvedValue(
			buildSettingsStatus([createdProfile]),
		);
		apiMocks.saveDesktopAiConfig.mockResolvedValue(buildSettingsStatus([createdProfile]));

		render(
			<DesktopSetupCard
				desktopSettingsStatus={buildSettingsStatus([existingProfile])}
				desktopHealth={buildHealthStatus()}
				onCredentialsSaved={onCredentialsSaved}
			/>,
		);

		const savedProfilesSelect = screen.getByRole("combobox", {
			name: /saved profiles/i,
		});
		const modelInput = screen.getByRole("textbox", { name: /model id/i });
		const apiKeyInput = screen.getByLabelText(/api key/i);
		const reasoningEffortSelect = screen.getAllByRole("combobox")[2];

		await user.selectOptions(savedProfilesSelect, "profile-local");
		await user.click(screen.getByRole("button", { name: /^load$/i }));

		expect(modelInput).toHaveValue("llama-3.1");
		expect(apiKeyInput).toHaveValue("sk-profile");
		expect(reasoningEffortSelect).toHaveValue("high");
		expect(apiMocks.saveDesktopAiConfig).not.toHaveBeenCalled();

		await user.clear(modelInput);
		await user.type(modelInput, "llama-3.1-instruct");
		await user.selectOptions(reasoningEffortSelect, "minimal");
		expect(savedProfilesSelect).toHaveValue("profile-local");

		const newProfileNameInput = screen.getByRole("textbox", {
			name: /new profile name/i,
		});
		await user.type(newProfileNameInput, "Weekend profile");
		await user.click(
			screen.getByRole("button", { name: /save as new profile/i }),
		);

		await waitFor(() => {
			expect(apiMocks.saveDesktopAiProfile).toHaveBeenNthCalledWith(
				1,
				expect.objectContaining({
					name: "Weekend profile",
					config: expect.objectContaining({
						capabilities: expect.objectContaining({
							text_generation: expect.objectContaining({
								model_id: "llama-3.1-instruct",
								reasoning_effort: "minimal",
							}),
						}),
					}),
				}),
			);
		});

		await user.selectOptions(savedProfilesSelect, "profile-local");
		await user.click(screen.getByRole("button", { name: /^update$/i }));

		await waitFor(() => {
			expect(apiMocks.saveDesktopAiProfile).toHaveBeenNthCalledWith(
				2,
				expect.objectContaining({
					id: "profile-local",
					name: "Local runtime",
				}),
			);
		});

		await user.selectOptions(savedProfilesSelect, "profile-local");
		await user.click(screen.getByRole("button", { name: /^delete$/i }));

		await waitFor(() => {
			expect(apiMocks.deleteDesktopAiProfile).toHaveBeenCalledWith(
				"profile-local",
			);
		});

		await user.click(
			screen.getByRole("button", { name: /save configuration/i }),
		);

		await waitFor(() => {
			expect(apiMocks.saveDesktopAiConfig).toHaveBeenCalledTimes(1);
		});
		expect(apiMocks.saveDesktopAiConfig).toHaveBeenCalledWith(
			expect.objectContaining({
				config: expect.objectContaining({
					capabilities: expect.objectContaining({
						text_generation: expect.objectContaining({
							reasoning_effort: "minimal",
						}),
					}),
				}),
			}),
		);
		expect(onCredentialsSaved).toHaveBeenCalledTimes(1);
	});
});
