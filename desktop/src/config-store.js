const fs = require("fs");
const path = require("path");
const {
  buildDefaultAiRuntimeConfig,
  normalizeAiRuntimeConfig,
  summarizeCapability,
} = require("./ai-config");
const {
  dedupeRecentProjects,
  toGitProjectSummary,
} = require("./git-projects");

const DEFAULT_BACKEND_PORT = Number(
  process.env.GITODYSSEY_BACKEND_PORT ?? "48120"
);

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
      databaseUrl:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@127.0.0.1:5432/gitodyssey",
      databaseSslMode: process.env.DATABASE_SSLMODE ?? "disable",
      dataDir,
      logDir,
      aiRuntimeConfig: buildDefaultAiRuntimeConfig(),
      firstRunCompleted: false,
      recentProjects: [],
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
        aiRuntimeConfig: normalizeAiRuntimeConfig(
          parsed.aiRuntimeConfig ?? defaults.aiRuntimeConfig
        ),
        recentProjects: dedupeRecentProjects(parsed.recentProjects ?? []),
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
