import type {
  AICapabilityStatus,
  AIRuntimeConfig,
  CapabilityName,
  CredentialStatus,
  GoogleAITarget,
} from "./types";

const GOOGLE_AI_SCHEMA_VERSION = 2;
const DEFAULT_GOOGLE_LOCATION = "us-central1";

function buildDefaultAiRuntimeConfig(): AIRuntimeConfig {
  return {
    schema_version: GOOGLE_AI_SCHEMA_VERSION,
    google_project_id: process.env.GOOGLE_CLOUD_PROJECT ?? null,
    google_location: process.env.GOOGLE_CLOUD_LOCATION ?? DEFAULT_GOOGLE_LOCATION,
    capabilities: {
      text_generation: null,
      embeddings: null,
      review: null,
    },
  };
}

function normalizeCapabilityList(value: unknown): CapabilityName[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter(
        (item): item is CapabilityName =>
          item === "text_generation" || item === "embeddings" || item === "review"
      )
    )
  );
}

function normalizeTarget(rawTarget: unknown): GoogleAITarget | null {
  const target =
    rawTarget && typeof rawTarget === "object"
      ? (rawTarget as Record<string, unknown>)
      : null;
  if (!target) {
    return null;
  }

  const targetKind = target.target_kind === "vertex_endpoint" ? "vertex_endpoint" : "managed_model";
  const resourceName =
    typeof target.resource_name === "string" ? target.resource_name.trim() : "";
  if (!resourceName) {
    return null;
  }

  return {
    target_kind: targetKind,
    resource_name: resourceName,
    display_name:
      typeof target.display_name === "string" && target.display_name.trim()
        ? target.display_name.trim()
        : resourceName,
    publisher:
      typeof target.publisher === "string" && target.publisher.trim()
        ? target.publisher.trim()
        : null,
    version:
      typeof target.version === "string" && target.version.trim()
        ? target.version.trim()
        : null,
    location:
      typeof target.location === "string" && target.location.trim()
        ? target.location.trim()
        : null,
    capabilities: normalizeCapabilityList(target.capabilities),
    adapter_family:
      typeof target.adapter_family === "string" && target.adapter_family.trim()
        ? target.adapter_family.trim()
        : null,
    embedding_output_dimension: Number.isFinite(
      Number(target.embedding_output_dimension)
    )
      ? Number(target.embedding_output_dimension)
      : null,
    source:
      typeof target.source === "string" && target.source.trim()
        ? (target.source as GoogleAITarget["source"])
        : null,
  };
}

function normalizeAiRuntimeConfig(rawConfig: any): AIRuntimeConfig {
  const fallback = buildDefaultAiRuntimeConfig();
  const config = rawConfig && typeof rawConfig === "object" ? rawConfig : {};

  if (config.schema_version === 1 || Array.isArray(config.profiles)) {
    return {
      ...fallback,
      google_project_id:
        typeof config.google_project_id === "string" && config.google_project_id.trim()
          ? config.google_project_id.trim()
          : fallback.google_project_id,
      google_location:
        typeof config.google_location === "string" && config.google_location.trim()
          ? config.google_location.trim()
          : fallback.google_location,
    };
  }

  return {
    schema_version: GOOGLE_AI_SCHEMA_VERSION,
    google_project_id:
      typeof config.google_project_id === "string" && config.google_project_id.trim()
        ? config.google_project_id.trim()
        : fallback.google_project_id,
    google_location:
      typeof config.google_location === "string" && config.google_location.trim()
        ? config.google_location.trim()
        : fallback.google_location,
    capabilities: {
      text_generation: normalizeTarget(config.capabilities?.text_generation),
      embeddings: normalizeTarget(config.capabilities?.embeddings),
      review: normalizeTarget(config.capabilities?.review),
    },
  };
}

function collectSecretRefs(_aiRuntimeConfig: AIRuntimeConfig | null | undefined): string[] {
  return [];
}

function summarizeCapability(
  aiRuntimeConfig: AIRuntimeConfig | null | undefined,
  _secretStatus: CredentialStatus | null | undefined,
  capabilityName: CapabilityName
): AICapabilityStatus {
  const target = aiRuntimeConfig?.capabilities?.[capabilityName] || null;
  if (!target) {
    return {
      configured: false,
      ready: false,
      targetKind: null,
      resourceName: null,
      displayName: null,
      publisher: null,
      version: null,
      location: aiRuntimeConfig?.google_location ?? DEFAULT_GOOGLE_LOCATION,
      adapterFamily: null,
      embeddingOutputDimension: null,
      message:
        capabilityName === "embeddings"
          ? "Semantic search is disabled."
          : "No Google AI target is configured for this capability.",
    };
  }

  const ready = Boolean(aiRuntimeConfig?.google_project_id && aiRuntimeConfig.google_location);
  return {
    configured: true,
    ready,
    targetKind: target.target_kind,
    resourceName: target.resource_name,
    displayName: target.display_name,
    publisher: target.publisher ?? null,
    version: target.version ?? null,
    location: target.location ?? aiRuntimeConfig?.google_location ?? DEFAULT_GOOGLE_LOCATION,
    adapterFamily: target.adapter_family ?? null,
    embeddingOutputDimension: target.embedding_output_dimension ?? null,
    message: ready
      ? undefined
      : "Google Cloud project ID and Google AI location are required.",
  };
}

export {
  DEFAULT_GOOGLE_LOCATION,
  GOOGLE_AI_SCHEMA_VERSION,
  buildDefaultAiRuntimeConfig,
  collectSecretRefs,
  normalizeAiRuntimeConfig,
  normalizeTarget,
  summarizeCapability,
};
