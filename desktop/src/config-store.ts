import fs = require("node:fs");
import crypto = require("node:crypto");
import path = require("node:path");

import type {
  DesktopAiProfileSaveInput,
  DesktopAiSavedProfile,
  CredentialStatus,
  DesktopConfigPatch,
  DesktopConfigState,
  DesktopReviewSettings,
  DesktopReviewSettingsInput,
  DesktopRepoSettings,
  DesktopRepoSettingsInput,
  DesktopRepoSettingsSaveInput,
  DesktopSettingsStatus,
} from "./types";

import {
  buildDefaultAiRuntimeConfig,
  normalizeAiRuntimeConfig,
  summarizeCapability,
} from "./ai-config";
import {
  dedupeRecentProjects,
  normalizePath,
  toGitProjectSummary,
} from "./git-projects";

const DEFAULT_BACKEND_PORT = Number(process.env.GITODYSSEY_BACKEND_PORT ?? "48120");
const DEFAULT_REPO_MAX_COMMITS = 50;
const DEFAULT_REPO_CONTEXT_LINES = 10;

function normalizeGuidelineText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value == null) {
    return "";
  }

  return String(value).trim();
}

function normalizeReviewSettings(
  rawSettings?: DesktopReviewSettingsInput
): DesktopReviewSettings {
  const settings = rawSettings && typeof rawSettings === "object" ? rawSettings : {};

  return {
    pullRequestGuidelines: normalizeGuidelineText(settings.pullRequestGuidelines),
  };
}

function normalizePositiveInteger(
  value: number | string | null | undefined,
  fallback: number
): number {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeNonNegativeInteger(
  value: number | string | null | undefined,
  fallback: number
): number {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeRepoSettings(rawSettings?: DesktopRepoSettingsInput): DesktopRepoSettings {
  const settings = rawSettings && typeof rawSettings === "object" ? rawSettings : {};

  return {
    maxCommits: normalizePositiveInteger(
      settings.maxCommits,
      DEFAULT_REPO_MAX_COMMITS
    ),
    contextLines: normalizeNonNegativeInteger(
      settings.contextLines,
      DEFAULT_REPO_CONTEXT_LINES
    ),
    pullRequestGuidelines: normalizeGuidelineText(settings.pullRequestGuidelines),
  };
}

function normalizeRepoSettingsMap(
  rawRepoSettings: unknown
): Record<string, DesktopRepoSettings> {
  const repoSettings =
    rawRepoSettings && typeof rawRepoSettings === "object"
      ? (rawRepoSettings as Record<string, DesktopRepoSettingsInput>)
      : {};
  const normalizedEntries: Record<string, DesktopRepoSettings> = {};

  for (const [repoPath, settings] of Object.entries(repoSettings)) {
    const normalizedRepoPath = normalizePath(repoPath);
    if (!normalizedRepoPath) {
      continue;
    }

    normalizedEntries[normalizedRepoPath] = normalizeRepoSettings(settings);
  }

  return normalizedEntries;
}

function normalizeSecretValues(
  rawSecretValues: unknown
): Record<string, string> {
  const secretValues =
    rawSecretValues && typeof rawSecretValues === "object"
      ? (rawSecretValues as Record<string, unknown>)
      : {};
  const normalizedEntries: Record<string, string> = {};

  for (const [secretRef, value] of Object.entries(secretValues)) {
    const normalizedSecretRef = normalizeGuidelineText(secretRef);
    if (!normalizedSecretRef) {
      continue;
    }

    if (typeof value === "string") {
      normalizedEntries[normalizedSecretRef] = value;
      continue;
    }

    if (value != null) {
      normalizedEntries[normalizedSecretRef] = String(value);
    }
  }

  return normalizedEntries;
}

function normalizeSavedAiProfile(
  rawProfile: unknown
): DesktopAiSavedProfile | null {
  const profile =
    rawProfile && typeof rawProfile === "object"
      ? (rawProfile as Record<string, unknown>)
      : null;
  if (!profile) {
    return null;
  }

  const id = normalizeGuidelineText(profile.id);
  const name = normalizeGuidelineText(profile.name);
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    config: normalizeAiRuntimeConfig(profile.config),
    secretValues: normalizeSecretValues(profile.secretValues),
    updatedAt:
      typeof profile.updatedAt === "string" && profile.updatedAt
        ? profile.updatedAt
        : new Date().toISOString(),
  };
}

function normalizeSavedAiProfiles(
  rawProfiles: unknown
): DesktopAiSavedProfile[] {
  if (!Array.isArray(rawProfiles)) {
    return [];
  }

  return rawProfiles
    .map((profile) => normalizeSavedAiProfile(profile))
    .filter((profile): profile is DesktopAiSavedProfile => profile !== null);
}

class DesktopConfigStore {
  rootPath: string;
  configPath: string;
  state: DesktopConfigState;

  constructor({ rootPath }: { rootPath: string }) {
    this.rootPath = rootPath;
    this.configPath = path.join(rootPath, "desktop-config.json");
    this.state = this.#load();
  }

  #defaultState(): DesktopConfigState {
    const dataDir = path.join(this.rootPath, "data");
    const logDir = path.join(this.rootPath, "logs");

    return {
      backendPort: DEFAULT_BACKEND_PORT,
      databaseUrl:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@127.0.0.1:5432/gitodyssey",
      databaseSslMode: process.env.DATABASE_SSLMODE ?? "disable",
      dataDir,
      logDir,
      aiRuntimeConfig: buildDefaultAiRuntimeConfig(),
      savedAiProfiles: [],
      reviewSettings: normalizeReviewSettings(),
      firstRunCompleted: false,
      recentProjects: [],
      repoSettings: {},
    };
  }

  #ensureParentDirs(): void {
    fs.mkdirSync(this.rootPath, { recursive: true });
    fs.mkdirSync(path.join(this.rootPath, "data"), { recursive: true });
    fs.mkdirSync(path.join(this.rootPath, "logs"), { recursive: true });
  }

  #copyDirIfPresent(sourceDir: string, targetDir: string): void {
    if (!fs.existsSync(sourceDir)) {
      return;
    }

    fs.mkdirSync(targetDir, { recursive: true });

    for (const entry of fs.readdirSync(sourceDir)) {
      fs.cpSync(path.join(sourceDir, entry), path.join(targetDir, entry), {
        recursive: true,
        force: false,
        errorOnExist: false,
      });
    }
  }

  #migrateLegacyStateIfNeeded(): void {
    if (fs.existsSync(this.configPath)) {
      return;
    }

    const legacyRootPath = path.join(
      process.env.HOME ?? "",
      "Library",
      "Application Support",
      "git-odyssey-desktop"
    );
    const legacyConfigPath = path.join(legacyRootPath, "desktop-config.json");
    if (!legacyConfigPath || !fs.existsSync(legacyConfigPath)) {
      return;
    }

    this.#ensureParentDirs();
    fs.copyFileSync(legacyConfigPath, this.configPath, fs.constants.COPYFILE_EXCL);
    this.#copyDirIfPresent(path.join(legacyRootPath, "logs"), path.join(this.rootPath, "logs"));
    this.#copyDirIfPresent(path.join(legacyRootPath, "data"), path.join(this.rootPath, "data"));
  }

  #load(): DesktopConfigState {
    this.#ensureParentDirs();
    this.#migrateLegacyStateIfNeeded();
    const defaults = this.#defaultState();

    if (!fs.existsSync(this.configPath)) {
      fs.writeFileSync(this.configPath, JSON.stringify(defaults, null, 2));
      return defaults;
    }

    try {
      const raw = fs.readFileSync(this.configPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<DesktopConfigState>;
      const merged: DesktopConfigState = {
        ...defaults,
        ...parsed,
        aiRuntimeConfig: normalizeAiRuntimeConfig(
          parsed.aiRuntimeConfig ?? defaults.aiRuntimeConfig
        ),
        savedAiProfiles: normalizeSavedAiProfiles(
          parsed.savedAiProfiles ?? defaults.savedAiProfiles
        ),
        reviewSettings: normalizeReviewSettings(
          parsed.reviewSettings ?? defaults.reviewSettings
        ),
        recentProjects: dedupeRecentProjects(parsed.recentProjects ?? []),
        repoSettings: normalizeRepoSettingsMap(
          parsed.repoSettings ?? defaults.repoSettings
        ),
      };
      fs.writeFileSync(this.configPath, JSON.stringify(merged, null, 2));
      return merged;
    } catch (error) {
      const recovered: DesktopConfigState = {
        ...defaults,
        recoveryMessage:
          error instanceof Error ? error.message : "Failed to parse desktop config.",
      };
      fs.writeFileSync(this.configPath, JSON.stringify(recovered, null, 2));
      return recovered;
    }
  }

  getState(): DesktopConfigState {
    return { ...this.state };
  }

  save(partial: DesktopConfigPatch): DesktopConfigState {
    this.state = {
      ...this.state,
      ...partial,
      aiRuntimeConfig: normalizeAiRuntimeConfig(
        partial.aiRuntimeConfig ?? this.state.aiRuntimeConfig
      ),
      savedAiProfiles: normalizeSavedAiProfiles(
        partial.savedAiProfiles ?? this.state.savedAiProfiles
      ),
      reviewSettings: normalizeReviewSettings(
        partial.reviewSettings ?? this.state.reviewSettings
      ),
      repoSettings: partial.repoSettings
        ? {
            ...(this.state.repoSettings ?? {}),
            ...normalizeRepoSettingsMap(partial.repoSettings),
          }
        : this.state.repoSettings ?? {},
    };
    this.#ensureParentDirs();
    fs.writeFileSync(this.configPath, JSON.stringify(this.state, null, 2));
    return this.getState();
  }

  getRecentProjects() {
    const recentProjects = dedupeRecentProjects(this.state.recentProjects ?? []);
    if (
      JSON.stringify(recentProjects) !== JSON.stringify(this.state.recentProjects ?? [])
    ) {
      this.save({ recentProjects });
    }
    return recentProjects;
  }

  recordRecentProject(projectPath: string) {
    const projectSummary = toGitProjectSummary(projectPath);
    if (!projectSummary) {
      throw new Error("That folder is not inside a Git project.");
    }

    const recentProjects = dedupeRecentProjects([
      projectSummary,
      ...(this.state.recentProjects ?? []),
    ]);
    this.save({ recentProjects });
    return projectSummary;
  }

  removeRecentProject(projectPath: string): void {
    const normalizedRepoPath = normalizePath(projectPath);
    if (!normalizedRepoPath) {
      return;
    }

    const recentProjects = (this.state.recentProjects ?? []).filter(
      (project) => project.path !== normalizedRepoPath
    );
    const repoSettings = { ...(this.state.repoSettings ?? {}) };
    delete repoSettings[normalizedRepoPath];
    this.save({ recentProjects, repoSettings });
  }

  getRepoSettings(repoPath: string): DesktopRepoSettings {
    const normalizedRepoPath = normalizePath(repoPath);
    if (!normalizedRepoPath) {
      return normalizeRepoSettings();
    }

    return normalizeRepoSettings(this.state.repoSettings?.[normalizedRepoPath]);
  }

  getReviewSettings(): DesktopReviewSettings {
    return normalizeReviewSettings(this.state.reviewSettings);
  }

  saveReviewSettings(input: DesktopReviewSettingsInput): DesktopReviewSettings {
    const nextSettings = normalizeReviewSettings(input);
    this.save({ reviewSettings: nextSettings });
    return nextSettings;
  }

  saveAiProfile(input: DesktopAiProfileSaveInput): DesktopAiSavedProfile {
    const profileName = normalizeGuidelineText(input?.name);
    if (!profileName) {
      throw new Error("A profile name is required.");
    }

    const profileId = normalizeGuidelineText(input?.id) || crypto.randomUUID();
    const normalizedConfig = normalizeAiRuntimeConfig(input?.config);
    const secretValues = normalizeSecretValues(input?.secretValues);
    const existingProfiles = normalizeSavedAiProfiles(this.state.savedAiProfiles);
    const existingIndex = existingProfiles.findIndex(
      (profile) => profile.id === profileId
    );

    if (
      existingProfiles.some(
        (profile, index) =>
          index !== existingIndex &&
          profile.name.toLowerCase() === profileName.toLowerCase()
      )
    ) {
      throw new Error(`A saved profile named '${profileName}' already exists.`);
    }

    const nextProfile: DesktopAiSavedProfile = {
      id: profileId,
      name: profileName,
      config: normalizedConfig,
      secretValues,
      updatedAt: new Date().toISOString(),
    };

    const nextProfiles =
      existingIndex >= 0
        ? existingProfiles.map((profile, index) =>
            index === existingIndex ? nextProfile : profile
          )
        : [nextProfile, ...existingProfiles];

    this.save({ savedAiProfiles: nextProfiles });
    return nextProfile;
  }

  deleteAiProfile(profileId: string): void {
    const normalizedProfileId = normalizeGuidelineText(profileId);
    if (!normalizedProfileId) {
      throw new Error("A profile id is required to delete a saved profile.");
    }

    const nextProfiles = normalizeSavedAiProfiles(this.state.savedAiProfiles).filter(
      (profile) => profile.id !== normalizedProfileId
    );

    this.save({ savedAiProfiles: nextProfiles });
  }

  saveRepoSettings(input: DesktopRepoSettingsSaveInput): DesktopRepoSettings {
    const normalizedRepoPath = normalizePath(input?.repoPath);
    if (!normalizedRepoPath) {
      throw new Error("A repository path is required to save repo settings.");
    }

    const nextSettings = normalizeRepoSettings(input);
    const repoSettings = {
      ...(this.state.repoSettings ?? {}),
      [normalizedRepoPath]: nextSettings,
    };

    this.save({ repoSettings });
    return nextSettings;
  }

  getStatus(secretStatus: CredentialStatus): DesktopSettingsStatus {
    const aiRuntimeConfig = normalizeAiRuntimeConfig(this.state.aiRuntimeConfig);
    return {
      firstRunCompleted: this.state.firstRunCompleted,
      backendPort: this.state.backendPort,
      dataDir: this.state.dataDir,
      logDir: this.state.logDir,
      databaseUrlConfigured: Boolean(this.state.databaseUrl),
      aiRuntimeConfig,
      savedAiProfiles: normalizeSavedAiProfiles(this.state.savedAiProfiles),
      reviewSettings: this.getReviewSettings(),
      ai: {
        textGeneration: summarizeCapability(
          aiRuntimeConfig,
          secretStatus,
          "text_generation"
        ),
        embeddings: summarizeCapability(aiRuntimeConfig, secretStatus, "embeddings"),
      },
    };
  }
}

export { DesktopConfigStore };
