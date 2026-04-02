import fs = require("node:fs");
import path = require("node:path");
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import type {
  DesktopConfigState,
  DesktopRepoSettings,
  RepoSyncProgressEvent,
} from "./types";

type WatcherHandle = {
  close(): void;
};

type WatchFactory = (
  targetPath: string,
  listener: (eventType: string, filename: string | Buffer | null) => void
) => WatcherHandle;

type BackendManagerLike = {
  request<T = unknown>(
    apiPath: string,
    options?: { method?: string; body?: unknown }
  ): Promise<T>;
};

type ConfigStoreLike = {
  getRepoSettings(repoPath: string): DesktopRepoSettings;
  getState(): DesktopConfigState;
};

type LoggerLike = Pick<Console, "warn" | "error">;

type RepoWatchState = {
  repoPath: string;
  gitDir: string;
  watchers: WatcherHandle[];
  debounceTimer: NodeJS.Timeout | null;
  inFlight: boolean;
  rerunRequested: boolean;
};

function defaultResolveGitDir(repoPath: string): string {
  return execFileSync(
    "git",
    ["-C", repoPath, "rev-parse", "--absolute-git-dir"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  ).trim();
}

class RepoSyncWatcher {
  #backendManager: BackendManagerLike;
  #configStore: ConfigStoreLike;
  #watchFactory: WatchFactory;
  #resolveGitDir: (repoPath: string) => string;
  #logger: LoggerLike;
  #emitRepoSyncEvent?: (payload: RepoSyncProgressEvent) => void;
  #states = new Map<string, RepoWatchState>();
  #debounceMs: number;

  constructor({
    backendManager,
    configStore,
    watchFactory = (targetPath, listener) => fs.watch(targetPath, listener),
    resolveGitDir = defaultResolveGitDir,
    logger = console,
    emitRepoSyncEvent,
    debounceMs = 600,
  }: {
    backendManager: BackendManagerLike;
    configStore: ConfigStoreLike;
    watchFactory?: WatchFactory;
    resolveGitDir?: (repoPath: string) => string;
    logger?: LoggerLike;
    emitRepoSyncEvent?: (payload: RepoSyncProgressEvent) => void;
    debounceMs?: number;
  }) {
    this.#backendManager = backendManager;
    this.#configStore = configStore;
    this.#watchFactory = watchFactory;
    this.#resolveGitDir = resolveGitDir;
    this.#logger = logger;
    this.#emitRepoSyncEvent = emitRepoSyncEvent;
    this.#debounceMs = debounceMs;
  }

  ensureWatching(repoPath: string): void {
    if (this.#states.has(repoPath)) {
      return;
    }

    let gitDir: string;
    try {
      gitDir = this.#resolveGitDir(repoPath);
    } catch (error) {
      this.#logger.warn(
        `Failed to resolve Git metadata directory for ${repoPath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return;
    }

    const watcherTargets = [
      gitDir,
      path.join(gitDir, "refs"),
      path.join(gitDir, "refs", "heads"),
    ].filter((targetPath, index, collection) => {
      return fs.existsSync(targetPath) && collection.indexOf(targetPath) === index;
    });

    const state: RepoWatchState = {
      repoPath,
      gitDir,
      watchers: [],
      debounceTimer: null,
      inFlight: false,
      rerunRequested: false,
    };

    for (const targetPath of watcherTargets) {
      try {
        state.watchers.push(
          this.#watchFactory(targetPath, (_eventType, filename) => {
            const relativeName = filename ? String(filename) : "";
            if (!this.#isRelevantGitPath(relativeName, targetPath, gitDir)) {
              return;
            }
            this.scheduleSync(repoPath);
          })
        );
      } catch (error) {
        this.#logger.warn(
          `Failed to watch ${targetPath} for ${repoPath}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    this.#states.set(repoPath, state);
  }

  scheduleSync(repoPath: string): void {
    const state = this.#states.get(repoPath);
    if (!state) {
      return;
    }

    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
    }
    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null;
      void this.#runSync(repoPath);
    }, this.#debounceMs);
  }

  triggerSync(repoPath: string): void {
    this.ensureWatching(repoPath);
    this.scheduleSync(repoPath);
  }

  closeAll(): void {
    for (const repoPath of Array.from(this.#states.keys())) {
      this.close(repoPath);
    }
  }

  close(repoPath: string): void {
    const state = this.#states.get(repoPath);
    if (!state) {
      return;
    }
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
    }
    for (const watcher of state.watchers) {
      watcher.close();
    }
    this.#states.delete(repoPath);
  }

  #isRelevantGitPath(relativeName: string, watchedPath: string, gitDir: string): boolean {
    if (watchedPath === gitDir) {
      return (
        relativeName === "HEAD" ||
        relativeName === "packed-refs" ||
        relativeName === "refs"
      );
    }
    if (watchedPath === path.join(gitDir, "refs")) {
      return relativeName === "heads";
    }
    return Boolean(relativeName);
  }

  async #runSync(repoPath: string): Promise<void> {
    const state = this.#states.get(repoPath);
    if (!state) {
      return;
    }

    if (state.inFlight) {
      state.rerunRequested = true;
      return;
    }

    state.inFlight = true;
    try {
      do {
        state.rerunRequested = false;
        const repoSettings = this.#configStore.getRepoSettings(repoPath);
        const progressId = randomUUID();
        let polling = true;

        const emitProgress = async () => {
          if (!this.#emitRepoSyncEvent) {
            return;
          }

          try {
            const payload = await this.#backendManager.request(
              `/api/ingest/progress/${progressId}`
            );
            this.#emitRepoSyncEvent(this.#mapRepoSyncPayload(payload as Record<string, unknown>));
          } catch (_error) {
            // Ignore missing progress snapshots until the ingest initializes them.
          }
        };

        const pollingPromise = (async () => {
          while (polling) {
            await emitProgress();
            if (!polling) {
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        })();

        try {
          await this.#backendManager.request("/api/ingest", {
            method: "POST",
            body: {
              repo_path: repoPath,
              max_commits: repoSettings.maxCommits,
              context_lines: repoSettings.contextLines,
              force: false,
              progress_id: progressId,
            },
          });
        } finally {
          polling = false;
          await pollingPromise;
          await emitProgress();
        }
      } while (state.rerunRequested);
    } catch (error) {
      this.#logger.error(
        `Background repo sync failed for ${repoPath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      state.inFlight = false;
    }
  }

  #mapRepoSyncPayload(payload: Record<string, unknown>): RepoSyncProgressEvent {
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
}

export { RepoSyncWatcher, defaultResolveGitDir };
