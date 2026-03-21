import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";

import {
  saveDesktopAiConfig,
  validateDesktopAiConfig,
} from "@/api/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  AIRuntimeConfig,
  AuthMode,
  DesktopHealthStatus,
  DesktopSettingsStatus,
  DesktopAiValidationResult,
  ProviderType,
} from "@/lib/definitions/desktop";

type DesktopSetupCardProps = {
  desktopSettingsStatus: DesktopSettingsStatus | null;
  desktopHealth: DesktopHealthStatus | null;
  onCredentialsSaved: () => Promise<void>;
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

function buildApiKeySecretRef(
  providerType: ProviderType,
  profileId: string
) {
  return providerType === "openai"
    ? OPENAI_SECRET_REF
    : `provider:${profileId}:api-key`;
}

function HealthPill({ label, summary, healthy }: CapabilityHealthPillProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left">
      <div className="text-xs uppercase tracking-[0.2em] text-white/40">
        {label}
      </div>
      <div className={healthy ? "text-emerald-300" : "text-amber-300"}>
        {summary}
      </div>
    </div>
  );
}

function getProfile(
  config: AIRuntimeConfig | null | undefined,
  profileId: string | null | undefined
) {
  if (!config || !profileId) {
    return null;
  }

  return config.profiles.find((profile) => profile.id === profileId) ?? null;
}

function buildInitialState(config: AIRuntimeConfig | null | undefined): SetupFormState {
  const textBinding = config?.capabilities.text_generation;
  const textProfile = getProfile(config, textBinding?.provider_profile_id);
  const embeddingsBinding = config?.capabilities.embeddings ?? null;
  const embeddingsProfile = getProfile(config, embeddingsBinding?.provider_profile_id);

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
  supportsEmbeddings: boolean
) {
  return {
    id,
    provider_type: form.providerType,
    label: form.providerType === "openai" ? "OpenAI" : form.label.trim() || "Custom Provider",
    base_url: form.providerType === "openai" ? OPENAI_BASE_URL : form.baseUrl.trim(),
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
  embeddings: CapabilityFormState
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
    shareProfile
  );
  const profiles = [textProfile];
  const secretValues: Record<string, string> = {};
  const textSecretRef = buildApiKeySecretRef(state.text.providerType, textProfileId);

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
        true
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
        embeddingsProfileId
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
    | undefined
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
    | null
) {
  if (!result) {
    return null;
  }

  const healthy = result.ready;
  return (
    <div
      className={
        healthy
          ? "rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
          : "rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
      }
    >
      <div className="flex items-center gap-2 font-medium">
        {healthy && <CheckCircle2 className="h-4 w-4" />}
        <span>{title}</span>
      </div>
      <p className="mt-1 text-xs opacity-90">
        {result.message ?? "No validation details were returned."}
      </p>
    </div>
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
  onChange: (next: Partial<CapabilityFormState & { temperature?: string }>) => void;
  showTemperature?: boolean;
  showDisableHint?: boolean;
}) {
  const isCompatible = value.providerType === "openai_compatible";

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-1 text-sm text-white/55">{description}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm text-white/70">
          Provider
          <select
            className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none"
            value={value.providerType}
            onChange={(event) =>
              onChange({
                providerType: event.target.value as ProviderType,
                label:
                  event.target.value === "openai" ? "OpenAI" : value.label,
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

        <label className="text-sm text-white/70">
          Model Id
          <Input
            value={value.modelId}
            onChange={(event) => onChange({ modelId: event.target.value })}
            placeholder="gpt-5.4-mini"
            className="mt-1"
          />
        </label>

        {showTemperature && (
          <label className="text-sm text-white/70">
            Temperature
            <Input
              value={value.temperature ?? "0.2"}
              onChange={(event) => onChange({ temperature: event.target.value })}
              placeholder="0.2"
              className="mt-1"
            />
          </label>
        )}

        {isCompatible && (
          <label className="text-sm text-white/70">
            Label
            <Input
              value={value.label}
              onChange={(event) => onChange({ label: event.target.value })}
              placeholder="Local LLM"
              className="mt-1"
            />
          </label>
        )}

        {isCompatible && (
          <label className="text-sm text-white/70 md:col-span-2">
            Base URL
            <Input
              value={value.baseUrl}
              onChange={(event) => onChange({ baseUrl: event.target.value })}
              placeholder="http://127.0.0.1:11434"
              className="mt-1"
            />
          </label>
        )}

        {isCompatible && (
          <label className="text-sm text-white/70">
            Auth Mode
            <select
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none"
              value={value.authMode}
              onChange={(event) =>
                onChange({ authMode: event.target.value as AuthMode })
              }
            >
              <option value="bearer">Bearer API key</option>
              <option value="none">No auth</option>
            </select>
          </label>
        )}

        {(value.providerType === "openai" || value.authMode === "bearer") && (
          <label className="text-sm text-white/70 md:col-span-2">
            API Key
            <Input
              type="password"
              value={value.apiKey}
              onChange={(event) => onChange({ apiKey: event.target.value })}
              placeholder="Leave blank to reuse the saved key during validation and save"
              className="mt-1"
            />
          </label>
        )}
      </div>

      {showDisableHint && (
        <p className="mt-3 text-xs text-white/45">
          GitOdyssey expects an OpenAI-style `/v1/responses` endpoint for chat and
          summaries, plus `/v1/embeddings` for semantic search when embeddings are enabled.
        </p>
      )}
    </div>
  );
}

export function DesktopSetupCard({
  desktopSettingsStatus,
  desktopHealth,
  onCredentialsSaved,
}: DesktopSetupCardProps) {
  const [formState, setFormState] = useState<SetupFormState>(() =>
    buildInitialState(desktopSettingsStatus?.aiRuntimeConfig)
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
        throw new Error("Validation failed. Review the endpoint feedback below.");
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
        "AI configuration saved locally. Restarting local services..."
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
    <div className="mx-auto w-full max-w-4xl rounded-[2rem] border border-white/15 bg-slate-950/70 p-6 text-left shadow-2xl backdrop-blur-xl">
      <div className="mb-5">
        <div className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">
          Local Desktop Setup
        </div>
        <h2 className="mt-2 text-3xl font-semibold text-white">
          Configure AI by capability
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-white/60">
          Authentication now means the local desktop backend is reachable. AI readiness is configured separately for chat, summaries, and semantic search.
        </p>
      </div>

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

        <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Embeddings</h3>
              <p className="mt-1 text-sm text-white/55">
                Enable semantic search and retrieval with a provider that exposes `/v1/embeddings`.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
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
          </div>
        </div>

        {formState.embeddingsEnabled && (
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
        )}

        <div className="flex flex-col gap-3 pt-1 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            disabled={isValidating || isSaving}
            onClick={() => void runValidation()}
            className="border-white/20 bg-transparent text-white hover:bg-white/10"
          >
            {isValidating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Validating
              </>
            ) : (
              "Validate Endpoints"
            )}
          </Button>
          <Button
            type="submit"
            disabled={isSaving || isValidating}
            className="bg-cyan-500 text-slate-950 hover:bg-cyan-300"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving
              </>
            ) : (
              "Validate And Save"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void onCredentialsSaved()}
            className="border-white/20 bg-transparent text-white hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh Health
          </Button>
        </div>
      </form>

      {feedback && <p className="mt-4 text-sm text-emerald-300">{feedback}</p>}
      {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

      {validationResult && (
        <div className="mt-5">
          <p className="mb-3 text-xs uppercase tracking-[0.2em] text-white/45">
            Draft Validation Results
          </p>
          <div className="grid gap-3 md:grid-cols-2">
          {validationSummary("Text generation validation", validationResult.text_generation)}
          {formState.embeddingsEnabled &&
            validationSummary("Embeddings validation", validationResult.embeddings)}
          </div>
        </div>
      )}

      <div className="mt-6">
        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-white/45">
          Current Saved Runtime Health
        </p>
        <div className="grid gap-3 md:grid-cols-4">
        <HealthPill
          label="Chat"
          summary={capabilitySummary(desktopHealth?.ai.textGeneration ?? desktopSettingsStatus?.ai.textGeneration)}
          healthy={Boolean(desktopHealth?.ai.textGeneration.ready)}
        />
        <HealthPill
          label="Embeddings"
          summary={capabilitySummary(desktopHealth?.ai.embeddings ?? desktopSettingsStatus?.ai.embeddings)}
          healthy={Boolean(
            desktopHealth?.ai.embeddings.ready ||
              desktopSettingsStatus?.ai.embeddings?.configured === false
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
        <p className="mt-3 text-xs text-white/45">
          These cards reflect the configuration currently saved and running in the local backend, not the unsaved draft above.
        </p>
      </div>

      {(desktopHealth?.backend.message ||
        desktopHealth?.postgres.message ||
        desktopHealth?.ai.embeddings.reindexRequired) && (
        <div className="mt-4 space-y-2 text-sm text-white/55">
          {desktopHealth?.backend.message && (
            <p>Backend: {desktopHealth.backend.message}</p>
          )}
          {desktopHealth?.postgres.message && (
            <p>Postgres: {desktopHealth.postgres.message}</p>
          )}
          {desktopHealth?.ai.embeddings.reindexRequired && (
            <p>
              Semantic search needs a reindex because the active embeddings profile differs from the profile stored on at least one repo.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
