import fs = require("node:fs");
import path = require("node:path");

import type {
  CredentialStatus,
  DesktopConfigPatch,
  DesktopConfigState,
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
const DEFAULT_REPO_CONTEXT_LINES = 3;

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

class DesktopConfigStore {
  userDataPath: string;
  configPath: string;
  state: DesktopConfigState;

  constructor({ userDataPath }: { userDataPath: string }) {
    this.userDataPath = userDataPath;
    this.configPath = path.join(userDataPath, "desktop-config.json");
    this.state = this.#load();
  }

  #defaultState(): DesktopConfigState {
    const dataDir = path.join(this.userDataPath, "data");
    const logDir = path.join(this.userDataPath, "logs");

    return {
      backendPort: DEFAULT_BACKEND_PORT,
      databaseUrl:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@127.0.0.1:5432/gitodyssey",
      databaseSslMode: process.env.DATABASE_SSLMODE ?? "disable",
      dataDir,
      logDir,
      aiRuntimeConfig: buildDefaultAiRuntimeConfig(),
      firstRunCompleted: false,
      recentProjects: [],
      repoSettings: {},
    };
  }

  #ensureParentDirs(): void {
    fs.mkdirSync(this.userDataPath, { recursive: true });
    fs.mkdirSync(path.join(this.userDataPath, "data"), { recursive: true });
    fs.mkdirSync(path.join(this.userDataPath, "logs"), { recursive: true });
  }

  #load(): DesktopConfigState {
    this.#ensureParentDirs();
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

  getRepoSettings(repoPath: string): DesktopRepoSettings {
    const normalizedRepoPath = normalizePath(repoPath);
    if (!normalizedRepoPath) {
      return normalizeRepoSettings();
    }

    return normalizeRepoSettings(this.state.repoSettings?.[normalizedRepoPath]);
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
