import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { saveDesktopAiConfig, validateDesktopAiConfig } from "@/api/api";
import { Button } from "@/components/ui/button";
import { InlineBanner } from "@/components/ui/inline-banner";
import { Input } from "@/components/ui/input";
import { PanelHeader } from "@/components/ui/panel-header";
import { StatusPill } from "@/components/ui/status-pill";
import type {
	AIRuntimeConfig,
	AuthMode,
	DesktopAiValidationResult,
	DesktopHealthStatus,
	DesktopSettingsStatus,
	ProviderType,
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
	text: CapabilityFormState & { temperature: string };
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
			apiKey: "",
			modelId: textBinding?.model_id ?? "gpt-5.4-mini",
			temperature: String(textBinding?.temperature ?? 0.2),
		},
		embeddingsEnabled: Boolean(embeddingsBinding),
		embeddings: {
			providerType: embeddingsProfile?.provider_type ?? "openai",
			label: embeddingsProfile?.label ?? "OpenAI",
			baseUrl: embeddingsProfile?.base_url ?? OPENAI_BASE_URL,
			authMode: embeddingsProfile?.auth_mode ?? "bearer",
			apiKey: "",
			modelId: embeddingsBinding?.model_id ?? "text-embedding-3-small",
		},
	};
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
		<InlineBanner
			tone={result.ready ? "success" : "warning"}
			title={title}
			description={result.message ?? "No validation details were returned."}
		/>
	);
}

function CapabilityFields({
	title,
	description,
	value,
	onChange,
	showTemperature = false,
	showDisableHint = false,
}: {
	title: string;
	description: string;
	value: CapabilityFormState & { temperature?: string };
	onChange: (
		next: Partial<CapabilityFormState & { temperature?: string }>,
	) => void;
	showTemperature?: boolean;
	showDisableHint?: boolean;
}) {
	const isCompatible = value.providerType === "openai_compatible";

	return (
		<section className="workspace-panel space-y-4 p-4">
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
								label: event.target.value === "openai" ? "OpenAI" : value.label,
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
						placeholder="gpt-5.4-mini"
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

				{isCompatible ? (
					<label className="space-y-1.5 text-sm text-text-secondary">
						<span>Label</span>
						<Input
							value={value.label}
							onChange={(event) => onChange({ label: event.target.value })}
							placeholder="Local LLM"
						/>
					</label>
				) : null}

				{isCompatible ? (
					<label className="space-y-1.5 text-sm text-text-secondary md:col-span-2">
						<span>Endpoint URL</span>
						<Input
							value={value.baseUrl}
							onChange={(event) => onChange({ baseUrl: event.target.value })}
							placeholder="http://127.0.0.1:11434/v1/responses"
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
							placeholder="Leave blank to reuse the saved key during validation and save"
						/>
					</label>
				) : null}
			</div>
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
	const [feedback, setFeedback] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [validationResult, setValidationResult] =
		useState<DesktopAiValidationResult | null>(null);

	useEffect(() => {
		setFormState(buildInitialState(desktopSettingsStatus?.aiRuntimeConfig));
	}, [desktopSettingsStatus?.aiRuntimeConfig]);

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

			setFeedback("Validation passed. This configuration is ready to save.");
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
			const input = await runValidation();
			if (!input) {
				return;
			}

			await saveDesktopAiConfig(input);
			setFeedback(
				"AI configuration saved locally. Restarting local services...",
			);
			setFormState((current) => ({
				...current,
				text: { ...current.text, apiKey: "" },
				embeddings: { ...current.embeddings, apiKey: "" },
			}));
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
				<CapabilityFields
					title="Chat And Summaries"
					description="Choose the provider and model GitOdyssey should use for Responses-based text generation."
					value={formState.text}
					onChange={(next) =>
						setFormState((current) => ({
							...current,
							text: { ...current.text, ...next },
						}))
					}
					showTemperature
					showDisableHint
				/>

				<section className="workspace-panel space-y-4 p-4">
					<PanelHeader
						title="Embeddings"
						description="Enable semantic search and retrieval with a provider that exposes `/v1/embeddings`."
						actions={
							<StatusPill
								tone={formState.embeddingsEnabled ? "accent" : "neutral"}
							>
								{formState.embeddingsEnabled ? "Enabled" : "Disabled"}
							</StatusPill>
						}
					/>
					<label className="flex items-center gap-3 text-sm text-text-secondary">
						<input
							type="checkbox"
							className="workspace-checkbox"
							checked={formState.embeddingsEnabled}
							onChange={(event) =>
								setFormState((current) => ({
									...current,
									embeddingsEnabled: event.target.checked,
								}))
							}
						/>
						Enable semantic search
					</label>
				</section>

				{formState.embeddingsEnabled ? (
					<CapabilityFields
						title="Semantic Search"
						description="Choose the embeddings endpoint GitOdyssey should use for repo indexing and retrieval."
						value={formState.embeddings}
						onChange={(next) =>
							setFormState((current) => ({
								...current,
								embeddings: { ...current.embeddings, ...next },
							}))
						}
					/>
				) : null}

				<div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap">
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
							"Validate And Save"
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
			</form>

			{feedback ? <InlineBanner tone="success" title={feedback} /> : null}
			{error ? <InlineBanner tone="danger" title={error} /> : null}

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

			<section className="space-y-3">
				<div className="workspace-section-label">
					Current Saved Runtime Health
				</div>
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
					These cards reflect the configuration currently saved and running in
					the local backend, not the unsaved draft above.
				</p>
			</section>

			{(desktopHealth?.backend.message ||
				desktopHealth?.postgres.message ||
				desktopHealth?.ai.embeddings.reindexRequired) && (
				<section className="space-y-3">
					{desktopHealth?.backend.message ? (
						<InlineBanner
							tone="info"
							title="Backend note"
							description={desktopHealth.backend.message}
						/>
					) : null}
					{desktopHealth?.postgres.message ? (
						<InlineBanner
							tone="info"
							title="Postgres note"
							description={desktopHealth.postgres.message}
						/>
					) : null}
					{desktopHealth?.ai.embeddings.reindexRequired ? (
						<InlineBanner
							tone="warning"
							title="Semantic search needs a reindex"
							description="The active embeddings profile differs from the profile stored on at least one repository."
						/>
					) : null}
				</section>
			)}

			{desktopSettingsStatus?.logDir ? (
				<section className="space-y-3">
					<InlineBanner
						tone="info"
						title="AI call logs"
						description={`Backend AI requests and responses are written to ${desktopSettingsStatus.logDir}/backend.log.`}
					/>
				</section>
			) : null}
		</div>
	);
}
