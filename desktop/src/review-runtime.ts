import { EventEmitter } from "node:events";

import type { BackendManager } from "./backend-manager";
import type { DesktopConfigStore } from "./config-store";
import type { MacKeychainStore } from "./keychain";
import type {
  ReviewApprovalDecision,
  ReviewChatRequestInput,
  ReviewChatResponse,
} from "./types";

type AppLike = {
  getVersion?: () => string;
};

type ReviewRuntimeStartInput = {
  sessionId?: string | null;
  customInstructions?: string | null;
};

type ReviewRuntimeCancelInput = {
  sessionId?: string | null;
  runId?: string | null;
};

type ReviewRuntimeApprovalInput = ReviewRuntimeCancelInput & {
  approvalId?: string | null;
  decision: ReviewApprovalDecision;
};

type ReviewSessionPayload = {
  id: string;
  repo_path: string;
  target_mode?: "compare" | "commit";
  base_ref: string;
  head_ref: string;
  commit_sha?: string | null;
  context_lines?: number | null;
};

type ReviewRunPayload = {
  id: string;
};

type RunState = {
  sessionId: string;
  runId: string;
  repoPath: string;
  cancelRequested: boolean;
  completed: boolean;
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeInstructionText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (value == null) {
    return "";
  }
  return String(value).trim();
}

function sanitizeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

class ReviewRuntimeManager extends EventEmitter {
  app: AppLike;
  backendManager: BackendManager;
  configStore: DesktopConfigStore;
  keychain: MacKeychainStore;
  activeRuns: Map<string, RunState>;

  constructor({
    app,
    backendManager,
    configStore,
    keychain,
  }: {
    app: AppLike;
    backendManager: BackendManager;
    configStore: DesktopConfigStore;
    keychain: MacKeychainStore;
  }) {
    super();
    this.app = app;
    this.backendManager = backendManager;
    this.configStore = configStore;
    this.keychain = keychain;
    this.activeRuns = new Map();
  }

  async startRun(input: ReviewRuntimeStartInput): Promise<ReviewRunPayload> {
    const sessionId = String(input.sessionId || "").trim();
    if (!sessionId) {
      throw new Error("A review session id is required.");
    }

    const session = await this.backendManager.request<ReviewSessionPayload>(
      `/api/review/sessions/${sessionId}`
    );
    const customInstructions = normalizeInstructionText(input.customInstructions) || null;
    const appliedInstructions = this.#buildAppliedInstructions(
      session.repo_path,
      customInstructions
    );
    const run = await this.backendManager.request<ReviewRunPayload>(
      `/api/review/sessions/${sessionId}/runs`,
      {
        method: "POST",
        body: {
          engine: "vertex_review",
          mode: "non_agentic_review",
          custom_instructions: customInstructions,
          applied_instructions: appliedInstructions,
        },
      }
    );

    const state: RunState = {
      sessionId,
      runId: run.id,
      repoPath: session.repo_path,
      cancelRequested: false,
      completed: false,
    };
    this.activeRuns.set(run.id, state);
    this.#emitRuntimeChanged(state);

    void this.#runReview(state, session, appliedInstructions).catch((error) => {
      void this.#failRun(
        state,
        sanitizeErrorMessage(error, "Review run failed unexpectedly.")
      );
    });

    return run;
  }

  async sendReviewChatMessage(
    input: ReviewChatRequestInput
  ): Promise<ReviewChatResponse> {
    const sessionId = String(input.sessionId || "").trim();
    if (!sessionId) {
      throw new Error("A review session id is required for review chat.");
    }

    return this.backendManager.request<ReviewChatResponse>("/api/review/chat", {
      method: "POST",
      body: {
        ...input,
        target_override: input.targetOverride ?? null,
      },
    });
  }

  async cancelRun(input: ReviewRuntimeCancelInput): Promise<unknown> {
    const runId = String(input.runId || "").trim();
    const sessionId = String(input.sessionId || "").trim();
    const state = this.activeRuns.get(runId);

    if (state) {
      state.cancelRequested = true;
      await this.#appendRunEvent(state, "run_cancel_requested", {});
      await this.#updateRunStatus(state, {
        status: "cancelled",
        completed_at: nowIso(),
      });
      state.completed = true;
      this.activeRuns.delete(runId);
      this.#emitRuntimeChanged(state);
    }

    return this.backendManager.request(
      `/api/review/sessions/${sessionId}/runs/${runId}`
    );
  }

  async respondToApproval(_input: ReviewRuntimeApprovalInput): Promise<void> {
    throw new Error("Review runs do not request interactive approvals.");
  }

  async dispose(): Promise<void> {
    this.activeRuns.clear();
  }

  async #runReview(
    state: RunState,
    session: ReviewSessionPayload,
    appliedInstructions: string | null
  ): Promise<void> {
    await this.#updateRunStatus(state, {
      status: "running",
      started_at: nowIso(),
    });
    await this.#appendRunEvent(state, "run_started", {
      engine: "vertex_review",
      mode: "non_agentic_review",
    });

    const report = await this.backendManager.request<Record<string, unknown>>(
      "/api/review/generate",
      {
        method: "POST",
        body: {
          repo_path: session.repo_path,
          target_mode: session.target_mode || "compare",
          base_ref: session.base_ref,
          head_ref: session.head_ref,
          commit_sha: session.commit_sha ?? null,
          context_lines: session.context_lines ?? 10,
          applied_instructions: appliedInstructions,
        },
      }
    );

    if (state.cancelRequested) {
      await this.#finishCancelled(state);
      return;
    }

    await this.backendManager.request(
      `/api/review/sessions/${state.sessionId}/runs/${state.runId}/result`,
      {
        method: "POST",
        body: {
          summary: report.summary,
          findings: report.findings ?? [],
          partial: Boolean(report.partial),
          generated_at: report.generated_at ?? nowIso(),
        },
      }
    );
    await this.#updateRunStatus(state, {
      status: "completed",
      completed_at: nowIso(),
    });
    await this.#appendRunEvent(state, "run_completed", {
      findings_count: Array.isArray(report.findings) ? report.findings.length : 0,
    });
    state.completed = true;
    this.activeRuns.delete(state.runId);
    this.#emitRuntimeChanged(state);
  }

  async #finishCancelled(state: RunState): Promise<void> {
    await this.#updateRunStatus(state, {
      status: "cancelled",
      completed_at: nowIso(),
    });
    await this.#appendRunEvent(state, "run_cancelled", {});
    state.completed = true;
    this.activeRuns.delete(state.runId);
    this.#emitRuntimeChanged(state);
  }

  async #failRun(state: RunState, detail: string): Promise<void> {
    if (state.completed) {
      return;
    }
    await this.#updateRunStatus(state, {
      status: state.cancelRequested ? "cancelled" : "failed",
      error_detail: detail,
      completed_at: nowIso(),
    });
    await this.#appendRunEvent(
      state,
      state.cancelRequested ? "run_cancelled" : "run_failed",
      { detail }
    );
    state.completed = true;
    this.activeRuns.delete(state.runId);
    this.#emitRuntimeChanged(state);
  }

  async #updateRunStatus(
    state: RunState,
    payload: Record<string, unknown>
  ): Promise<void> {
    await this.backendManager.request(
      `/api/review/sessions/${state.sessionId}/runs/${state.runId}/status`,
      {
        method: "POST",
        body: payload,
      }
    );
    this.#emitRuntimeChanged(state);
  }

  async #appendRunEvent(
    state: RunState,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await this.backendManager.request(
      `/api/review/sessions/${state.sessionId}/runs/${state.runId}/events`,
      {
        method: "POST",
        body: {
          events: [
            {
              event_type: eventType,
              payload,
              created_at: nowIso(),
            },
          ],
        },
      }
    );
    this.#emitRuntimeChanged(state);
  }

  #buildAppliedInstructions(
    repoPath: string,
    customInstructions: string | null
  ): string | null {
    const desktopState = this.configStore.getState();
    const repoSettings = this.configStore.getRepoSettings(repoPath);
    const sections = [
      {
        label: "App-wide review guidelines",
        body: normalizeInstructionText(
          desktopState.reviewSettings?.pullRequestGuidelines
        ),
      },
      {
        label: "Repo-specific review guidelines",
        body: normalizeInstructionText(repoSettings.pullRequestGuidelines),
      },
      {
        label: "Additional review guidelines",
        body: normalizeInstructionText(customInstructions),
      },
    ].filter((section) => section.body);

    if (!sections.length) {
      return null;
    }

    return sections
      .map((section) => `${section.label}:\n${section.body}`)
      .join("\n\n");
  }

  #emitRuntimeChanged(state: RunState): void {
    this.emit("state-changed", {
      sessionId: state.sessionId,
      runId: state.runId,
    });
  }
}

export { ReviewRuntimeManager };
