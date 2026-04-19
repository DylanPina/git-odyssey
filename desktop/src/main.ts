import os = require("node:os");
import path = require("node:path");

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type OpenDialogOptions,
} from "electron";

import { ReviewGuidelinesStore } from "./review-guidelines-store";
import { BackendManager } from "./backend-manager";
import { DesktopConfigStore } from "./config-store";
import { findGitProjectRoot, normalizePath } from "./git-projects";
import { MacKeychainStore } from "./keychain";
import { RepoSyncWatcher } from "./repo-sync-watcher";
import { ReviewRuntimeManager } from "./review-runtime";
import type {
  DesktopRepoSettings,
  RepoSyncProgressEvent,
} from "./types";
import { buildMainWindowOptions } from "./window-frame";

const APP_NAME = "GitOdyssey";
const DESKTOP_STATE_DIRNAME = ".git-odyssey";

type RendererEntry =
  | {
      type: "url";
      value: string;
    }
  | {
      type: "file";
      value: string;
    };

let mainWindow: BrowserWindow | null = null;
let configStore: DesktopConfigStore | null = null;
let reviewGuidelinesStore: ReviewGuidelinesStore | null = null;
let keychain: MacKeychainStore | null = null;
let backendManager: BackendManager | null = null;
let reviewRuntimeManager: ReviewRuntimeManager | null = null;
let repoSyncWatcher: RepoSyncWatcher | null = null;
const latestRepoSyncProgress = new Map<string, RepoSyncProgressEvent>();
type IngestJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
type IngestJobPayload = {
  job_id: string;
  repo_path: string;
  status: IngestJobStatus;
  result_repo_path?: string | null;
  error?: string | null;
  progress: Record<string, unknown>;
};

function requireConfigStore(): DesktopConfigStore {
  if (!configStore) {
    throw new Error("Desktop config store is not initialized.");
  }

  return configStore;
}

function requireReviewGuidelinesStore(): ReviewGuidelinesStore {
  if (!reviewGuidelinesStore) {
    throw new Error("Review guidelines store is not initialized.");
  }

  return reviewGuidelinesStore;
}

function requireKeychain(): MacKeychainStore {
  if (!keychain) {
    throw new Error("Desktop keychain is not initialized.");
  }

  return keychain;
}

function requireBackendManager(): BackendManager {
  if (!backendManager) {
    throw new Error("Desktop backend manager is not initialized.");
  }

  return backendManager;
}

function requireReviewRuntimeManager(): ReviewRuntimeManager {
  if (!reviewRuntimeManager) {
    throw new Error("Review runtime manager is not initialized.");
  }

  return reviewRuntimeManager;
}

function ensureRepoSyncWatcher(repoPath: string): void {
  if (!repoSyncWatcher) {
    return;
  }
  repoSyncWatcher.ensureWatching(repoPath);
}

function getRendererEntry(): RendererEntry {
  if (process.env.ELECTRON_RENDERER_URL) {
    return {
      type: "url",
      value: process.env.ELECTRON_RENDERER_URL,
    };
  }

  if (app.isPackaged) {
    return {
      type: "file",
      value: path.join(process.resourcesPath, "frontend", "index.html"),
    };
  }

  return {
    type: "file",
    value: path.resolve(__dirname, "..", "..", "frontend", "dist", "index.html"),
  };
}

async function getSettingsStatus() {
  const store = requireConfigStore();
  const desktopKeychain = requireKeychain();
  const secretStatus = await desktopKeychain.getCredentialStatus(
    store.getState().aiRuntimeConfig
  );
  return store.getStatus(secretStatus);
}

function buildRepoQueryParams(
  repoPath: string,
  repoSettings: DesktopRepoSettings | null | undefined = null,
  options?: { autoIngest?: boolean }
): URLSearchParams {
  const params = new URLSearchParams({ repo_path: repoPath });

  if (repoSettings?.maxCommits != null) {
    params.set("max_commits", String(repoSettings.maxCommits));
  }

  if (repoSettings?.contextLines != null) {
    params.set("context_lines", String(repoSettings.contextLines));
  }

  if (options?.autoIngest === false) {
    params.set("auto_ingest", "false");
  }

  return params;
}

function createWindow(): void {
  mainWindow = new BrowserWindow(
    buildMainWindowOptions(path.join(__dirname, "preload.js"))
  );

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const rendererEntry = getRendererEntry();
  if (rendererEntry.type === "url") {
    void mainWindow.loadURL(rendererEntry.value);
    if (process.env.ELECTRON_DEV === "1") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    void mainWindow.loadFile(rendererEntry.value);
  }
}

function broadcastReviewRuntimeEvent(payload: Record<string, unknown>): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("git-odyssey:review:event", payload);
  }
}

function broadcastRepoSyncEvent(payload: RepoSyncProgressEvent): void {
  const normalizedRepoPath = normalizePath(payload.repoPath);
  if (normalizedRepoPath) {
    latestRepoSyncProgress.set(normalizedRepoPath, payload);
  }
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("git-odyssey:repo-sync:event", payload);
  }
}

function mapRepoSyncPayload(payload: Record<string, unknown>): RepoSyncProgressEvent {
  return {
    progressId: String(payload.progress_id ?? ""),
    repoPath: String(payload.repo_path ?? ""),
    phase: String(payload.phase ?? "planning") as RepoSyncProgressEvent["phase"],
    label: String(payload.label ?? "Syncing repository"),
    percent: Number(payload.percent ?? 0),
    stagePercent: Number(payload.stage_percent ?? 0),
    completedUnits: Number(payload.completed_units ?? 0),
    totalUnits: Number(payload.total_units ?? 0),
    commitCount:
      payload.commit_count == null ? null : Number(payload.commit_count),
    fileChangeCount:
      payload.file_change_count == null ? null : Number(payload.file_change_count),
    hunkCount: payload.hunk_count == null ? null : Number(payload.hunk_count),
    embeddingBatches:
      payload.embedding_batches == null ? null : Number(payload.embedding_batches),
    insertedCommits:
      payload.inserted_commits == null ? null : Number(payload.inserted_commits),
    error: payload.error == null ? null : String(payload.error),
    startedAt: String(payload.started_at ?? new Date().toISOString()),
    updatedAt: String(payload.updated_at ?? new Date().toISOString()),
  };
}

function mapRepoSyncJobPayload(payload: IngestJobPayload): RepoSyncProgressEvent {
  return mapRepoSyncPayload(payload.progress);
}

function isRepoNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message === "Repository not found";
}

async function startIngestJob(
  repoPath: string,
  repoSettings: DesktopRepoSettings | null | undefined,
  force: boolean
): Promise<IngestJobPayload> {
  return requireBackendManager().request("/api/ingest/jobs", {
    method: "POST",
    body: {
      repo_path: repoPath,
      max_commits: repoSettings?.maxCommits,
      context_lines: repoSettings?.contextLines,
      force,
    },
  }) as Promise<IngestJobPayload>;
}

async function waitForIngestJob(jobId: string): Promise<IngestJobPayload> {
  while (true) {
    const job = (await requireBackendManager().request(
      `/api/ingest/jobs/${jobId}`
    )) as IngestJobPayload;
    broadcastRepoSyncEvent(mapRepoSyncJobPayload(job));

    if (job.status === "completed") {
      return job;
    }

    if (job.status === "failed") {
      throw new Error(job.error || "Repository sync failed");
    }

    if (job.status === "cancelled") {
      throw new Error("Repository sync was cancelled");
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function runIngestJobAndWait(
  repoPath: string,
  repoSettings: DesktopRepoSettings | null | undefined,
  force: boolean
): Promise<IngestJobPayload> {
  const job = await startIngestJob(repoPath, repoSettings, force);
  broadcastRepoSyncEvent(mapRepoSyncJobPayload(job));
  return waitForIngestJob(job.job_id);
}

async function ensureRepoIndexed(
  repoPath: string,
  repoSettings: DesktopRepoSettings | null | undefined
): Promise<void> {
  const params = buildRepoQueryParams(repoPath, repoSettings, { autoIngest: false });

  try {
    const repo = (await requireBackendManager().request(
      `/api/repo?${params.toString()}`
    )) as { reindex_required?: boolean };
    if (repo.reindex_required) {
      await runIngestJobAndWait(repoPath, repoSettings, false);
    }
  } catch (error) {
    if (!isRepoNotFoundError(error)) {
      throw error;
    }
    await runIngestJobAndWait(repoPath, repoSettings, false);
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle("git-odyssey:settings:get-status", async () => {
    return getSettingsStatus();
  });

  ipcMain.handle("git-odyssey:settings:get-repo-settings", async (_event, repoPath) => {
    return requireConfigStore().getRepoSettings(repoPath);
  });

  ipcMain.handle(
      "git-odyssey:settings:get-additional-review-guidelines",
      async (_event, repoPath) => {
      return requireReviewGuidelinesStore().get(repoPath);
    }
  );

  ipcMain.handle(
    "git-odyssey:settings:save-additional-review-guidelines",
    async (_event, input) => {
      return requireReviewGuidelinesStore().save(input);
    }
  );

  ipcMain.handle("git-odyssey:settings:save-review-settings", async (_event, input) => {
    return requireConfigStore().saveReviewSettings(input);
  });

  ipcMain.handle("git-odyssey:settings:validate-ai-config", async (_event, input) => {
    const savedSecrets = await requireKeychain().getSecrets(input.config);
    return requireBackendManager().request("/api/desktop/validate-ai-config", {
      method: "POST",
      body: {
        config: input.config,
        secret_values: {
          ...savedSecrets,
          ...input.secretValues,
        },
      },
    });
  });

  ipcMain.handle("git-odyssey:settings:save-ai-profile", async (_event, input) => {
    requireConfigStore().saveAiProfile(input);
    return getSettingsStatus();
  });

  ipcMain.handle("git-odyssey:settings:delete-ai-profile", async (_event, profileId) => {
    requireConfigStore().deleteAiProfile(profileId);
    return getSettingsStatus();
  });

  ipcMain.handle("git-odyssey:settings:save-ai-config", async (_event, input) => {
    await requireKeychain().saveAiConfig(input);
    requireConfigStore().save({
      firstRunCompleted: true,
      aiRuntimeConfig: input.config,
    });
    await requireBackendManager().restart();
    return getSettingsStatus();
  });

  ipcMain.handle("git-odyssey:settings:save-repo-settings", async (_event, input) => {
    const previousSettings = requireConfigStore().getRepoSettings(input.repoPath);
    const settings = requireConfigStore().saveRepoSettings(input);
    if (
      previousSettings.maxCommits !== settings.maxCommits ||
      previousSettings.contextLines !== settings.contextLines
    ) {
      repoSyncWatcher?.triggerSync(input.repoPath);
    }
    return settings;
  });

  ipcMain.handle("git-odyssey:health:get-status", async () => {
    return requireBackendManager().getHealth();
  });

  ipcMain.handle("git-odyssey:api:pick-git-project", async () => {
    const dialogOptions: OpenDialogOptions = {
      properties: ["openDirectory"],
      title: "Choose a Git Project",
    };
    const ownerWindow = mainWindow ?? BrowserWindow.getAllWindows()[0] ?? null;
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const repoPath = findGitProjectRoot(result.filePaths[0]);
    if (!repoPath) {
      throw new Error("The selected folder is not inside a Git repository.");
    }

    return requireConfigStore().recordRecentProject(repoPath);
  });

  ipcMain.handle("git-odyssey:api:get-recent-projects", async () => {
    return requireConfigStore().getRecentProjects();
  });

  ipcMain.handle("git-odyssey:api:get-repo-sync-progress", async (_event, repoPath) => {
    const normalizedRepoPath = normalizePath(repoPath);
    if (!normalizedRepoPath) {
      return null;
    }
    return latestRepoSyncProgress.get(normalizedRepoPath) ?? null;
  });

  ipcMain.handle("git-odyssey:api:delete-repo", async (_event, repoPath) => {
    const project = requireConfigStore().recordRecentProject(repoPath);
    repoSyncWatcher?.close(project.path);
    latestRepoSyncProgress.delete(project.path);
    const result = await requireBackendManager().request(
      `/api/repo?${new URLSearchParams({ repo_path: project.path }).toString()}`,
      {
        method: "DELETE",
      }
    );
    requireConfigStore().removeRecentProject(project.path);
    return result;
  });

  ipcMain.handle("git-odyssey:api:get-repo", async (_event, repoPath, repoSettings) => {
    const project = requireConfigStore().recordRecentProject(repoPath);
    ensureRepoSyncWatcher(project.path);
    await ensureRepoIndexed(project.path, repoSettings);
    const params = buildRepoQueryParams(project.path, repoSettings, {
      autoIngest: false,
    });
    return requireBackendManager().request(`/api/repo?${params.toString()}`);
  });

  ipcMain.handle("git-odyssey:api:ingest-repo", async (_event, input) => {
    const project = requireConfigStore().recordRecentProject(input.repoPath);
    ensureRepoSyncWatcher(project.path);
    await runIngestJobAndWait(
      project.path,
      {
        maxCommits: input.maxCommits,
        contextLines: input.contextLines,
        pullRequestGuidelines: "",
      },
      input.force ?? false
    );
    const params = buildRepoQueryParams(
      project.path,
      {
        maxCommits: input.maxCommits,
        contextLines: input.contextLines,
        pullRequestGuidelines: "",
      },
      { autoIngest: false }
    );
    return requireBackendManager().request(`/api/repo?${params.toString()}`, {
      method: "GET",
    });
  });

  ipcMain.handle("git-odyssey:api:filter-commits", async (_event, input) => {
    return requireBackendManager().request("/api/filter", {
      method: "POST",
      body: {
        query: input.query,
        filters: input.filters,
        repo_path: input.repoPath,
        max_results: input.maxResults,
      },
    });
  });

  ipcMain.handle("git-odyssey:api:summarize-commit", async (_event, sha) => {
    return requireBackendManager().request(`/api/summarize/commit/${sha}`);
  });

  ipcMain.handle("git-odyssey:api:summarize-file-change", async (_event, id) => {
    return requireBackendManager().request(`/api/summarize/file_change/${id}`);
  });

  ipcMain.handle("git-odyssey:api:summarize-hunk", async (_event, id) => {
    return requireBackendManager().request(`/api/summarize/hunk/${id}`);
  });

  ipcMain.handle("git-odyssey:api:send-chat-message", async (_event, input) => {
    return requireBackendManager().request("/api/chat", {
      method: "POST",
      body: {
        query: input.query,
        repo_path: input.repoPath,
        context_shas: input.contextShas,
      },
    });
  });

  ipcMain.handle(
    "git-odyssey:api:send-review-chat-message",
    async (_event, input) => {
      return requireReviewRuntimeManager().sendReviewChatMessage(input);
    }
  );

  ipcMain.handle("git-odyssey:api:init-database", async () => {
    return requireBackendManager().request("/api/admin/init", {
      method: "POST",
    });
  });

  ipcMain.handle("git-odyssey:api:drop-database", async () => {
    return requireBackendManager().request("/api/admin/drop", {
      method: "DELETE",
    });
  });

  ipcMain.handle(
    "git-odyssey:api:get-commit",
    async (_event, repoPath, commitSha, repoSettings) => {
      const project = requireConfigStore().recordRecentProject(repoPath);
      ensureRepoSyncWatcher(project.path);
      await ensureRepoIndexed(project.path, repoSettings);
      const params = buildRepoQueryParams(project.path, repoSettings, {
        autoIngest: false,
      });
      return requireBackendManager().request(
        `/api/repo/commit/${commitSha}?${params.toString()}`
      );
    }
  );

  ipcMain.handle("git-odyssey:api:get-commits", async (_event, repoPath, repoSettings) => {
    const project = requireConfigStore().recordRecentProject(repoPath);
    ensureRepoSyncWatcher(project.path);
    await ensureRepoIndexed(project.path, repoSettings);
    const params = buildRepoQueryParams(project.path, repoSettings, {
      autoIngest: false,
    });
    return requireBackendManager().request(`/api/repo/commits?${params.toString()}`);
  });

  ipcMain.handle("git-odyssey:api:compare-review-target", async (_event, input) => {
    const project = requireConfigStore().recordRecentProject(input.repoPath);
    return requireBackendManager().request("/api/review/compare", {
      method: "POST",
      body: {
        repo_path: project.path,
        target_mode: input.targetMode,
        base_ref: input.baseRef ?? "",
        head_ref: input.headRef ?? "",
        commit_sha: input.commitSha ?? null,
        context_lines: input.contextLines,
      },
    });
  });

  ipcMain.handle("git-odyssey:api:generate-review", async (_event, input) => {
    const project = requireConfigStore().recordRecentProject(input.repoPath);
    return requireBackendManager().request("/api/review/generate", {
      method: "POST",
      body: {
        repo_path: project.path,
        target_mode: input.targetMode,
        base_ref: input.baseRef ?? "",
        head_ref: input.headRef ?? "",
        commit_sha: input.commitSha ?? null,
        context_lines: input.contextLines,
      },
    });
  });

  ipcMain.handle("git-odyssey:api:create-review-session", async (_event, input) => {
    const project = requireConfigStore().recordRecentProject(input.repoPath);
    return requireBackendManager().request("/api/review/sessions", {
      method: "POST",
      body: {
        repo_path: project.path,
        target_mode: input.targetMode,
        base_ref: input.baseRef ?? "",
        head_ref: input.headRef ?? "",
        commit_sha: input.commitSha ?? null,
        context_lines: input.contextLines,
      },
    });
  });

  ipcMain.handle("git-odyssey:api:get-review-session", async (_event, sessionId) => {
    return requireBackendManager().request(`/api/review/sessions/${sessionId}`);
  });

  ipcMain.handle("git-odyssey:api:get-review-history", async (_event, input) => {
    const project = requireConfigStore().recordRecentProject(input.repoPath);
    const params = new URLSearchParams({
      repo_path: project.path,
      target_mode: input.targetMode,
    });
    if (input.baseRef) {
      params.set("base_ref", input.baseRef);
    }
    if (input.headRef) {
      params.set("head_ref", input.headRef);
    }
    if (input.commitSha) {
      params.set("commit_sha", input.commitSha);
    }
    return requireBackendManager().request(`/api/review/history?${params.toString()}`);
  });

  ipcMain.handle("git-odyssey:api:start-review-run", async (_event, input) => {
    return requireReviewRuntimeManager().startRun(input);
  });

  ipcMain.handle("git-odyssey:api:get-review-run", async (_event, input) => {
    return requireBackendManager().request(
      `/api/review/sessions/${input.sessionId}/runs/${input.runId}`
    );
  });

  ipcMain.handle("git-odyssey:api:cancel-review-run", async (_event, input) => {
    return requireReviewRuntimeManager().cancelRun(input);
  });

  ipcMain.handle("git-odyssey:api:respond-review-approval", async (_event, input) => {
    await requireReviewRuntimeManager().respondToApproval(input);
    return requireBackendManager().request(
      `/api/review/sessions/${input.sessionId}/runs/${input.runId}`
    );
  });

  ipcMain.handle("git-odyssey:api:get-current-user", async () => {
    return requireBackendManager().request("/api/auth/me");
  });

  ipcMain.handle("git-odyssey:api:logout", async () => {
    return requireBackendManager().request("/api/auth/logout", {
      method: "POST",
    });
  });
}

app.whenReady().then(async () => {
  app.setName(APP_NAME);
  const desktopRootPath = path.join(os.homedir(), DESKTOP_STATE_DIRNAME);

  configStore = new DesktopConfigStore({
    rootPath: desktopRootPath,
  });
  reviewGuidelinesStore = new ReviewGuidelinesStore({
    rootPath: desktopRootPath,
  });
  keychain = new MacKeychainStore({ serviceName: APP_NAME });
  try {
    await keychain.migrateLegacySecrets(configStore.getState().aiRuntimeConfig);
  } catch (error) {
    console.warn(
      "Failed to migrate legacy desktop AI secrets:",
      error instanceof Error ? error.message : error
    );
  }
  backendManager = new BackendManager({
    app,
    configStore,
    keychain,
  });
  repoSyncWatcher = new RepoSyncWatcher({
    backendManager,
    configStore,
    emitRepoSyncEvent: broadcastRepoSyncEvent,
  });
  reviewRuntimeManager = new ReviewRuntimeManager({
    app,
    backendManager,
    configStore,
    keychain,
  });
  reviewRuntimeManager.on("state-changed", (payload) => {
    broadcastReviewRuntimeEvent({
      type: "review-runtime-changed",
      ...payload,
    });
  });
  reviewRuntimeManager.on("log", (payload) => {
    broadcastReviewRuntimeEvent({
      type: "review-runtime-log",
      ...payload,
    });
  });

  registerIpcHandlers();
  createWindow();
  void backendManager.sync().catch((error) => {
    backendManager!.state = {
      state: "error",
      message:
        error instanceof Error
          ? error.message
          : "Failed to start the desktop backend.",
    };
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    repoSyncWatcher?.closeAll();
    void reviewRuntimeManager?.dispose();
    void backendManager?.stop();
    app.quit();
  }
});

app.on("before-quit", () => {
  repoSyncWatcher?.closeAll();
  void reviewRuntimeManager?.dispose();
  void backendManager?.stop();
});
