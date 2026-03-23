const fs = require("fs");
const path = require("path");
const {
  buildDefaultAiRuntimeConfig,
  normalizeAiRuntimeConfig,
  summarizeCapability,
} = require("./ai-config");
const {
  dedupeRecentProjects,
  normalizePath,
  toGitProjectSummary,
} = require("./git-projects");

const DEFAULT_BACKEND_PORT = Number(
  process.env.GITODYSSEY_BACKEND_PORT ?? "48120"
);
const DEFAULT_REPO_MAX_COMMITS = 50;
const DEFAULT_REPO_CONTEXT_LINES = 3;
const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/gitodyssey";
const DEFAULT_DATABASE_SSLMODE = "disable";

function getOptionalEnv(name) {
  const value = process.env[name];
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeRepoSettings(rawSettings) {
  const settings =
    rawSettings && typeof rawSettings === "object" ? rawSettings : {};

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

function normalizeRepoSettingsMap(rawRepoSettings) {
  const repoSettings =
    rawRepoSettings && typeof rawRepoSettings === "object" ? rawRepoSettings : {};
  const normalizedEntries = {};

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
  constructor({ userDataPath }) {
    this.userDataPath = userDataPath;
    this.configPath = path.join(userDataPath, "desktop-config.json");
    this.state = this.#load();
  }

  #defaultState() {
    const dataDir = path.join(this.userDataPath, "data");
    const logDir = path.join(this.userDataPath, "logs");

    return {
      backendPort: DEFAULT_BACKEND_PORT,
      databaseUrl: getOptionalEnv("DATABASE_URL") ?? DEFAULT_DATABASE_URL,
      databaseSslMode:
        getOptionalEnv("DATABASE_SSLMODE") ?? DEFAULT_DATABASE_SSLMODE,
      dataDir,
      logDir,
      aiRuntimeConfig: buildDefaultAiRuntimeConfig(),
      firstRunCompleted: false,
      recentProjects: [],
      repoSettings: {},
    };
  }

  #ensureParentDirs() {
    fs.mkdirSync(this.userDataPath, { recursive: true });
    fs.mkdirSync(path.join(this.userDataPath, "data"), { recursive: true });
    fs.mkdirSync(path.join(this.userDataPath, "logs"), { recursive: true });
  }

  #load() {
    this.#ensureParentDirs();
    const defaults = this.#defaultState();

    if (!fs.existsSync(this.configPath)) {
      fs.writeFileSync(this.configPath, JSON.stringify(defaults, null, 2));
      return defaults;
    }

    try {
      const raw = fs.readFileSync(this.configPath, "utf8");
      const parsed = JSON.parse(raw);
      const merged = {
        ...defaults,
        ...parsed,
        databaseUrl:
          getOptionalEnv("DATABASE_URL") ?? parsed.databaseUrl ?? defaults.databaseUrl,
        databaseSslMode:
          getOptionalEnv("DATABASE_SSLMODE") ??
          parsed.databaseSslMode ??
          defaults.databaseSslMode,
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
      const recovered = {
        ...defaults,
        recoveryMessage:
          error instanceof Error ? error.message : "Failed to parse desktop config.",
      };
      fs.writeFileSync(this.configPath, JSON.stringify(recovered, null, 2));
      return recovered;
    }
  }

  getState() {
    return { ...this.state };
  }

  save(partial) {
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
      JSON.stringify(recentProjects) !==
      JSON.stringify(this.state.recentProjects ?? [])
    ) {
      this.save({ recentProjects });
    }
    return recentProjects;
  }

  recordRecentProject(projectPath) {
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

  getRepoSettings(repoPath) {
    const normalizedRepoPath = normalizePath(repoPath);
    if (!normalizedRepoPath) {
      return normalizeRepoSettings();
    }

    return normalizeRepoSettings(this.state.repoSettings?.[normalizedRepoPath]);
  }

  saveRepoSettings(input) {
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

  getStatus(secretStatus) {
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
        embeddings: summarizeCapability(
          aiRuntimeConfig,
          secretStatus,
          "embeddings"
        ),
      },
    };
  }
}

module.exports = {
  DesktopConfigStore,
};
