const fs = require("fs");
const path = require("path");
const { once } = require("events");
const { spawn } = require("child_process");

class BackendManager {
  constructor({ app, configStore, keychain }) {
    this.app = app;
    this.configStore = configStore;
    this.keychain = keychain;
    this.process = null;
    this.startPromise = null;
    this.intentionalStop = false;
    this.state = {
      state: "stopped",
      message:
        "Configure AI providers to enable chat, summaries, and semantic search.",
    };
  }

  getBackendUrl() {
    const { backendPort } = this.configStore.getState();
    return `http://127.0.0.1:${backendPort}`;
  }

  #getDevelopmentPythonCommand() {
    if (process.env.PYTHON_EXECUTABLE) {
      return process.env.PYTHON_EXECUTABLE;
    }

    const activatedEnvCandidates = [
      process.env.VIRTUAL_ENV
        ? path.join(process.env.VIRTUAL_ENV, "bin", "python3")
        : null,
      process.env.VIRTUAL_ENV
        ? path.join(process.env.VIRTUAL_ENV, "bin", "python")
        : null,
      process.env.CONDA_PREFIX
        ? path.join(process.env.CONDA_PREFIX, "bin", "python3")
        : null,
      process.env.CONDA_PREFIX
        ? path.join(process.env.CONDA_PREFIX, "bin", "python")
        : null,
    ].filter(Boolean);

    const activatedEnvPython = activatedEnvCandidates.find((candidate) =>
      fs.existsSync(candidate)
    );
    if (activatedEnvPython) {
      return activatedEnvPython;
    }

    const repoRoot = path.resolve(__dirname, "..", "..");
    const candidates = [
      path.join(repoRoot, ".venv", "bin", "python3"),
      path.join(repoRoot, ".venv", "bin", "python"),
      path.join(repoRoot, "backend", ".venv", "bin", "python3"),
      path.join(repoRoot, "backend", ".venv", "bin", "python"),
    ];

    const resolvedCandidate = candidates.find((candidate) => fs.existsSync(candidate));
    if (resolvedCandidate) {
      return resolvedCandidate;
    }

    return "python3";
  }

  #getBackendEntry() {
    if (!this.app.isPackaged) {
      return {
        command: this.#getDevelopmentPythonCommand(),
        args: [path.resolve(__dirname, "..", "..", "backend", "src", "main.py")],
      };
    }

    const bundledBinary = path.join(
      process.resourcesPath,
      "backend",
      "gitodyssey-backend"
    );

    return {
      command: bundledBinary,
      args: [],
    };
  }

  #appendLog(chunk, streamName) {
    const { logDir } = this.configStore.getState();
    fs.mkdirSync(logDir, { recursive: true });
    const payload = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    fs.appendFileSync(
      path.join(logDir, "backend.log"),
      `[${new Date().toISOString()}] [${streamName}] ${payload}`
    );
  }

  async #waitForHealth(timeoutMs = 10000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      try {
        const response = await fetch(`${this.getBackendUrl()}/api/desktop/health`);
        if (response.ok) {
          return true;
        }
      } catch (_error) {
        // The backend is still starting.
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return false;
  }

  async #fetchDesktopHealthPayload() {
    const response = await fetch(`${this.getBackendUrl()}/api/desktop/health`);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  #mapCapabilityHealth(capability) {
    if (!capability) {
      return null;
    }

    return {
      configured: Boolean(capability.configured),
      ready: Boolean(capability.ready),
      providerType: capability.provider_type ?? null,
      modelId: capability.model_id ?? null,
      baseUrl: capability.base_url ?? null,
      authMode: capability.auth_mode ?? null,
      secretPresent: Boolean(capability.secret_present),
      message: capability.message ?? undefined,
      reindexRequired: Boolean(capability.reindex_required),
    };
  }

  async sync() {
    const config = this.configStore.getState();

    if (!config.databaseUrl) {
      await this.stop();
      this.state = {
        state: "error",
        message:
          "DATABASE_URL is not configured. Bundled PostgreSQL initialization is still pending in the desktop shell.",
      };
      return;
    }

    if (
      this.process &&
      (this.state.state === "running" || this.state.state === "starting")
    ) {
      if (this.startPromise) {
        await this.startPromise;
      }
      return;
    }

    this.startPromise = this.start(config);
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async start(config) {
    await this.stop();
    this.intentionalStop = false;
    this.state = {
      state: "starting",
      message: "Starting the FastAPI desktop sidecar...",
    };

    const backendEntry = this.#getBackendEntry();
    if (this.app.isPackaged && !fs.existsSync(backendEntry.command)) {
      this.state = {
        state: "error",
        message:
          "The packaged FastAPI sidecar was not found. Build the backend sidecar before packaging the desktop app.",
      };
      return;
    }

    this.#appendLog(
      `Launching backend with command: ${backendEntry.command} ${backendEntry.args.join(" ") || ""}\n`,
      "manager"
    );

    const secretValues = await this.keychain.getSecrets(config.aiRuntimeConfig);
    this.process = spawn(backendEntry.command, backendEntry.args, {
      env: {
        ...process.env,
        PORT: String(config.backendPort),
        DATABASE_URL: config.databaseUrl,
        DATABASE_SSLMODE: config.databaseSslMode,
        AI_RUNTIME_CONFIG_JSON: JSON.stringify(config.aiRuntimeConfig),
        AI_SECRET_VALUES_JSON: JSON.stringify(secretValues),
        PYTHONUNBUFFERED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.process.stdout?.on("data", (chunk) => this.#appendLog(chunk, "stdout"));
    this.process.stderr?.on("data", (chunk) => this.#appendLog(chunk, "stderr"));
    this.process.on("error", (error) => {
      this.#appendLog(error.stack || error.message, "error");
      this.state = {
        state: "error",
        message: error.message,
      };
    });
    this.process.on("exit", (code, signal) => {
      this.process = null;
      if (this.intentionalStop) {
        this.state = {
          state: "stopped",
          message: "Desktop backend stopped.",
        };
        return;
      }

      this.state = {
        state: "error",
        message: `Desktop backend exited unexpectedly (code ${code ?? "unknown"}, signal ${signal ?? "none"}).`,
      };
    });

    const healthy = await this.#waitForHealth();
    if (!healthy) {
      await this.stop();
      this.state = {
        state: "error",
        message:
          "The FastAPI desktop sidecar did not become healthy in time. Check the desktop backend log for details.",
      };
      return;
    }

    this.state = {
      state: "running",
      message: "Desktop backend is running.",
      url: this.getBackendUrl(),
    };
  }

  async restart() {
    await this.stop();
    await this.sync();
  }

  async stop() {
    if (!this.process) {
      return;
    }

    const processRef = this.process;
    this.intentionalStop = true;
    const exitPromise =
      processRef.exitCode === null ? once(processRef, "exit") : Promise.resolve();
    processRef.kill();
    try {
      await exitPromise;
    } catch (_error) {
      // Ignore shutdown races.
    } finally {
      this.process = null;
    }
  }

  async request(apiPath, options = {}) {
    await this.sync();
    if (this.state.state !== "running") {
      throw new Error(
        this.state.message || "The desktop backend is not running yet."
      );
    }

    const response = await fetch(`${this.getBackendUrl()}${apiPath}`, {
      method: options.method ?? "GET",
      headers: options.body
        ? {
            "Content-Type": "application/json",
          }
        : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const contentType = response.headers.get("content-type") || "";

    if (!response.ok) {
      let detail = `${response.status} ${response.statusText}`;
      if (contentType.includes("application/json")) {
        const payload = await response.json().catch(() => null);
        detail = payload?.detail ?? JSON.stringify(payload) ?? detail;
      } else {
        const text = await response.text();
        if (text) {
          detail = text;
        }
      }

      throw new Error(detail);
    }

    if (contentType.includes("application/json")) {
      return response.json();
    }

    return response.text();
  }

  async getHealth() {
    const config = this.configStore.getState();
    const credentialStatus = await this.keychain.getCredentialStatus(
      config.aiRuntimeConfig
    );
    const settingsStatus = this.configStore.getStatus(credentialStatus);
    let backendPayload = null;

    if (this.state.state === "running") {
      try {
        backendPayload = await this.#fetchDesktopHealthPayload();
      } catch (_error) {
        backendPayload = null;
      }
    }

    return {
      backend: {
        ...this.state,
        url: this.getBackendUrl(),
      },
      postgres: {
        state: "unavailable",
        message: settingsStatus.databaseUrlConfigured
          ? "Development mode uses the configured local PostgreSQL instance. Start `docker compose up -d db` if it is not already running."
          : "No local PostgreSQL connection is configured yet.",
      },
      authentication: {
        ready: Boolean(backendPayload?.authentication?.desktop_backend_reachable),
        desktopBackendReachable: Boolean(
          backendPayload?.authentication?.desktop_backend_reachable
        ),
        desktopUserAvailable: Boolean(
          backendPayload?.authentication?.desktop_user_available
        ),
      },
      ai:
        backendPayload?.ai != null
          ? {
              textGeneration: this.#mapCapabilityHealth(
                backendPayload.ai.text_generation
              ),
              embeddings: this.#mapCapabilityHealth(backendPayload.ai.embeddings),
            }
          : settingsStatus.ai,
      desktopUser: backendPayload?.desktop_user
        ? {
            id: backendPayload.desktop_user.id,
            username: backendPayload.desktop_user.username,
            email: backendPayload.desktop_user.email,
          }
        : null,
      credentials: credentialStatus,
      settings: settingsStatus,
    };
  }
}

module.exports = {
  BackendManager,
};
