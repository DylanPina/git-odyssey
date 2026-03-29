import type {
  AICapabilityStatus,
  AIRuntimeConfig,
  CapabilityName,
  CredentialStatus,
  ProviderProfileConfig,
} from "./types";

const DEFAULT_OPENAI_PROFILE_ID = "openai-default";
const DEFAULT_OPENAI_LABEL = "OpenAI";
const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com";
const DEFAULT_TEXT_MODEL = "gpt-5.4-mini";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

function buildApiKeySecretRef(profileId: string): string {
  return `provider:${profileId}:api-key`;
}

function buildDefaultAiRuntimeConfig(): AIRuntimeConfig {
  return {
    schema_version: 1,
    profiles: [
      {
        id: DEFAULT_OPENAI_PROFILE_ID,
        provider_type: "openai",
        label: DEFAULT_OPENAI_LABEL,
        base_url: OPENAI_DEFAULT_BASE_URL,
        auth_mode: "bearer",
        api_key_secret_ref: buildApiKeySecretRef(DEFAULT_OPENAI_PROFILE_ID),
        supports_text_generation: true,
        supports_embeddings: true,
      },
    ],
    capabilities: {
      text_generation: {
        provider_profile_id: DEFAULT_OPENAI_PROFILE_ID,
        model_id: DEFAULT_TEXT_MODEL,
        temperature: 0.2,
      },
      embeddings: {
        provider_profile_id: DEFAULT_OPENAI_PROFILE_ID,
        model_id: DEFAULT_EMBEDDING_MODEL,
      },
    },
  };
}

function normalizeProviderProfile(
  rawProfile: any,
  fallbackProfile: ProviderProfileConfig
): ProviderProfileConfig {
  const profile = rawProfile && typeof rawProfile === "object" ? rawProfile : {};
  const id = typeof profile.id === "string" && profile.id ? profile.id : fallbackProfile.id;
  const providerType =
    typeof profile.provider_type === "string" && profile.provider_type
      ? profile.provider_type
      : fallbackProfile.provider_type;
  const authMode =
    typeof profile.auth_mode === "string" && profile.auth_mode
      ? profile.auth_mode
      : fallbackProfile.auth_mode;
  const baseUrl =
    providerType === "openai"
      ? OPENAI_DEFAULT_BASE_URL
      : typeof profile.base_url === "string" && profile.base_url
        ? profile.base_url
        : fallbackProfile.base_url || "";

  return {
    id,
    provider_type: providerType,
    label:
      typeof profile.label === "string" && profile.label
        ? profile.label
        : fallbackProfile.label,
    base_url: baseUrl,
    auth_mode: authMode,
    api_key_secret_ref:
      authMode === "none"
        ? null
        : typeof profile.api_key_secret_ref === "string" && profile.api_key_secret_ref
          ? profile.api_key_secret_ref
          : buildApiKeySecretRef(id),
    supports_text_generation: profile.supports_text_generation !== false,
    supports_embeddings: profile.supports_embeddings !== false,
  };
}

function normalizeAiRuntimeConfig(rawConfig: any): AIRuntimeConfig {
  const fallback = buildDefaultAiRuntimeConfig();
  const config = rawConfig && typeof rawConfig === "object" ? rawConfig : {};
  const profiles =
    Array.isArray(config.profiles) && config.profiles.length > 0
      ? config.profiles.map((profile: any) =>
          normalizeProviderProfile(profile, fallback.profiles[0])
        )
      : fallback.profiles;

  const textBinding =
    config.capabilities?.text_generation && typeof config.capabilities.text_generation === "object"
      ? config.capabilities.text_generation
      : {};
  const hasEmbeddingsBinding =
    config.capabilities &&
    Object.prototype.hasOwnProperty.call(config.capabilities, "embeddings");
  const embeddingsBinding = hasEmbeddingsBinding
    ? config.capabilities.embeddings
    : fallback.capabilities.embeddings;

  return {
    schema_version: Number(config.schema_version) || fallback.schema_version,
    profiles,
    capabilities: {
      text_generation: {
        provider_profile_id:
          typeof textBinding.provider_profile_id === "string" &&
          textBinding.provider_profile_id
            ? textBinding.provider_profile_id
            : fallback.capabilities.text_generation?.provider_profile_id ??
              DEFAULT_OPENAI_PROFILE_ID,
        model_id:
          typeof textBinding.model_id === "string" && textBinding.model_id
            ? textBinding.model_id
            : fallback.capabilities.text_generation?.model_id ?? DEFAULT_TEXT_MODEL,
        temperature: Number.isFinite(Number(textBinding.temperature))
          ? Number(textBinding.temperature)
          : fallback.capabilities.text_generation?.temperature ?? 0.2,
      },
      embeddings:
        embeddingsBinding === null
          ? null
          : {
              provider_profile_id:
                typeof embeddingsBinding?.provider_profile_id === "string" &&
                embeddingsBinding.provider_profile_id
                  ? embeddingsBinding.provider_profile_id
                  : fallback.capabilities.embeddings?.provider_profile_id ??
                    DEFAULT_OPENAI_PROFILE_ID,
              model_id:
                typeof embeddingsBinding?.model_id === "string" &&
                embeddingsBinding.model_id
                  ? embeddingsBinding.model_id
                  : fallback.capabilities.embeddings?.model_id ??
                    DEFAULT_EMBEDDING_MODEL,
            },
    },
  };
}

function getProfileById(
  aiRuntimeConfig: AIRuntimeConfig | null | undefined,
  profileId: string | null | undefined
): ProviderProfileConfig | null {
  if (!profileId) {
    return null;
  }

  const profiles = aiRuntimeConfig?.profiles || [];
  return profiles.find((profile) => profile.id === profileId) || null;
}

function collectSecretRefs(aiRuntimeConfig: AIRuntimeConfig | null | undefined): string[] {
  const refs = new Set<string>();
  for (const profile of aiRuntimeConfig?.profiles || []) {
    if (profile.auth_mode !== "none" && profile.api_key_secret_ref) {
      refs.add(profile.api_key_secret_ref);
    }
  }
  return Array.from(refs);
}

function summarizeCapability(
  aiRuntimeConfig: AIRuntimeConfig | null | undefined,
  secretStatus: CredentialStatus | null | undefined,
  capabilityName: CapabilityName
): AICapabilityStatus {
  const binding = aiRuntimeConfig?.capabilities?.[capabilityName] || null;
  if (!binding) {
    return {
      configured: false,
      ready: false,
      providerType: null,
      modelId: null,
      baseUrl: null,
      authMode: null,
      secretPresent: false,
      message:
        capabilityName === "embeddings"
          ? "Semantic search is disabled."
          : "Text generation is not configured.",
    };
  }

  const profile = getProfileById(aiRuntimeConfig, binding.provider_profile_id);
  if (!profile) {
    return {
      configured: true,
      ready: false,
      providerType: null,
      modelId: binding.model_id,
      baseUrl: null,
      authMode: null,
      secretPresent: false,
      message: `Provider profile '${binding.provider_profile_id}' is missing.`,
    };
  }

  const secretPresent =
    profile.auth_mode === "none"
      ? true
      : Boolean(
          profile.api_key_secret_ref &&
            secretStatus?.secretRefs?.[profile.api_key_secret_ref]
        );

  return {
    configured: true,
    ready: secretPresent,
    providerType: profile.provider_type,
    modelId: binding.model_id,
    baseUrl: profile.base_url || OPENAI_DEFAULT_BASE_URL,
    authMode: profile.auth_mode,
    secretPresent,
    message: secretPresent ? undefined : `Provider secret missing for ${profile.label}.`,
  };
}

export {
  DEFAULT_OPENAI_PROFILE_ID,
  OPENAI_DEFAULT_BASE_URL,
  buildApiKeySecretRef,
  buildDefaultAiRuntimeConfig,
  collectSecretRefs,
  getProfileById,
  normalizeAiRuntimeConfig,
  summarizeCapability,
};
