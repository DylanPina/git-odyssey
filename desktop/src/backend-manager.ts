import fs = require("node:fs");
import path = require("node:path");
import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { once } from "node:events";

import type {
  AICapabilityStatus,
  BackendCapabilityPayload,
  BackendDesktopHealthPayload,
  CredentialStatus,
  DesktopConfigState,
  DesktopHealthStatus,
  DesktopServiceHealth,
  DesktopSettingsStatus,
} from "./types";

const BACKEND_STARTUP_TIMEOUT_MESSAGE =
  "The FastAPI desktop sidecar did not become healthy in time. Check the desktop backend log for details.";

type StartupFailure = {
  kind: "postgres" | "backend";
  backendMessage: string;
  postgresMessage: string | null;
};

type BackendEntry = {
  command: string;
  args: string[];
};

type BackendRequestOptions = {
  method?: string;
  body?: unknown;
};

type AppLike = {
  isPackaged: boolean;
};

type ConfigStoreLike = {
  getState(): DesktopConfigState;
  getStatus(secretStatus: CredentialStatus): DesktopSettingsStatus;
};

type KeychainLike = {
  getSecrets(aiRuntimeConfig: DesktopConfigState["aiRuntimeConfig"]): Promise<Record<string, string>>;
  getCredentialStatus(
    aiRuntimeConfig: DesktopConfigState["aiRuntimeConfig"]
  ): Promise<CredentialStatus>;
};

class BackendManager {
  app: AppLike;
  configStore: ConfigStoreLike;
  keychain: KeychainLike;
  process: ChildProcessWithoutNullStreams | null;
  startPromise: Promise<void> | null;
  intentionalStop: boolean;
  lastStartupFailure: StartupFailure | null;
  state: DesktopServiceHealth;

  constructor({
    app,
    configStore,
    keychain,
  }: {
    app: AppLike;
    configStore: ConfigStoreLike;
    keychain: KeychainLike;
  }) {
    this.app = app;
    this.configStore = configStore;
    this.keychain = keychain;
    this.process = null;
    this.startPromise = null;
    this.intentionalStop = false;
    this.lastStartupFailure = null;
    this.state = {
      state: "stopped",
      message:
        "Configure AI providers to enable chat, summaries, and semantic search.",
    };
  }

  getBackendUrl(): string {
    const { backendPort } = this.configStore.getState();
    return `http://127.0.0.1:${backendPort}`;
  }

  #getDevelopmentPythonCommand(): string {
    if (process.env.PYTHON_EXECUTABLE) {
      return process.env.PYTHON_EXECUTABLE;
    }

    const activatedEnvCandidates: string[] = [
      process.env.VIRTUAL_ENV
        ? path.join(process.env.VIRTUAL_ENV, "bin", "python3")
        : null,
      process.env.VIRTUAL_ENV
        ? path.join(process.env.VIRTUAL_ENV, "bin", "python")
        : null,
    ].filter((candidate): candidate is string => Boolean(candidate));

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

  #getBackendEntry(): BackendEntry {
    if (!this.app.isPackaged) {
      return {
        command: this.#getDevelopmentPythonCommand(),
        args: [path.resolve(__dirname, "..", "..", "backend", "src", "main.py")],
      };
    }

    const resourcesPath =
      (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ?? "";
    const bundledBinary = path.join(resourcesPath, "backend", "gitodyssey-backend");

    return {
      command: bundledBinary,
      args: [],
    };
  }

  #getBackendLogPath(): string {
    const { logDir } = this.configStore.getState();
    return path.join(logDir, "backend.log");
  }

  #appendLog(chunk: string | Buffer, streamName: string): void {
    const { logDir } = this.configStore.getState();
    fs.mkdirSync(logDir, { recursive: true });
    const payload = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    fs.appendFileSync(
      this.#getBackendLogPath(),
      `[${new Date().toISOString()}] [${streamName}] ${payload}`
    );
  }

  #readRecentBackendLog(maxBytes = 16 * 1024): string {
    const logPath = this.#getBackendLogPath();
    if (!fs.existsSync(logPath)) {
      return "";
    }

    try {
      const stats = fs.statSync(logPath);
      const start = Math.max(0, stats.size - maxBytes);
      const buffer = Buffer.alloc(stats.size - start);
      const fd = fs.openSync(logPath, "r");

      try {
        fs.readSync(fd, buffer, 0, buffer.length, start);
      } finally {
        fs.closeSync(fd);
      }

      return buffer.toString("utf8");
    } catch (_error) {
      try {
        return fs.readFileSync(logPath, "utf8");
      } catch (_nestedError) {
        return "";
      }
    }
  }

  #stripLogPrefix(line: string): string {
    return line.replace(/^\[[^\]]+\]\s+\[[^\]]+\]\s*/, "").trim();
  }

  #getLastRelevantLogLine(logText: string): string | null {
    const ignoredPatterns = [
      /^INFO:\s+/,
      /^ERROR:\s+Traceback/,
      /^ERROR:\s+Application startup failed\. Exiting\./,
      /^Traceback /,
      /^The above exception was the direct cause of the following exception:/,
      /^\(Background on this error at:/,
      /^File "/,
      /^\^$/,
    ];

    const lines = logText
      .split(/\r?\n/)
      .map((line) => this.#stripLogPrefix(line))
      .filter(Boolean);

    return (
      [...lines]
        .reverse()
        .find((line) => !ignoredPatterns.some((pattern) => pattern.test(line))) ??
      null
    );
  }

  #getDatabaseTarget(): string | null {
    const { databaseUrl } = this.configStore.getState();
    if (!databaseUrl) {
      return null;
    }

    try {
      const parsedUrl = new URL(databaseUrl);
      return `${parsedUrl.hostname}:${parsedUrl.port || "5432"}`;
    } catch (_error) {
      return null;
    }
  }

  #buildPgvectorStartupFailure(messageOverride?: {
    backendMessage?: string;
    postgresMessage?: string;
  }): StartupFailure {
    return {
      kind: "postgres",
      backendMessage:
        messageOverride?.backendMessage ??
        "The FastAPI desktop sidecar connected to PostgreSQL, but it could not enable the required pgvector extension. Use the provided `pgvector/pgvector:pg16` development database or install and enable pgvector in your custom instance.",
      postgresMessage:
        messageOverride?.postgresMessage ??
        "PostgreSQL is running, but GitOdyssey could not enable the required pgvector extension. Use the provided `pgvector/pgvector:pg16` development database or install and enable pgvector in your custom instance.",
    };
  }

  #summarizeStartupFailure(): StartupFailure | null {
    const logText = this.#readRecentBackendLog();
    if (!logText) {
      return null;
    }

    const connectionRefusedMatch = logText.match(
      /connection to server at "([^"]+)", port (\d+) failed: Connection refused/i
    );
    if (connectionRefusedMatch) {
      const target = `${connectionRefusedMatch[1]}:${connectionRefusedMatch[2]}`;
      return {
        kind: "postgres",
        backendMessage:
          `The FastAPI desktop sidecar could not connect to PostgreSQL at ${target}. Start Docker Desktop and run \`docker compose up -d db\`, or update DATABASE_URL if you use another instance.`,
        postgresMessage:
          `PostgreSQL is not reachable at ${target}. Start Docker Desktop and run \`docker compose up -d db\`, or point GitOdyssey at an already-running PostgreSQL instance.`,
      };
    }

    const authenticationFailureMatch = logText.match(
      /password authentication failed for user "([^"]+)"/i
    );
    if (authenticationFailureMatch) {
      const target = this.#getDatabaseTarget() ?? "the configured PostgreSQL instance";
      const username = authenticationFailureMatch[1];
      return {
        kind: "postgres",
        backendMessage:
          `The FastAPI desktop sidecar could not authenticate to PostgreSQL at ${target} as ${username}. Update DATABASE_URL or start the local development database with the default credentials.`,
        postgresMessage:
          `PostgreSQL rejected the configured credentials for ${username}. Update DATABASE_URL or restart the local development database with the default credentials.`,
      };
    }

    const missingDatabaseMatch = logText.match(/database "([^"]+)" does not exist/i);
    if (missingDatabaseMatch) {
      const target = this.#getDatabaseTarget() ?? "the configured PostgreSQL instance";
      const databaseName = missingDatabaseMatch[1];
      return {
        kind: "postgres",
        backendMessage:
          `The FastAPI desktop sidecar reached PostgreSQL at ${target}, but the database "${databaseName}" does not exist. Start the local development database or update DATABASE_URL.`,
        postgresMessage:
          `The configured PostgreSQL instance is missing the "${databaseName}" database. Start the local development database or create the database before retrying.`,
      };
    }

    if (/extension "vector" is not available/i.test(logText)) {
      return this.#buildPgvectorStartupFailure({
        backendMessage:
          "The FastAPI desktop sidecar connected to PostgreSQL, but the pgvector extension is unavailable. Use the provided `pgvector/pgvector:pg16` development database or install the extension in your custom instance.",
        postgresMessage:
          "PostgreSQL is running, but pgvector is not installed. Use the provided `pgvector/pgvector:pg16` development database or install the extension in your custom instance.",
      });
    }

    if (/permission denied to create extension "vector"/i.test(logText)) {
      return this.#buildPgvectorStartupFailure({
        backendMessage:
          "The FastAPI desktop sidecar connected to PostgreSQL, but the configured user cannot create the pgvector extension. Grant the required privileges or use the local development database container.",
        postgresMessage:
          "PostgreSQL is running, but the configured user cannot create the pgvector extension. Grant the required privileges or use the local development database container.",
      });
    }

    if (
      /\[SQL:\s*CREATE EXTENSION IF NOT EXISTS vector\]/i.test(logText) ||
      /could not open extension control file .*vector\.control/i.test(logText) ||
      /type "vector" does not exist/i.test(logText)
    ) {
      return this.#buildPgvectorStartupFailure();
    }

    const lastRelevantLine = this.#getLastRelevantLogLine(logText);
    if (!lastRelevantLine) {
      return null;
    }

    return {
      kind: "backend",
      backendMessage: lastRelevantLine,
      postgresMessage: null,
    };
  }

  #getPostgresHealth(
    settingsStatus: DesktopSettingsStatus,
    startupFailure: StartupFailure | null
  ): DesktopServiceHealth {
    if (!settingsStatus.databaseUrlConfigured) {
      return {
        state: "unavailable",
        message: "No local PostgreSQL connection is configured yet.",
      };
    }

    if (this.state.state === "running") {
      return {
        state: "running",
        message: "Connected to the configured PostgreSQL instance.",
      };
    }

    if (this.state.state === "starting") {
      return {
        state: "starting",
        message: "Connecting to the configured PostgreSQL instance...",
      };
    }

    if (startupFailure?.kind === "postgres" && startupFailure.postgresMessage) {
      return {
        state: "error",
        message: startupFailure.postgresMessage,
      };
    }

    return {
      state: "unavailable",
      message:
        "Development mode uses the configured local PostgreSQL instance. Start `docker compose up -d db` if it is not already running.",
    };
  }

  async #waitForHealth(timeoutMs = 10000): Promise<boolean> {
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

  async #fetchDesktopHealthPayload(): Promise<BackendDesktopHealthPayload> {
    const response = await fetch(`${this.getBackendUrl()}/api/desktop/health`);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return (await response.json()) as BackendDesktopHealthPayload;
  }

  #mapCapabilityHealth(
    capability: BackendCapabilityPayload | null | undefined
  ): AICapabilityStatus {
    if (!capability) {
      return {
        configured: false,
        ready: false,
        providerType: null,
        modelId: null,
        baseUrl: null,
        authMode: null,
        secretPresent: false,
      };
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

  async sync(): Promise<void> {
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

  async start(config: DesktopConfigState): Promise<void> {
    await this.stop();
    this.intentionalStop = false;
    this.lastStartupFailure = null;
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
    const child = spawn(backendEntry.command, backendEntry.args, {
      env: {
        ...process.env,
        PORT: String(config.backendPort),
        DATABASE_URL: config.databaseUrl ?? "",
        DATABASE_SSLMODE: config.databaseSslMode,
        AI_RUNTIME_CONFIG_JSON: JSON.stringify(config.aiRuntimeConfig),
        AI_SECRET_VALUES_JSON: JSON.stringify(secretValues),
        PYTHONUNBUFFERED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }) as unknown as ChildProcessWithoutNullStreams;
    this.process = child;

    child.stdout.on("data", (chunk) => this.#appendLog(chunk, "stdout"));
    child.stderr.on("data", (chunk) => this.#appendLog(chunk, "stderr"));
    child.on("error", (error) => {
      this.#appendLog(error.stack || error.message, "error");
      const startupFailure = this.#summarizeStartupFailure();
      this.lastStartupFailure = startupFailure;
      this.state = {
        state: "error",
        message: startupFailure?.backendMessage ?? error.message,
      };
    });
    child.on("exit", (code, signal) => {
      this.process = null;
      if (this.intentionalStop) {
        this.state = {
          state: "stopped",
          message: "Desktop backend stopped.",
        };
        return;
      }

      const startupFailure = this.#summarizeStartupFailure();
      this.lastStartupFailure = startupFailure;
      this.state = {
        state: "error",
        message:
          startupFailure?.backendMessage ??
          `Desktop backend exited unexpectedly (code ${code ?? "unknown"}, signal ${signal ?? "none"}).`,
      };
    });

    const healthy = await this.#waitForHealth();
    if (!healthy) {
      const fallbackMessage =
        this.state.state === "error" && this.state.message
          ? this.state.message
          : BACKEND_STARTUP_TIMEOUT_MESSAGE;
      const startupFailure = this.#summarizeStartupFailure();
      this.lastStartupFailure = startupFailure;
      await this.stop();
      this.state = {
        state: "error",
        message: startupFailure?.backendMessage ?? fallbackMessage,
      };
      return;
    }

    this.lastStartupFailure = null;
    this.state = {
      state: "running",
      message: "Desktop backend is running.",
      url: this.getBackendUrl(),
    };
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.sync();
  }

  async stop(): Promise<void> {
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

  async request<T = unknown>(
    apiPath: string,
    options: BackendRequestOptions = {}
  ): Promise<T> {
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
        const payload = (await response.json().catch(() => null)) as
          | { detail?: string }
          | null;
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
      return (await response.json()) as T;
    }

    return (await response.text()) as T;
  }

  async getHealth(): Promise<DesktopHealthStatus> {
    const config = this.configStore.getState();
    const credentialStatus = await this.keychain.getCredentialStatus(
      config.aiRuntimeConfig
    );
    const settingsStatus = this.configStore.getStatus(credentialStatus);
    const startupFailure =
      this.state.state === "error"
        ? this.lastStartupFailure ?? this.#summarizeStartupFailure()
        : null;
    let backendPayload: BackendDesktopHealthPayload | null = null;

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
        message: startupFailure?.backendMessage ?? this.state.message,
        url: this.getBackendUrl(),
      },
      postgres: this.#getPostgresHealth(settingsStatus, startupFailure),
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

export { BackendManager };
