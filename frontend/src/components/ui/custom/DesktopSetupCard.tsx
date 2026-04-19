import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { CircleHelp, Loader2, RefreshCw } from "lucide-react";

import {
	deleteDesktopAiProfile,
	saveDesktopAiConfig,
	saveDesktopAiProfile,
	validateDesktopAiConfig,
} from "@/api/api";
import { Button } from "@/components/ui/button";
import { InlineBanner } from "@/components/ui/inline-banner";
import { Input } from "@/components/ui/input";
import { PanelHeader } from "@/components/ui/panel-header";
import { StatusPill } from "@/components/ui/status-pill";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type {
	AIRuntimeConfig,
	AuthMode,
	DesktopAiSavedProfile,
	DesktopAiValidationResult,
	DesktopHealthStatus,
	DesktopSettingsStatus,
	ProviderType,
	ReasoningEffort,
} from "@/lib/definitions/desktop";
import { cn } from "@/lib/utils";

type DesktopSetupCardProps = {
	desktopSettingsStatus: DesktopSettingsStatus | null;
	desktopHealth: DesktopHealthStatus | null;
	onCredentialsSaved: () => Promise<void>;
	header?: {
		eyebrow?: string;
		title?: ReactNode;
		description?: ReactNode;
	};
	className?: string;
};

type CapabilityHealthPillProps = {
	label: string;
	summary: string;
	healthy: boolean;
};

type CapabilityFormState = {
	providerType: ProviderType;
	label: string;
	baseUrl: string;
	authMode: AuthMode;
	apiKey: string;
	modelId: string;
};

type SetupFormState = {
	text: CapabilityFormState & {
		temperature: string;
		reasoningEffort: ReasoningEffort | "default";
	};
	embeddingsEnabled: boolean;
	embeddings: CapabilityFormState;
};

const OPENAI_BASE_URL = "https://api.openai.com";
const OPENAI_SECRET_REF = "provider:openai-default:api-key";

function buildApiKeySecretRef(providerType: ProviderType, profileId: string) {
	return providerType === "openai"
		? OPENAI_SECRET_REF
		: `provider:${profileId}:api-key`;
}

function HealthPill({ label, summary, healthy }: CapabilityHealthPillProps) {
	return (
		<div className="workspace-panel space-y-3 px-4 py-4 text-left">
			<div className="flex items-start justify-between gap-3">
				<div className="space-y-1">
					<div className="workspace-section-label">{label}</div>
					<div className="text-sm leading-6 text-text-primary">{summary}</div>
				</div>
				<StatusPill tone={healthy ? "success" : "warning"}>
					{healthy ? "Ready" : "Check"}
				</StatusPill>
			</div>
		</div>
	);
}

function getProfile(
	config: AIRuntimeConfig | null | undefined,
	profileId: string | null | undefined,
) {
	if (!config || !profileId) {
		return null;
	}

	return config.profiles.find((profile) => profile.id === profileId) ?? null;
}

function buildInitialState(
	config: AIRuntimeConfig | null | undefined,
	secretValues: Record<string, string> = {},
): SetupFormState {
	const textBinding = config?.capabilities.text_generation;
	const textProfile = getProfile(config, textBinding?.provider_profile_id);
	const embeddingsBinding = config?.capabilities.embeddings ?? null;
	const embeddingsProfile = getProfile(
		config,
		embeddingsBinding?.provider_profile_id,
	);

	return {
		text: {
			providerType: textProfile?.provider_type ?? "openai",
			label: textProfile?.label ?? "OpenAI",
			baseUrl: textProfile?.base_url ?? OPENAI_BASE_URL,
			authMode: textProfile?.auth_mode ?? "bearer",
			apiKey:
				(textProfile?.api_key_secret_ref &&
					secretValues[textProfile.api_key_secret_ref]) ??
				"",
			modelId: textBinding?.model_id ?? "gpt-5.4-mini",
			temperature: String(textBinding?.temperature ?? 0.2),
			reasoningEffort: textBinding?.reasoning_effort ?? "default",
		},
		embeddingsEnabled: Boolean(embeddingsBinding),
		embeddings: {
			providerType: embeddingsProfile?.provider_type ?? "openai",
			label: embeddingsProfile?.label ?? "OpenAI",
			baseUrl: embeddingsProfile?.base_url ?? OPENAI_BASE_URL,
			authMode: embeddingsProfile?.auth_mode ?? "bearer",
			apiKey:
				(embeddingsProfile?.api_key_secret_ref &&
					secretValues[embeddingsProfile.api_key_secret_ref]) ??
				"",
			modelId: embeddingsBinding?.model_id ?? "text-embedding-3-small",
		},
	};
}

function getSavedProfileById(
	savedProfiles: DesktopAiSavedProfile[],
	profileId: string,
) {
	return savedProfiles.find((profile) => profile.id === profileId) ?? null;
}

function buildProfileConfig(
	id: string,
	form: CapabilityFormState,
	supportsTextGeneration: boolean,
	supportsEmbeddings: boolean,
) {
	return {
		id,
		provider_type: form.providerType,
		label:
			form.providerType === "openai"
				? "OpenAI"
				: form.label.trim() || "Custom Provider",
		base_url:
			form.providerType === "openai" ? OPENAI_BASE_URL : form.baseUrl.trim(),
		auth_mode: form.providerType === "openai" ? "bearer" : form.authMode,
		api_key_secret_ref:
			form.providerType === "openai" || form.authMode === "bearer"
				? buildApiKeySecretRef(form.providerType, id)
				: null,
		supports_text_generation: supportsTextGeneration,
		supports_embeddings: supportsEmbeddings,
	};
}

function shouldReuseTextSecret(
	text: CapabilityFormState,
	embeddings: CapabilityFormState,
) {
	return (
		text.providerType === embeddings.providerType &&
		(text.providerType === "openai" ||
			(text.baseUrl.trim() === embeddings.baseUrl.trim() &&
				text.authMode === embeddings.authMode))
	);
}

function buildAiConfigInput(state: SetupFormState) {
	const textProfileId =
		state.text.providerType === "openai" ? "openai-default" : "text-provider";
	const shareProfile =
		state.embeddingsEnabled &&
		shouldReuseTextSecret(state.text, state.embeddings);

	const textProfile = buildProfileConfig(
		textProfileId,
		state.text,
		true,
		shareProfile,
	);
	const profiles = [textProfile];
	const secretValues: Record<string, string> = {};
	const textSecretRef = buildApiKeySecretRef(
		state.text.providerType,
		textProfileId,
	);

	if (state.text.apiKey.trim()) {
		secretValues[textSecretRef] = state.text.apiKey.trim();
	}

	let embeddingsBinding = null;
	if (state.embeddingsEnabled) {
		const embeddingsProfileId = shareProfile
			? textProfileId
			: state.embeddings.providerType === "openai"
				? "openai-embeddings"
				: "embeddings-provider";

		if (!shareProfile) {
			const embeddingsProfile = buildProfileConfig(
				embeddingsProfileId,
				state.embeddings,
				false,
				true,
			);
			profiles.push(embeddingsProfile);
		}

		embeddingsBinding = {
			provider_profile_id: embeddingsProfileId,
			model_id: state.embeddings.modelId.trim(),
		};

		if (shareProfile) {
			if (!state.text.apiKey.trim() && state.embeddings.apiKey.trim()) {
				secretValues[textSecretRef] = state.embeddings.apiKey.trim();
			}
		} else if (state.embeddings.apiKey.trim()) {
			const embeddingsSecretRef = buildApiKeySecretRef(
				state.embeddings.providerType,
				embeddingsProfileId,
			);
			secretValues[embeddingsSecretRef] = state.embeddings.apiKey.trim();
		}
	}

	return {
		config: {
			schema_version: 1,
			profiles,
			capabilities: {
				text_generation: {
					provider_profile_id: textProfileId,
					model_id: state.text.modelId.trim(),
					temperature: Number(state.text.temperature) || 0.2,
					reasoning_effort:
						state.text.reasoningEffort === "default"
							? null
							: state.text.reasoningEffort,
				},
				embeddings: embeddingsBinding,
			},
		},
		secretValues,
	};
}

function capabilitySummary(
	status:
		| DesktopSettingsStatus["ai"]["textGeneration"]
		| DesktopSettingsStatus["ai"]["embeddings"]
		| undefined,
) {
	if (!status?.configured) {
		return status?.message ?? "Disabled";
	}
	const prefix = status.ready ? "Ready" : "Needs setup";
	const provider = status.providerType ?? "provider";
	const model = status.modelId ?? "model";
	return `${prefix} · ${provider} · ${model}`;
}

function validationSummary(
	title: string,
	result:
		| DesktopAiValidationResult["text_generation"]
		| DesktopAiValidationResult["embeddings"]
		| null,
) {
	if (!result) {
		return null;
	}

	return (
		<div className="workspace-panel flex items-start justify-between gap-3 px-4 py-4">
			<div className="min-w-0 space-y-1">
				<div className="text-sm font-medium text-text-primary">{title}</div>
				<p className="text-sm leading-6 text-text-secondary">
					{result.message ?? "No validation details were returned."}
				</p>
			</div>
			<StatusPill tone={result.ready ? "success" : "warning"}>
				{result.ready ? "Ready" : "Check"}
			</StatusPill>
		</div>
	);
}

function CapabilityFields({
	title,
	description,
	value,
	onChange,
	showTemperature = false,
	showReasoningEffort = false,
	modelPlaceholder = "gpt-5.4-mini",
	endpointPlaceholder = "http://127.0.0.1:11434/v1/responses",
}: {
	title: string;
	description: string;
	value: CapabilityFormState & {
		temperature?: string;
		reasoningEffort?: ReasoningEffort | "default";
	};
	onChange: (
		next: Partial<
			CapabilityFormState & {
				temperature?: string;
				reasoningEffort?: ReasoningEffort | "default";
			}
		>,
	) => void;
	showTemperature?: boolean;
	showReasoningEffort?: boolean;
	modelPlaceholder?: string;
	endpointPlaceholder?: string;
}) {
	const isCompatible = value.providerType === "openai_compatible";

	return (
		<section className="workspace-panel space-y-4 p-4 sm:p-5">
			<PanelHeader
				title={title}
				description={description}
				actions={
					<StatusPill tone={isCompatible ? "warning" : "accent"}>
						{isCompatible ? "Custom endpoint" : "OpenAI defaults"}
					</StatusPill>
				}
			/>

			<div className="grid gap-3 md:grid-cols-2">
				<label className="space-y-1.5 text-sm text-text-secondary">
					<span>Provider</span>
					<select
						className="workspace-native-select"
						value={value.providerType}
						onChange={(event) =>
							onChange({
								providerType: event.target.value as ProviderType,
								label:
									event.target.value === "openai"
										? "OpenAI"
										: value.label || "Custom Provider",
								baseUrl:
									event.target.value === "openai"
										? OPENAI_BASE_URL
										: value.baseUrl,
								authMode:
									event.target.value === "openai" ? "bearer" : value.authMode,
							})
						}
					>
						<option value="openai">OpenAI</option>
						<option value="openai_compatible">OpenAI-compatible</option>
					</select>
				</label>

				<label className="space-y-1.5 text-sm text-text-secondary">
					<span>Model ID</span>
					<Input
						value={value.modelId}
						onChange={(event) => onChange({ modelId: event.target.value })}
						placeholder={modelPlaceholder}
					/>
				</label>

				{showTemperature ? (
					<label className="space-y-1.5 text-sm text-text-secondary">
						<span>Temperature</span>
						<Input
							value={value.temperature ?? "0.2"}
							onChange={(event) =>
								onChange({ temperature: event.target.value })
							}
							placeholder="0.2"
						/>
					</label>
				) : null}

				{showReasoningEffort ? (
					<label className="space-y-1.5 text-sm text-text-secondary">
						<span className="flex items-center gap-1.5">
							<span>Reasoning Effort</span>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										className="inline-flex size-4 items-center justify-center rounded-full text-text-tertiary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
										aria-label="Reasoning effort help"
									>
										<CircleHelp className="size-3.5" />
									</button>
								</TooltipTrigger>
								<TooltipContent className="max-w-64 leading-5">
									Uses `reasoning.effort` for Responses API requests. Some
									OpenAI-compatible endpoints may ignore or reject it.
								</TooltipContent>
							</Tooltip>
						</span>
						<select
							className="workspace-native-select"
							value={value.reasoningEffort ?? "default"}
							onChange={(event) =>
								onChange({
									reasoningEffort: event.target
										.value as ReasoningEffort | "default",
								})
							}
						>
							<option value="default">Provider default</option>
							<option value="minimal">Minimal</option>
							<option value="low">Low</option>
							<option value="medium">Medium</option>
							<option value="high">High</option>
							<option value="xhigh">X-High</option>
						</select>
					</label>
				) : null}

				{isCompatible ? (
					<label className="space-y-1.5 text-sm text-text-secondary md:col-span-2">
						<span>Endpoint URL</span>
						<Input
							value={value.baseUrl}
							onChange={(event) => onChange({ baseUrl: event.target.value })}
							placeholder={endpointPlaceholder}
						/>
					</label>
				) : null}

				{isCompatible ? (
					<label className="space-y-1.5 text-sm text-text-secondary">
						<span>Auth Mode</span>
						<select
							className="workspace-native-select"
							value={value.authMode}
							onChange={(event) =>
								onChange({ authMode: event.target.value as AuthMode })
							}
						>
							<option value="bearer">Bearer API key</option>
							<option value="none">No auth</option>
						</select>
					</label>
				) : null}

				{value.providerType === "openai" || value.authMode === "bearer" ? (
					<label className="space-y-1.5 text-sm text-text-secondary md:col-span-2">
						<span>API Key</span>
						<Input
							type="password"
							value={value.apiKey}
							onChange={(event) => onChange({ apiKey: event.target.value })}
							placeholder="sk-..."
						/>
					</label>
				) : null}
			</div>

			{!isCompatible ? (
				<div className="rounded-[16px] border border-border-subtle bg-[rgba(255,255,255,0.03)] px-3 py-3 text-sm leading-6 text-text-secondary">
					OpenAI uses the default base URL and bearer auth, so you only need to
					manage the model, temperature, reasoning effort, and key here.
				</div>
			) : null}
		</section>
	);
}

export function DesktopSetupCard({
	desktopSettingsStatus,
	desktopHealth,
	onCredentialsSaved,
	header,
	className,
}: DesktopSetupCardProps) {
	const [formState, setFormState] = useState<SetupFormState>(() =>
		buildInitialState(desktopSettingsStatus?.aiRuntimeConfig),
	);
	const [isSaving, setIsSaving] = useState(false);
	const [isValidating, setIsValidating] = useState(false);
	const [isSavingProfile, setIsSavingProfile] = useState(false);
	const [isDeletingProfile, setIsDeletingProfile] = useState(false);
	const [profileAction, setProfileAction] = useState<"create" | "update" | null>(
		null,
	);
	const [feedback, setFeedback] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [profileFeedback, setProfileFeedback] = useState<string | null>(null);
	const [profileError, setProfileError] = useState<string | null>(null);
	const [savedProfiles, setSavedProfiles] = useState<DesktopAiSavedProfile[]>(
		() => desktopSettingsStatus?.savedAiProfiles ?? [],
	);
	const [selectedProfileId, setSelectedProfileId] = useState("");
	const [newProfileName, setNewProfileName] = useState("");
	const [validationResult, setValidationResult] =
		useState<DesktopAiValidationResult | null>(null);

	useEffect(() => {
		setFormState(buildInitialState(desktopSettingsStatus?.aiRuntimeConfig));
		setSelectedProfileId("");
		setProfileFeedback(null);
		setProfileError(null);
	}, [desktopSettingsStatus?.aiRuntimeConfig]);

	useEffect(() => {
		const nextSavedProfiles = desktopSettingsStatus?.savedAiProfiles ?? [];
		setSavedProfiles(nextSavedProfiles);
		setSelectedProfileId((current) =>
			nextSavedProfiles.some((profile) => profile.id === current) ? current : "",
		);
	}, [desktopSettingsStatus?.savedAiProfiles]);

	const selectedProfile = getSavedProfileById(savedProfiles, selectedProfileId);

	const updateFormState = (
		updater: (current: SetupFormState) => SetupFormState,
	) => {
		setFormState((current) => updater(current));
		setFeedback(null);
		setError(null);
		setProfileFeedback(null);
		setProfileError(null);
		setValidationResult(null);
	};

	const applySavedProfilesStatus = (status: DesktopSettingsStatus) => {
		const nextSavedProfiles = status.savedAiProfiles ?? [];
		setSavedProfiles(nextSavedProfiles);
		return nextSavedProfiles;
	};

	const runValidation = async () => {
		const input = buildAiConfigInput(formState);
		setIsValidating(true);
		setError(null);
		setFeedback(null);

		try {
			const result = await validateDesktopAiConfig(input);
			setValidationResult(result);

			const textReady = Boolean(result.text_generation.ready);
			const embeddingsReady = formState.embeddingsEnabled
				? Boolean(result.embeddings.ready)
				: true;

			if (!textReady || !embeddingsReady) {
				throw new Error(
					"Validation failed. Review the endpoint feedback below.",
				);
			}

			setFeedback("Draft validated. You can save when you're ready.");
			return input;
		} catch (validationError) {
			const message =
				validationError instanceof Error
					? validationError.message
					: "Failed to validate AI configuration.";
			setError(message);
			return null;
		} finally {
			setIsValidating(false);
		}
	};

	const handleSave = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setIsSaving(true);
		setError(null);
		setFeedback(null);

		try {
			const input = buildAiConfigInput(formState);

			await saveDesktopAiConfig(input);
			setFeedback("Configuration saved. Runtime status refreshed.");
			setFormState((current) => ({
				...current,
				text: { ...current.text, apiKey: "" },
				embeddings: { ...current.embeddings, apiKey: "" },
			}));
			setSelectedProfileId("");
			await onCredentialsSaved();
		} catch (saveError) {
			const message =
				saveError instanceof Error
					? saveError.message
					: "Failed to save desktop AI configuration.";
			setError(message);
		} finally {
			setIsSaving(false);
		}
	};

	const handleLoadProfile = () => {
		if (!selectedProfile) {
			return;
		}

		setFormState(
			buildInitialState(selectedProfile.config, selectedProfile.secretValues),
		);
		setFeedback(null);
		setError(null);
		setProfileError(null);
		setProfileFeedback(`Loaded '${selectedProfile.name}' into the draft.`);
		setValidationResult(null);
	};

	const handleSaveProfile = async () => {
		const profileName = newProfileName.trim();
		if (!profileName) {
			setProfileError("Enter a profile name before saving a new profile.");
			setProfileFeedback(null);
			return;
		}

		setIsSavingProfile(true);
		setProfileAction("create");
		setProfileError(null);
		setProfileFeedback(null);

		try {
			const status = await saveDesktopAiProfile({
				name: profileName,
				...buildAiConfigInput(formState),
			});
			const nextSavedProfiles = applySavedProfilesStatus(status);
			const createdProfile =
				nextSavedProfiles.find(
					(profile) => profile.name.toLowerCase() === profileName.toLowerCase(),
				) ?? null;
			setSelectedProfileId(createdProfile?.id ?? "");
			setNewProfileName("");
			setProfileFeedback(`Saved '${profileName}' as a profile.`);
		} catch (saveProfileError) {
			const message =
				saveProfileError instanceof Error
					? saveProfileError.message
					: "Failed to save the AI profile.";
			setProfileError(message);
		} finally {
			setIsSavingProfile(false);
			setProfileAction(null);
		}
	};

	const handleUpdateProfile = async () => {
		if (!selectedProfile) {
			setProfileError("Select a saved profile before updating it.");
			setProfileFeedback(null);
			return;
		}

		setIsSavingProfile(true);
		setProfileAction("update");
		setProfileError(null);
		setProfileFeedback(null);

		try {
			const status = await saveDesktopAiProfile({
				id: selectedProfile.id,
				name: selectedProfile.name,
				...buildAiConfigInput(formState),
			});
			applySavedProfilesStatus(status);
			setProfileFeedback(`Updated '${selectedProfile.name}'.`);
		} catch (updateProfileError) {
			const message =
				updateProfileError instanceof Error
					? updateProfileError.message
					: "Failed to update the AI profile.";
			setProfileError(message);
		} finally {
			setIsSavingProfile(false);
			setProfileAction(null);
		}
	};

	const handleDeleteProfile = async () => {
		if (!selectedProfile) {
			setProfileError("Select a saved profile before deleting it.");
			setProfileFeedback(null);
			return;
		}

		setIsDeletingProfile(true);
		setProfileError(null);
		setProfileFeedback(null);

		try {
			const deletedProfileName = selectedProfile.name;
			const status = await deleteDesktopAiProfile(selectedProfile.id);
			applySavedProfilesStatus(status);
			setSelectedProfileId("");
			setProfileFeedback(`Deleted '${deletedProfileName}'.`);
		} catch (deleteProfileError) {
			const message =
				deleteProfileError instanceof Error
					? deleteProfileError.message
					: "Failed to delete the AI profile.";
			setProfileError(message);
		} finally {
			setIsDeletingProfile(false);
		}
	};

	return (
		<div
			className={cn("workspace-panel-elevated space-y-5 p-5 sm:p-6", className)}
		>
			<PanelHeader
				eyebrow={header?.eyebrow ?? "Local Desktop Setup"}
				title={header?.title ?? "Configure AI by capability"}
				description={
					header?.description ??
					"Authentication means the desktop backend is reachable. AI readiness is configured separately for chat, summaries, and semantic search."
				}
				actions={
					<StatusPill
						tone={
							desktopHealth?.backend.state === "running" ? "success" : "warning"
						}
					>
						Local runtime
					</StatusPill>
				}
			/>

			<form className="space-y-4" onSubmit={handleSave}>
				<section className="workspace-panel space-y-4 p-4 sm:p-5">
					<PanelHeader
						title="Saved Profiles"
						description="Save reusable AI runtime drafts, then load them back into the form without changing the active runtime until you explicitly save."
						actions={
							<StatusPill tone={savedProfiles.length > 0 ? "accent" : "neutral"}>
								{savedProfiles.length} saved
							</StatusPill>
						}
					/>

					<div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
						<label className="space-y-1.5 text-sm text-text-secondary">
							<span>Saved profiles</span>
							<select
								className="workspace-native-select"
								value={selectedProfileId}
								onChange={(event) => {
									setSelectedProfileId(event.target.value);
									setProfileError(null);
									setProfileFeedback(null);
								}}
							>
								<option value="">Choose a saved profile</option>
								{savedProfiles.map((profile) => (
									<option key={profile.id} value={profile.id}>
										{profile.name}
									</option>
								))}
							</select>
						</label>

						<div className="flex flex-col gap-3 self-end sm:flex-row">
							<Button
								type="button"
								variant="subtle"
								disabled={!selectedProfile}
								onClick={handleLoadProfile}
							>
								Load
							</Button>
							<Button
								type="button"
								variant="toolbar"
								disabled={!selectedProfile || isSavingProfile}
								onClick={() => void handleUpdateProfile()}
							>
								{isSavingProfile && profileAction === "update" ? (
									<>
										<Loader2 className="size-4 animate-spin" />
										Updating
									</>
								) : (
									"Update"
								)}
							</Button>
							<Button
								type="button"
								variant="destructive"
								disabled={!selectedProfile || isDeletingProfile || isSavingProfile}
								onClick={() => void handleDeleteProfile()}
							>
								{isDeletingProfile ? (
									<>
										<Loader2 className="size-4 animate-spin" />
										Deleting
									</>
								) : (
									"Delete"
								)}
							</Button>
						</div>
					</div>

					<div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
						<label className="space-y-1.5 text-sm text-text-secondary">
							<span>New profile name</span>
							<Input
								value={newProfileName}
								onChange={(event) => {
									setNewProfileName(event.target.value);
									setProfileError(null);
									setProfileFeedback(null);
								}}
								placeholder="Weekend local runtime"
							/>
						</label>

						<Button
							type="button"
							variant="accent"
							className="self-end"
							disabled={isSavingProfile || isDeletingProfile}
							onClick={() => void handleSaveProfile()}
						>
							{isSavingProfile && profileAction === "create" ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Saving
								</>
							) : (
								"Save as New Profile"
							)}
						</Button>
					</div>

					{selectedProfile ? (
						<p className="text-xs leading-5 text-text-tertiary">
							Selected profile: {selectedProfile.name}. Load applies it to the
							draft. Update overwrites that saved profile with the current draft.
						</p>
					) : null}

					{profileFeedback ? (
						<div className="text-sm font-medium text-[#d5f2df]">
							{profileFeedback}
						</div>
					) : null}
					{profileError ? <InlineBanner tone="danger" title={profileError} /> : null}
				</section>

				<CapabilityFields
					title="Chat And Summaries"
					description="Choose the text-generation provider GitOdyssey should use for the main runtime."
					value={formState.text}
					onChange={(next) =>
						updateFormState((current) => ({
							...current,
							text: { ...current.text, ...next },
						}))
					}
					showTemperature
					showReasoningEffort
					modelPlaceholder="gpt-5.4-mini"
					endpointPlaceholder="http://127.0.0.1:11434/v1/responses"
				/>

				<section className="workspace-panel space-y-4 p-4 sm:p-5">
					<PanelHeader
						title="Semantic Search"
						description="Turn embeddings on only if you want repo indexing and retrieval."
						actions={
							<StatusPill
								tone={formState.embeddingsEnabled ? "accent" : "neutral"}
							>
								{formState.embeddingsEnabled ? "Enabled" : "Disabled"}
							</StatusPill>
						}
					/>
					<label className="flex items-start gap-3 text-sm text-text-secondary">
						<input
							type="checkbox"
							className="workspace-checkbox mt-0.5"
							checked={formState.embeddingsEnabled}
							onChange={(event) =>
								updateFormState((current) => ({
									...current,
									embeddingsEnabled: event.target.checked,
								}))
							}
						/>
						<span className="space-y-1">
							<span className="block font-medium text-text-primary">
								Enable semantic search
							</span>
							<span className="block leading-6 text-text-secondary">
								Requires an OpenAI-compatible endpoint that exposes
								`/v1/embeddings`.
							</span>
						</span>
					</label>
				</section>

				{formState.embeddingsEnabled ? (
					<CapabilityFields
						title="Embeddings Endpoint"
						description="Choose the embeddings model and endpoint used for repo indexing."
						value={formState.embeddings}
						onChange={(next) =>
							updateFormState((current) => ({
								...current,
								embeddings: { ...current.embeddings, ...next },
							}))
						}
						modelPlaceholder="text-embedding-3-small"
						endpointPlaceholder="http://127.0.0.1:11434/v1/embeddings"
					/>
				) : null}

				<section className="workspace-panel space-y-4 p-4 sm:p-5">
					<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
						<div className="space-y-1">
							<div className="workspace-section-label">Actions</div>
							<p className="text-sm leading-6 text-text-secondary">
								Save directly, or validate the current draft before you
								commit it.
							</p>
						</div>
						{feedback ? (
							<div className="text-sm font-medium text-[#d5f2df]">
								{feedback}
							</div>
						) : null}
					</div>

					<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
						<Button
							type="submit"
							variant="accent"
							disabled={isSaving || isValidating}
						>
							{isSaving ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Saving
								</>
							) : (
								"Save Configuration"
							)}
						</Button>
						<Button
							type="button"
							variant="subtle"
							disabled={isValidating || isSaving}
							onClick={() => void runValidation()}
						>
							{isValidating ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Validating
								</>
							) : (
								"Validate Endpoints"
							)}
						</Button>
						<Button
							type="button"
							variant="toolbar"
							onClick={() => void onCredentialsSaved()}
						>
							<RefreshCw className="size-4" />
							Refresh Health
						</Button>
					</div>

					{error ? <InlineBanner tone="danger" title={error} /> : null}
				</section>

				{validationResult ? (
					<section className="space-y-3">
						<div className="workspace-section-label">
							Draft Validation Results
						</div>
						<div className="grid gap-3 md:grid-cols-2">
							{validationSummary(
								"Text generation validation",
								validationResult.text_generation,
							)}
							{formState.embeddingsEnabled
								? validationSummary(
										"Embeddings validation",
										validationResult.embeddings,
									)
								: null}
						</div>
					</section>
				) : null}
			</form>

			<section className="space-y-3">
				<div className="workspace-section-label">Saved Runtime Health</div>
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<HealthPill
						label="Chat"
						summary={capabilitySummary(
							desktopHealth?.ai.textGeneration ??
								desktopSettingsStatus?.ai.textGeneration,
						)}
						healthy={Boolean(desktopHealth?.ai.textGeneration.ready)}
					/>
					<HealthPill
						label="Embeddings"
						summary={capabilitySummary(
							desktopHealth?.ai.embeddings ??
								desktopSettingsStatus?.ai.embeddings,
						)}
						healthy={Boolean(
							desktopHealth?.ai.embeddings.ready ||
								desktopSettingsStatus?.ai.embeddings?.configured === false,
						)}
					/>
					<HealthPill
						label="Backend"
						summary={desktopHealth?.backend.state ?? "unavailable"}
						healthy={desktopHealth?.backend.state === "running"}
					/>
					<HealthPill
						label="Postgres"
						summary={desktopHealth?.postgres.state ?? "unavailable"}
						healthy={desktopHealth?.postgres.state === "running"}
					/>
				</div>
				<p className="text-xs leading-5 text-text-tertiary">
					These reflect the configuration currently saved and running, not
					the unsaved draft in the form.
				</p>
			</section>
		</div>
	);
}
