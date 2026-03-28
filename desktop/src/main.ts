import path = require("node:path");

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type OpenDialogOptions,
} from "electron";

import { BackendManager } from "./backend-manager";
import { DesktopConfigStore } from "./config-store";
import { findGitProjectRoot } from "./git-projects";
import { MacKeychainStore } from "./keychain";
import { ReviewRuntimeManager } from "./review-runtime";
import type { DesktopRepoSettings } from "./types";

const APP_NAME = "GitOdyssey";

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
let keychain: MacKeychainStore | null = null;
let backendManager: BackendManager | null = null;
let reviewRuntimeManager: ReviewRuntimeManager | null = null;

function requireConfigStore(): DesktopConfigStore {
  if (!configStore) {
    throw new Error("Desktop config store is not initialized.");
  }

  return configStore;
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
  repoSettings: DesktopRepoSettings | null | undefined = null
): URLSearchParams {
  const params = new URLSearchParams({ repo_path: repoPath });

  if (repoSettings?.maxCommits != null) {
    params.set("max_commits", String(repoSettings.maxCommits));
  }

  if (repoSettings?.contextLines != null) {
    params.set("context_lines", String(repoSettings.contextLines));
  }

  return params;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#020617",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

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

function registerIpcHandlers(): void {
  ipcMain.handle("git-odyssey:settings:get-status", async () => {
    return getSettingsStatus();
  });

  ipcMain.handle("git-odyssey:settings:get-repo-settings", async (_event, repoPath) => {
    return requireConfigStore().getRepoSettings(repoPath);
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
    return requireConfigStore().saveRepoSettings(input);
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

  ipcMain.handle("git-odyssey:api:get-repo", async (_event, repoPath, repoSettings) => {
    const project = requireConfigStore().recordRecentProject(repoPath);
    const params = buildRepoQueryParams(project.path, repoSettings);
    return requireBackendManager().request(`/api/repo?${params.toString()}`);
  });

  ipcMain.handle("git-odyssey:api:ingest-repo", async (_event, input) => {
    const project = requireConfigStore().recordRecentProject(input.repoPath);
    return requireBackendManager().request("/api/ingest", {
      method: "POST",
      body: {
        repo_path: project.path,
        max_commits: input.maxCommits,
        context_lines: input.contextLines,
        force: input.force ?? false,
      },
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
      const params = buildRepoQueryParams(project.path, repoSettings);
      return requireBackendManager().request(
        `/api/repo/commit/${commitSha}?${params.toString()}`
      );
    }
  );

  ipcMain.handle("git-odyssey:api:get-commits", async (_event, repoPath, repoSettings) => {
    const project = requireConfigStore().recordRecentProject(repoPath);
    const params = buildRepoQueryParams(project.path, repoSettings);
    return requireBackendManager().request(`/api/repo/commits?${params.toString()}`);
  });

  ipcMain.handle("git-odyssey:api:compare-review-target", async (_event, input) => {
    const project = requireConfigStore().recordRecentProject(input.repoPath);
    return requireBackendManager().request("/api/review/compare", {
      method: "POST",
      body: {
        repo_path: project.path,
        base_ref: input.baseRef,
        head_ref: input.headRef,
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
        base_ref: input.baseRef,
        head_ref: input.headRef,
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
        base_ref: input.baseRef,
        head_ref: input.headRef,
        context_lines: input.contextLines,
      },
    });
  });

  ipcMain.handle("git-odyssey:api:get-review-session", async (_event, sessionId) => {
    return requireBackendManager().request(`/api/review/sessions/${sessionId}`);
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

  configStore = new DesktopConfigStore({
    userDataPath: app.getPath("userData"),
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
    void reviewRuntimeManager?.dispose();
    void backendManager?.stop();
    app.quit();
  }
});

app.on("before-quit", () => {
  void reviewRuntimeManager?.dispose();
  void backendManager?.stop();
});
