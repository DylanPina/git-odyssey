import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Cloud, Loader2, RefreshCw, Search } from "lucide-react";

import {
	deployGoogleModel,
	listGoogleModelGarden,
	saveDesktopAiConfig,
	validateDesktopAiConfig,
	validateGoogleTarget,
} from "@/api/api";
import { Button } from "@/components/ui/button";
import { InlineBanner } from "@/components/ui/inline-banner";
import { Input } from "@/components/ui/input";
import { PanelHeader } from "@/components/ui/panel-header";
import { StatusPill } from "@/components/ui/status-pill";
import type {
	AIRuntimeConfig,
	CapabilityName,
	DesktopAiValidationResult,
	DesktopHealthStatus,
	DesktopSettingsStatus,
	GoogleAITarget,
	GoogleModelGardenEntry,
	ModelSource,
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

const CAPABILITY_LABELS: Record<CapabilityName, string> = {
	text_generation: "Chat And Summaries",
	embeddings: "Semantic Search",
	review: "Code Review",
};

const SOURCE_LABELS: Record<ModelSource | "all", string> = {
	all: "All sources",
	managed_api_model: "Managed API",
	deployable_google_model: "Google deployable",
	deployable_partner_model: "Partner/open",
	vertex_endpoint: "Endpoint",
	manual_resource_name: "Manual",
};

function emptyConfig(): AIRuntimeConfig {
	return {
		schema_version: 2,
		google_project_id: null,
		google_location: "us-central1",
		capabilities: {
			text_generation: null,
			embeddings: null,
			review: null,
		},
	};
}

function targetFromEntry(
	entry: GoogleModelGardenEntry,
	capability: CapabilityName,
): GoogleAITarget {
	return {
		target_kind: entry.target_kind,
		resource_name: entry.resource_name,
		display_name: entry.display_name,
		publisher: entry.publisher ?? null,
		version: entry.version ?? null,
		location: entry.location,
		capabilities: Array.from(new Set([...entry.capabilities, capability])),
		adapter_family: entry.adapter_family ?? null,
		embedding_output_dimension: null,
		source: entry.source,
	};
}

function manualTarget(
	resourceName: string,
	capability: CapabilityName,
	location: string,
): GoogleAITarget | null {
	const trimmed = resourceName.trim();
	if (!trimmed) {
		return null;
	}
	const lower = trimmed.toLowerCase();
	return {
		target_kind: lower.includes("/endpoints/") ? "vertex_endpoint" : "managed_model",
		resource_name: trimmed,
		display_name: trimmed.split("/").at(-1) || trimmed,
		publisher: lower.includes("publishers/")
			? trimmed.split("publishers/")[1]?.split("/")[0] || null
			: "google",
		version: null,
		location,
		capabilities: [capability],
		adapter_family:
			capability === "embeddings"
				? "text_embedding"
				: lower.includes("gemini")
					? "gemini"
					: "vertex_predict_text",
		embedding_output_dimension: null,
		source: "manual_resource_name",
	};
}

function targetSummary(target: GoogleAITarget | null) {
	if (!target) {
		return "No target selected";
	}
	return `${target.display_name} · ${target.target_kind === "vertex_endpoint" ? "Endpoint" : "Managed model"}`;
}

function buildConfig(
	projectId: string,
	location: string,
	targets: Record<CapabilityName, GoogleAITarget | null>,
): AIRuntimeConfig {
	return {
		schema_version: 2,
		google_project_id: projectId.trim() || null,
		google_location: location.trim() || "us-central1",
		capabilities: targets,
	};
}

function validationReady(
	result: DesktopAiValidationResult | null,
	targets: Record<CapabilityName, GoogleAITarget | null>,
) {
	if (!result) {
		return false;
	}
	return (["text_generation", "embeddings", "review"] as CapabilityName[]).every(
		(capability) => {
			if (!targets[capability]) {
				return capability === "embeddings";
			}
			return Boolean(result[capability].ready);
		},
	);
}

function CapabilityPicker({
	capability,
	location,
	config,
	catalog,
	target,
	validation,
	onTargetChange,
	onValidate,
	isValidating,
	onDeployComplete,
}: {
	capability: CapabilityName;
	location: string;
	config: AIRuntimeConfig;
	catalog: GoogleModelGardenEntry[];
	target: GoogleAITarget | null;
	validation?: DesktopAiValidationResult[CapabilityName] | null;
	onTargetChange: (target: GoogleAITarget | null) => void;
	onValidate: () => void;
	isValidating: boolean;
	onDeployComplete: (resourceName: string) => void;
}) {
	const [query, setQuery] = useState("");
	const [source, setSource] = useState<ModelSource | "all">("all");
	const [deployOpen, setDeployOpen] = useState(false);
	const [endpointResource, setEndpointResource] = useState("");
	const [machineType, setMachineType] = useState("n1-standard-4");
	const [acceptedTerms, setAcceptedTerms] = useState(false);
	const [acceptedBilling, setAcceptedBilling] = useState(false);
	const [deployError, setDeployError] = useState<string | null>(null);
	const [deployFeedback, setDeployFeedback] = useState<string | null>(null);
	const [isDeploying, setIsDeploying] = useState(false);

	const entries = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		return catalog
			.filter((entry) => {
				if (source !== "all" && entry.source !== source) {
					return false;
				}
				if (!entry.capabilities.includes(capability) && entry.capabilities.length > 0) {
					return false;
				}
				if (!normalizedQuery) {
					return true;
				}
				return `${entry.display_name} ${entry.resource_name} ${entry.publisher ?? ""}`
					.toLowerCase()
					.includes(normalizedQuery);
			})
			.slice(0, 18);
	}, [capability, catalog, query, source]);

	const handleDeploy = async () => {
		if (!target) {
			return;
		}
		setIsDeploying(true);
		setDeployError(null);
		setDeployFeedback(null);
		try {
			const result = await deployGoogleModel({
				config,
				model_resource_name: target.resource_name,
				endpoint_resource_name: endpointResource.trim(),
				deployed_model_display_name: target.display_name,
				machine_type: machineType.trim(),
				accepted_terms: acceptedTerms,
				accepted_billing_notice: acceptedBilling,
			});
			setDeployFeedback(
				result.operation_name
					? `Deployment started: ${result.operation_name}`
					: "Deployment request submitted.",
			);
			onDeployComplete(result.endpoint_resource_name);
		} catch (error) {
			setDeployError(
				error instanceof Error ? error.message : "Failed to start deployment.",
			);
		} finally {
			setIsDeploying(false);
		}
	};

	return (
		<section className="workspace-panel space-y-4 p-4 sm:p-5">
			<PanelHeader
					title={CAPABILITY_LABELS[capability]}
					description={
						capability === "embeddings"
							? "Select an embedding-capable Google AI target for indexing and semantic search."
							: undefined
					}
				actions={
					<StatusPill tone={validation?.ready ? "success" : target ? "warning" : "neutral"}>
						{validation?.ready ? "Validated" : target ? "Needs probe" : "Unset"}
					</StatusPill>
				}
			/>

			<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_13rem]">
				<label className="relative">
					<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary" />
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search Model Garden, endpoints, or publishers"
						className="pl-9"
					/>
				</label>
				<select
					className="workspace-native-select"
					value={source}
					onChange={(event) => setSource(event.target.value as ModelSource | "all")}
				>
					{Object.entries(SOURCE_LABELS).map(([value, label]) => (
						<option key={value} value={value}>
							{label}
						</option>
					))}
				</select>
			</div>

			<div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
				{entries.map((entry) => {
					const selected = target?.resource_name === entry.resource_name;
					return (
						<button
							key={`${capability}-${entry.resource_name}`}
							type="button"
							onClick={() => onTargetChange(targetFromEntry(entry, capability))}
							className={cn(
								"min-h-[7.5rem] rounded-[8px] border p-3 text-left transition-colors",
								selected
									? "border-[rgba(83,183,130,0.5)] bg-[rgba(83,183,130,0.12)]"
									: "border-border-subtle bg-control/45 hover:border-border-strong hover:bg-control-hover",
							)}
						>
							<div className="flex items-start justify-between gap-2">
								<div className="min-w-0">
									<div className="truncate text-sm font-medium text-text-primary">
										{entry.display_name}
									</div>
									<div className="mt-1 truncate font-mono text-[11px] text-text-tertiary">
										{entry.resource_name}
									</div>
								</div>
								<StatusPill tone={entry.deployable ? "warning" : "accent"}>
									{SOURCE_LABELS[entry.source]}
								</StatusPill>
							</div>
							<div className="mt-3 flex flex-wrap gap-1.5">
								{entry.capabilities.length ? (
									entry.capabilities.map((item) => (
										<span
											key={item}
											className="rounded-full border border-border-subtle px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-text-tertiary"
										>
											{item.replace("_", " ")}
										</span>
									))
								) : (
									<span className="text-xs text-text-tertiary">
										Validation required
									</span>
								)}
							</div>
						</button>
					);
				})}
			</div>

			<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<div className="min-w-0">
					<div className="workspace-section-label">Selected target</div>
					<div className="truncate text-sm text-text-primary">
						{targetSummary(target)}
					</div>
					{validation?.message ? (
						<p className="mt-1 text-xs leading-5 text-text-secondary">
							{validation.message}
						</p>
					) : null}
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						variant="subtle"
						disabled={!target || isValidating}
						onClick={onValidate}
					>
						{isValidating ? (
							<>
								<Loader2 className="size-4 animate-spin" />
								Validating
							</>
						) : (
							"Validate"
						)}
					</Button>
					<Button
						type="button"
						variant="toolbar"
						disabled={!target}
						onClick={() => setDeployOpen((current) => !current)}
					>
						Deployment
					</Button>
				</div>
			</div>

			{deployOpen ? (
				<div className="workspace-panel space-y-3 p-3">
					<div className="grid gap-3 md:grid-cols-2">
						<label className="space-y-1.5 text-sm text-text-secondary">
							<span>Endpoint resource</span>
							<Input
								value={endpointResource}
								onChange={(event) => setEndpointResource(event.target.value)}
								placeholder="projects/.../locations/.../endpoints/123"
							/>
						</label>
						<label className="space-y-1.5 text-sm text-text-secondary">
							<span>Machine type</span>
							<Input
								value={machineType}
								onChange={(event) => setMachineType(event.target.value)}
								placeholder="n1-standard-4"
							/>
						</label>
					</div>
					<label className="flex items-start gap-2 text-sm text-text-secondary">
						<input
							type="checkbox"
							className="workspace-checkbox mt-0.5"
							checked={acceptedTerms}
							onChange={(event) => setAcceptedTerms(event.target.checked)}
						/>
						<span>I have reviewed the model terms/EULA for this deployment.</span>
					</label>
					<label className="flex items-start gap-2 text-sm text-text-secondary">
						<input
							type="checkbox"
							className="workspace-checkbox mt-0.5"
							checked={acceptedBilling}
							onChange={(event) => setAcceptedBilling(event.target.checked)}
						/>
						<span>I understand this deployment can create Google Cloud billing.</span>
					</label>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="accent"
							disabled={
								!target ||
								!endpointResource.trim() ||
								!machineType.trim() ||
								!acceptedTerms ||
								!acceptedBilling ||
								isDeploying
							}
							onClick={() => void handleDeploy()}
						>
							{isDeploying ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Deploying
								</>
							) : (
								"Start Deployment"
							)}
						</Button>
						{deployFeedback ? (
							<span className="text-sm text-[#d5f2df]">{deployFeedback}</span>
						) : null}
					</div>
					{deployError ? <InlineBanner tone="danger" title={deployError} /> : null}
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
	const activeConfig = desktopSettingsStatus?.aiRuntimeConfig ?? emptyConfig();
	const [projectId, setProjectId] = useState(activeConfig.google_project_id ?? "");
	const [location, setLocation] = useState(activeConfig.google_location ?? "us-central1");
	const [targets, setTargets] = useState<Record<CapabilityName, GoogleAITarget | null>>(
		activeConfig.capabilities,
	);
	const [catalog, setCatalog] = useState<GoogleModelGardenEntry[]>([]);
	const [validationResult, setValidationResult] =
		useState<DesktopAiValidationResult | null>(null);
	const [validatedDraftKey, setValidatedDraftKey] = useState<string | null>(null);
	const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
	const [validatingCapability, setValidatingCapability] =
		useState<CapabilityName | "all" | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [feedback, setFeedback] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setProjectId(activeConfig.google_project_id ?? "");
		setLocation(activeConfig.google_location ?? "us-central1");
		setTargets(activeConfig.capabilities);
		setValidationResult(null);
		setValidatedDraftKey(null);
	}, [activeConfig]);

	const draftConfig = useMemo(
		() => buildConfig(projectId, location, targets),
		[location, projectId, targets],
	);
	const draftKey = JSON.stringify(draftConfig);
	const canSave =
		validatedDraftKey === draftKey && validationReady(validationResult, targets);

	const updateTarget = (capability: CapabilityName, target: GoogleAITarget | null) => {
		setTargets((current) => ({ ...current, [capability]: target }));
		setValidationResult(null);
		setValidatedDraftKey(null);
		setFeedback(null);
		setError(null);
	};

	const loadCatalog = async () => {
		if (!projectId.trim()) {
			setError("Enter a Google Cloud project ID before browsing Model Garden.");
			return;
		}
		setIsLoadingCatalog(true);
		setError(null);
		try {
			const result = await listGoogleModelGarden({
				googleProjectId: projectId,
				googleLocation: location,
			});
				setCatalog(result.items);
				setFeedback(`Loaded ${result.items.length} Google AI targets.`);
		} catch (catalogError) {
			setError(
				catalogError instanceof Error
					? catalogError.message
					: "Failed to load Model Garden targets.",
			);
		} finally {
			setIsLoadingCatalog(false);
		}
	};

	const validateCapability = async (capability: CapabilityName) => {
		const target = targets[capability];
		if (!target) {
			setError(`Select a ${CAPABILITY_LABELS[capability]} target first.`);
			return;
		}
		setValidatingCapability(capability);
		setError(null);
		try {
			const result = await validateGoogleTarget({
				config: draftConfig,
				capability,
				target,
			});
			if (!result.ready) {
				throw new Error(result.message ?? "Validation failed.");
			}
			updateTarget(capability, result.target);
			setFeedback(`${CAPABILITY_LABELS[capability]} target validated.`);
		} catch (validationError) {
			setError(
				validationError instanceof Error
					? validationError.message
					: "Validation failed.",
			);
		} finally {
			setValidatingCapability(null);
		}
	};

	const validateAll = async (): Promise<AIRuntimeConfig | null> => {
		setValidatingCapability("all");
		setError(null);
		setFeedback(null);
		try {
			const result = await validateDesktopAiConfig({
				config: draftConfig,
				secretValues: {},
			});
			setValidationResult(result);
			if (!validationReady(result, targets)) {
				throw new Error("Validation failed for one or more selected targets.");
			}
			let nextTargets = targets;
			if (result.embeddings.embedding_output_dimension && targets.embeddings) {
				nextTargets = {
					...targets,
					embeddings: targets.embeddings
						? {
								...targets.embeddings,
								embedding_output_dimension:
									result.embeddings.embedding_output_dimension,
							}
						: null,
				};
				setTargets(nextTargets);
			}
			const nextConfig = buildConfig(projectId, location, nextTargets);
			setValidatedDraftKey(JSON.stringify(nextConfig));
			setFeedback("All selected targets validated. You can save this setup.");
			return nextConfig;
		} catch (validationError) {
			setError(
				validationError instanceof Error
					? validationError.message
					: "Validation failed.",
			);
			return null;
		} finally {
			setValidatingCapability(null);
		}
	};

	const handleSave = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setIsSaving(true);
		setError(null);
		try {
			const configToSave = canSave ? draftConfig : await validateAll();
			if (!configToSave) {
				return;
			}
			await saveDesktopAiConfig({
				config: configToSave,
				secretValues: {},
			});
			setFeedback("Google AI setup saved and backend runtime refreshed.");
			await onCredentialsSaved();
		} catch (saveError) {
			setError(
				saveError instanceof Error
					? saveError.message
					: "Failed to save Google AI setup.",
			);
		} finally {
			setIsSaving(false);
		}
	};

	return (
			<div className={cn("workspace-panel-elevated space-y-5 p-5 sm:p-6", className)}>
				<PanelHeader
					eyebrow={header?.eyebrow ?? "Google AI"}
					title={header?.title ?? "Configure Model Garden targets"}
				description={
					header?.description ??
					"Use Google Cloud ADC, project/location setup, Model Garden discovery, and capability probes before saving workflow targets."
				}
				actions={
					<StatusPill tone={desktopHealth?.ai.google.adcReady ? "success" : "warning"}>
						ADC {desktopHealth?.ai.google.adcReady ? "Ready" : "Check"}
					</StatusPill>
				}
			/>

			<form className="space-y-4" onSubmit={handleSave}>
				<section className="workspace-panel space-y-4 p-4 sm:p-5">
					<PanelHeader
						title="Google Cloud Setup"
						actions={<Cloud className="size-4 text-accent" />}
					/>
					<div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem_auto]">
						<label className="space-y-1.5 text-sm text-text-secondary">
							<span>Project ID</span>
							<Input
								value={projectId}
								onChange={(event) => setProjectId(event.target.value)}
								placeholder="my-google-cloud-project"
							/>
							</label>
							<label className="space-y-1.5 text-sm text-text-secondary">
								<span>Region</span>
								<Input
								value={location}
								onChange={(event) => setLocation(event.target.value)}
								placeholder="us-central1"
							/>
						</label>
						<Button
							type="button"
							variant="subtle"
							className="self-end"
							disabled={isLoadingCatalog}
							onClick={() => void loadCatalog()}
						>
							{isLoadingCatalog ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Loading
								</>
							) : (
								"Browse Targets"
							)}
						</Button>
					</div>
					{desktopHealth?.ai.google.message ? (
						<InlineBanner tone="warning" title={desktopHealth.ai.google.message} />
					) : null}
				</section>

				{(["text_generation", "embeddings", "review"] as CapabilityName[]).map(
					(capability) => (
						<CapabilityPicker
							key={capability}
							capability={capability}
							location={location}
							config={draftConfig}
							catalog={catalog}
							target={targets[capability]}
							validation={validationResult?.[capability] ?? null}
							onTargetChange={(target) => updateTarget(capability, target)}
							onValidate={() => void validateCapability(capability)}
							isValidating={validatingCapability === capability}
							onDeployComplete={(resourceName) =>
								updateTarget(
									capability,
									manualTarget(resourceName, capability, location),
								)
							}
						/>
					),
				)}

				<div className="space-y-3">
					<div className="flex flex-wrap gap-2">
						<Button
							type="submit"
							variant="accent"
							disabled={isSaving || validatingCapability !== null}
						>
							{isSaving ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Saving
								</>
							) : (
								"Save"
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
					{feedback ? <div className="text-sm font-medium text-[#d5f2df]">{feedback}</div> : null}
					{error ? <InlineBanner tone="danger" title={error} /> : null}
				</div>
			</form>
		</div>
	);
}
