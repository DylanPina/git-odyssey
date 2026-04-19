import fs = require("node:fs");
import path = require("node:path");
import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptions,
} from "node:child_process";
import { EventEmitter } from "node:events";
import { promisify } from "node:util";

import type { BackendManager } from "./backend-manager";
import type {
  CodexNotificationMessage,
  CodexRequestMessage,
  CodexTurn,
} from "./codex-app-server-client";
import { CodexAppServerClient } from "./codex-app-server-client";
import type { DesktopConfigStore } from "./config-store";
import type { MacKeychainStore } from "./keychain";
import type {
  DesktopConfigState,
  ReviewApprovalDecision,
  ReviewChatCodeContext,
  ReviewChatContext,
  ReviewChatFindingContext,
  ReviewChatRequestInput,
  ReviewChatResponse,
  ReviewChatTranscriptMessage,
} from "./types";
import { getProfileById } from "./ai-config";
import { normalizePath } from "./git-projects";

const execFileAsync = promisify(execFile) as (
  file: string,
  args?: string[],
  options?: Parameters<typeof execFile>[2]
) => Promise<{
  stdout: string;
  stderr: string;
}>;
const REVIEW_BRANCH_PREFIX = "git-odyssey-review";

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
  merge_base_sha: string;
  head_head_sha: string;
  stats?: {
    files_changed?: number;
    additions?: number;
    deletions?: number;
  };
};

type ReviewRunPayload = {
  id: string;
};

type ReviewRunDetailPayload = {
  id: string;
  status?: string | null;
  custom_instructions?: string | null;
  applied_instructions?: string | null;
  result?: {
    summary?: string | null;
    findings?: Array<{
      id?: string;
      severity?: string;
      title?: string;
      body?: string;
      file_path?: string;
      new_start?: number | null;
      old_start?: number | null;
    }>;
  } | null;
};

type ThreadStartResponse = {
  thread: {
    id: string;
  };
  model?: string | null;
  modelProvider?: string | null;
};

type ReviewStartResponse = {
  reviewThreadId: string;
  turn: CodexTurn;
};

type TurnStartResponse = {
  turn: CodexTurn;
};

type CodexRuntime = {
  codexHome: string;
  model: string | null;
  modelProvider: string | null;
};

type Worktree = {
  path: string;
  branch: string;
};

type ChatWorktree = {
  path: string;
};

type RunEvent = {
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

type TurnWaiter = {
  resolve: (turn: CodexTurn) => void;
  reject: (error: Error) => void;
};

type PendingApproval = {
  request: CodexRequestMessage<Record<string, any>>;
  summary: string;
};

type RunState = {
  sessionId: string;
  runId: string;
  repoPath: string;
  targetMode: "compare" | "commit";
  baseRef: string;
  headRef: string;
  commitSha: string | null;
  headHeadSha: string;
  customInstructions: string | null;
  appliedInstructions: string | null;
  baseThreadId: string | null;
  reviewThreadId: string | null;
  currentTurnId: string | null;
  worktreePath: string | null;
  worktreeBranch: string | null;
  codexHomePath: string | null;
  turnWaiters: Map<string, TurnWaiter>;
  completedTurns: Map<string, CodexTurn>;
  pendingApprovals: Map<string, PendingApproval>;
  eventBuffer: RunEvent[];
  eventHistory: RunEvent[];
  flushTimer: NodeJS.Timeout | null;
  flushPromise: Promise<void>;
  cancelRequested: boolean;
  completed: boolean;
};

type ChatState = {
  scopeKey: string;
  sessionId: string;
  runId: string | null;
  modelId: string | null;
  repoPath: string;
  targetMode: "compare" | "commit";
  baseRef: string;
  headRef: string;
  commitSha: string | null;
  mergeBaseSha: string | null;
  headHeadSha: string;
  stats: {
    filesChanged: number;
    additions: number;
    deletions: number;
  } | null;
  threadId: string | null;
  currentTurnId: string | null;
  worktreePath: string | null;
  codexHomePath: string | null;
  turnWaiters: Map<string, TurnWaiter>;
  completedTurns: Map<string, CodexTurn>;
  eventHistory: RunEvent[];
  sendChain: Promise<void>;
  initializationPromise: Promise<void> | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function sanitizePathComponent(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
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

function normalizeReviewChatModelId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function execFileWithInput(
  command: string,
  args: string[],
  options: SpawnOptions = {},
  input = ""
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;

    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(stderr.trim() || stdout.trim() || `${command} exited with ${code}.`)
      );
    });

    child.stdin?.end(input);
  });
}

class ReviewRuntimeManager extends EventEmitter {
  app: AppLike;
  backendManager: BackendManager;
  configStore: DesktopConfigStore;
  keychain: MacKeychainStore;
  activeRuns: Map<string, RunState>;
  threadToRunId: Map<string, string>;
  chatStates: Map<string, ChatState>;
  threadToChatScopeKey: Map<string, string>;
  codexClient: CodexAppServerClient | null;
  codexClientHome: string | null;

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
    this.threadToRunId = new Map();
    this.chatStates = new Map();
    this.threadToChatScopeKey = new Map();
    this.codexClient = null;
    this.codexClientHome = null;
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
          engine: "codex_cli",
          mode: "native_review",
          custom_instructions: customInstructions,
          applied_instructions: appliedInstructions,
        },
      }
    );

    const state: RunState = {
      sessionId,
      runId: run.id,
      repoPath: session.repo_path,
      targetMode: session.target_mode || "compare",
      baseRef: session.base_ref,
      headRef: session.head_ref,
      commitSha: session.commit_sha || null,
      headHeadSha: session.head_head_sha,
      customInstructions: customInstructions,
      appliedInstructions,
      baseThreadId: null,
      reviewThreadId: null,
      currentTurnId: null,
      worktreePath: null,
      worktreeBranch: null,
      codexHomePath: null,
      turnWaiters: new Map(),
      completedTurns: new Map(),
      pendingApprovals: new Map(),
      eventBuffer: [],
      eventHistory: [],
      flushTimer: null,
      flushPromise: Promise.resolve(),
      cancelRequested: false,
      completed: false,
    };

    this.activeRuns.set(state.runId, state);
    void this.#runReview(state).catch(async (error) => {
      await this.#failRun(
        state,
        sanitizeErrorMessage(error, "Codex review run failed unexpectedly.")
      );
    });
    this.#emitRuntimeChanged(state);
    return run;
  }

  async sendReviewChatMessage(
    input: ReviewChatRequestInput
  ): Promise<ReviewChatResponse> {
    const sessionId = String(input.sessionId || "").trim();
    if (!sessionId) {
      throw new Error("A review session id is required for Codex review chat.");
    }

    const runId = String(input.runId || "").trim() || null;
    const scopeKey = this.#buildReviewChatScopeKey(sessionId, runId);
    const state = this.#getOrCreateChatState(scopeKey, sessionId, runId);
    const requestedModelId = this.#resolveRequestedReviewChatModelId(input);
    const runTurn = async () => {
      try {
        if (
          requestedModelId !== state.modelId &&
          state.threadId &&
          state.worktreePath
        ) {
          await this.#recreateReviewChatState(state, input);
        } else {
          await this.#ensureReviewChatStateInitialized(state, input);
        }

        return await this.#runReviewChatTurn(state, input);
      } catch (error) {
        if (!this.#isMissingThreadError(error)) {
          throw error;
        }

        await this.#recreateReviewChatState(state, input);
        return this.#runReviewChatTurn(state, input);
      }
    };

    const responsePromise = state.sendChain.then(runTurn, runTurn);
    state.sendChain = responsePromise.then(
      () => undefined,
      () => undefined
    );

    return responsePromise;
  }

  async cancelRun(input: ReviewRuntimeCancelInput): Promise<unknown> {
    const runId = String(input.runId || "").trim();
    const sessionId = String(input.sessionId || "").trim();
    const state = this.activeRuns.get(runId);

    if (!state) {
      return this.backendManager.request(
        `/api/review/sessions/${sessionId}/runs/${runId}`
      );
    }

    state.cancelRequested = true;
    this.#queueRunEvent(state, "run_cancel_requested", {});

    const activeThreadId = this.#getActiveThreadId(state);
    if (this.codexClient && activeThreadId && state.currentTurnId) {
      try {
        await this.codexClient.request("turn/interrupt", {
          threadId: activeThreadId,
          turnId: state.currentTurnId,
        });
      } catch (_error) {
        // Fall through and let the run finalize as cancelled.
      }
    }

    return this.backendManager.request(
      `/api/review/sessions/${sessionId}/runs/${runId}`
    );
  }

  async respondToApproval(input: ReviewRuntimeApprovalInput): Promise<void> {
    const runId = String(input.runId || "").trim();
    const sessionId = String(input.sessionId || "").trim();
    const approvalId = String(input.approvalId || "").trim();
    const state = this.activeRuns.get(runId);
    if (!state) {
      throw new Error("The requested review run is no longer active.");
    }

    const approval = state.pendingApprovals.get(approvalId);
    if (!approval) {
      throw new Error("The requested approval prompt was not found.");
    }

    const responsePayload = this.#buildApprovalResponsePayload(
      approval.request,
      input.decision
    );
    await this.#requireCodexClient().respond(approval.request.id, responsePayload);
    state.pendingApprovals.delete(approvalId);

    await this.backendManager.request(
      `/api/review/sessions/${sessionId}/runs/${runId}/approvals`,
      {
        method: "POST",
        body: {
          id: approvalId,
          method: approval.request.method,
          status: this.#decisionToApprovalStatus(input.decision),
          summary: approval.summary,
          thread_id: approval.request.params?.threadId ?? null,
          turn_id: approval.request.params?.turnId ?? null,
          item_id: approval.request.params?.itemId ?? null,
          request_payload: approval.request.params ?? {},
          response_payload: responsePayload,
        },
      }
    );
    this.#queueRunEvent(state, "approval_resolved", {
      approval_id: approvalId,
      decision: input.decision,
      method: approval.request.method,
    });
    await this.#flushBufferedEvents(state);
    this.#emitRuntimeChanged(state);
  }

  async dispose(): Promise<void> {
    for (const state of Array.from(this.chatStates.values())) {
      await this.#cleanupChatState(state);
    }
    if (this.codexClient) {
      await this.codexClient.stop();
      this.codexClient = null;
      this.codexClientHome = null;
    }
  }

  #buildReviewChatScopeKey(sessionId: string, runId: string | null): string {
    return runId ? `run:${runId}` : `session:${sessionId}`;
  }

  #resolveRequestedReviewChatModelId(input: ReviewChatRequestInput): string {
    return (
      normalizeReviewChatModelId(input.modelId) ||
      normalizeReviewChatModelId(
        this.configStore.getState().aiRuntimeConfig?.capabilities?.text_generation?.model_id
      ) ||
      "gpt-5.4-mini"
    );
  }

  #getOrCreateChatState(
    scopeKey: string,
    sessionId: string,
    runId: string | null
  ): ChatState {
    const existing = this.chatStates.get(scopeKey);
    if (existing) {
      existing.sessionId = sessionId;
      existing.runId = runId;
      return existing;
    }

    const state: ChatState = {
      scopeKey,
      sessionId,
      runId,
      modelId: null,
      repoPath: "",
      targetMode: "compare",
      baseRef: "",
      headRef: "",
      commitSha: null,
      mergeBaseSha: null,
      headHeadSha: "",
      stats: null,
      threadId: null,
      currentTurnId: null,
      worktreePath: null,
      codexHomePath: null,
      turnWaiters: new Map(),
      completedTurns: new Map(),
      eventHistory: [],
      sendChain: Promise.resolve(),
      initializationPromise: null,
    };
    this.chatStates.set(scopeKey, state);
    return state;
  }

  async #ensureReviewChatStateInitialized(
    state: ChatState,
    input: ReviewChatRequestInput
  ): Promise<void> {
    if (state.threadId && state.worktreePath) {
      return;
    }

    if (state.initializationPromise) {
      return state.initializationPromise;
    }

    state.initializationPromise = this.#initializeReviewChatState(state, input).finally(
      () => {
        state.initializationPromise = null;
      }
    );
    return state.initializationPromise;
  }

  async #recreateReviewChatState(
    state: ChatState,
    input: ReviewChatRequestInput
  ): Promise<void> {
    await this.#cleanupChatState(state, { removeFromRegistry: false });
    await this.#ensureReviewChatStateInitialized(state, input);
  }

  async #initializeReviewChatState(
    state: ChatState,
    input: ReviewChatRequestInput
  ): Promise<void> {
    const session = await this.backendManager.request<ReviewSessionPayload>(
      `/api/review/sessions/${state.sessionId}`
    );
    state.repoPath = session.repo_path;
    state.targetMode = session.target_mode || "compare";
    state.baseRef = session.base_ref;
    state.headRef = session.head_ref;
    state.commitSha = session.commit_sha || null;
    state.mergeBaseSha = session.merge_base_sha || null;
    state.headHeadSha = session.head_head_sha;
    state.stats = session.stats
      ? {
          filesChanged: Number(session.stats.files_changed || 0),
          additions: Number(session.stats.additions || 0),
          deletions: Number(session.stats.deletions || 0),
        }
      : null;

    const requestedModelId = this.#resolveRequestedReviewChatModelId(input);
    const codexRuntime = await this.#ensureCodexRuntime(requestedModelId);
    state.codexHomePath = codexRuntime.codexHome;
    const worktree = await this.#createChatWorktree(state);
    state.worktreePath = worktree.path;

    const client = await this.#ensureCodexClient(codexRuntime.codexHome);
    const thread = await client.request<ThreadStartResponse>("thread/start", {
      cwd: state.worktreePath,
      sandbox: "read-only",
      approvalPolicy: "never",
      approvalsReviewer: "user",
      personality: "pragmatic",
      ephemeral: true,
      model: codexRuntime.model,
      modelProvider: codexRuntime.modelProvider,
      developerInstructions: this.#buildReviewChatDeveloperInstructions(state),
    });

    state.threadId = thread.thread.id;
    state.modelId = normalizeReviewChatModelId(thread.model) ?? codexRuntime.model;
    this.threadToChatScopeKey.set(state.threadId, state.scopeKey);

    await this.#primeReviewChatThread(
      state,
      client,
      input.messages ?? [],
      await this.#resolveReviewChatContext(state, input)
    );
  }

  async #primeReviewChatThread(
    state: ChatState,
    client: CodexAppServerClient,
    messages: ReviewChatTranscriptMessage[],
    reviewContext: ReviewChatContext | null
  ): Promise<void> {
    if (!state.threadId) {
      throw new Error("Codex review chat thread did not initialize correctly.");
    }

    const seedTurn = await client.request<TurnStartResponse>("turn/start", {
      threadId: state.threadId,
      input: [
        {
          type: "text",
          text: this.#buildReviewChatBootstrapInput(state, messages, reviewContext),
          text_elements: [],
        },
      ],
      approvalPolicy: "never",
      approvalsReviewer: "user",
      personality: "pragmatic",
      effort: "low",
      summary: "none",
      sandboxPolicy: {
        type: "readOnly",
        networkAccess: false,
      },
    });

    const seedTurnId = seedTurn.turn.id;
    state.currentTurnId = seedTurnId;
    const completedSeedTurn = await this.#waitForTurn(state, seedTurnId);
    if (completedSeedTurn.status !== "completed") {
      throw new Error(
        this.#formatTurnFailure(
          completedSeedTurn,
          "Codex review chat bootstrap turn failed."
        )
      );
    }
  }

  async #runReviewChatTurn(
    state: ChatState,
    input: ReviewChatRequestInput
  ): Promise<ReviewChatResponse> {
    if (!state.threadId) {
      throw new Error("Codex review chat thread is not available.");
    }

    const client = await this.#ensureCodexClient(
      state.codexHomePath || (await this.#ensureCodexRuntime()).codexHome
    );
    const reviewContext = await this.#resolveReviewChatContext(state, input);
    const turn = await client.request<TurnStartResponse>("turn/start", {
      threadId: state.threadId,
      input: [
        {
          type: "text",
          text: this.#buildReviewChatTurnInput(state, input, reviewContext),
          text_elements: [],
        },
      ],
      approvalPolicy: "never",
      approvalsReviewer: "user",
      personality: "pragmatic",
      sandboxPolicy: {
        type: "readOnly",
        networkAccess: false,
      },
    });

    const turnId = turn.turn.id;
    state.currentTurnId = turnId;
    const completedTurn = await this.#waitForTurn(state, turnId);
    if (completedTurn.status !== "completed") {
      throw new Error(
        this.#formatTurnFailure(completedTurn, "Codex review chat turn failed.")
      );
    }

    const response = this.#collectAgentMessageFromEvents(state, turnId)?.trim();
    if (!response) {
      throw new Error("Codex review chat did not return an assistant response.");
    }

    return { response };
  }

  async #resolveReviewChatContext(
    state: ChatState,
    input: ReviewChatRequestInput
  ): Promise<ReviewChatContext | null> {
    if (input.reviewContext) {
      return this.#normalizeReviewChatContext(input.reviewContext);
    }

    if (!state.runId) {
      return null;
    }

    const run = await this.backendManager.request<ReviewRunDetailPayload>(
      `/api/review/sessions/${state.sessionId}/runs/${state.runId}`
    );
    return this.#normalizeReviewChatContext({
      runStatus: run.status ?? null,
      summary: run.result?.summary ?? null,
      appliedInstructions: run.applied_instructions ?? null,
      findings: (run.result?.findings ?? []).map((finding, index) => ({
        id: String(finding.id || `finding_${index + 1}`),
        severity:
          finding.severity === "high" ||
          finding.severity === "medium" ||
          finding.severity === "low"
            ? finding.severity
            : "low",
        title: String(finding.title || ""),
        body: String(finding.body || ""),
        file_path: String(finding.file_path || ""),
        new_start:
          typeof finding.new_start === "number" ? finding.new_start : null,
        old_start:
          typeof finding.old_start === "number" ? finding.old_start : null,
      })),
    });
  }

  #normalizeReviewChatContext(
    input: ReviewChatContext | null | undefined
  ): ReviewChatContext | null {
    if (!input) {
      return null;
    }

    return {
      runStatus: input.runStatus ?? null,
      summary: input.summary ?? null,
      appliedInstructions: normalizeInstructionText(input.appliedInstructions) || null,
      findings: Array.isArray(input.findings) ? input.findings : [],
    };
  }

  #buildReviewChatDeveloperInstructions(state: ChatState): string {
    const targetLabel =
      state.targetMode === "commit"
        ? `commit ${state.commitSha || state.headRef}`
        : `${state.baseRef}...${state.headRef}`;
    return [
      "You are GitOdyssey's Codex review chat assistant.",
      `Only answer questions about the current review target: ${targetLabel}.`,
      "Ignore unrelated historical commits and repo-wide retrieval assumptions.",
      "Use the current branch diff, any attached code context, any explicitly attached findings, and any provided persisted review findings.",
      "Do not make edits and do not execute commands that change files.",
    ].join("\n");
  }

  #buildReviewChatBootstrapInput(
    state: ChatState,
    messages: ReviewChatTranscriptMessage[],
    reviewContext: ReviewChatContext | null
  ): string {
    return [
      "Load the following compare-target context for future review chat turns.",
      "Do not answer a user question yet. Reply exactly with READY.",
      "",
      "## Compare Target",
      this.#formatReviewChatTargetSummary(state),
      "",
      "## Persisted Review Context",
      this.#formatReviewChatContext(reviewContext),
      "",
      "## Recent Transcript",
      this.#formatReviewChatTranscript(messages),
    ].join("\n");
  }

  #buildReviewChatTurnInput(
    state: ChatState,
    input: ReviewChatRequestInput,
    reviewContext: ReviewChatContext | null
  ): string {
    return [
      "Continue the GitOdyssey review chat for this compare target.",
      "",
      "## Compare Target",
      this.#formatReviewChatTargetSummary(state),
      "",
      "## Persisted Review Context",
      this.#formatReviewChatContext(reviewContext),
      "",
      "## Attached Code Context",
      this.#formatReviewChatCodeContexts(input.codeContexts || []),
      "",
      "## Attached Findings",
      this.#formatReviewChatFindingContexts(input.findingContexts || []),
      "",
      "## User Message",
      String(input.message || "").trim() || "Focus on the attached code context.",
    ].join("\n");
  }

  #formatReviewChatTargetSummary(state: ChatState): string {
    const lines =
      state.targetMode === "commit"
        ? [
            `Repository path: ${state.repoPath}`,
            "Target mode: single commit",
            `Commit SHA: ${state.commitSha || state.headRef}`,
            `Parent: ${state.baseRef}`,
            `Diff base: ${state.mergeBaseSha || "Unavailable"}`,
          ]
        : [
            `Repository path: ${state.repoPath}`,
            "Target mode: branch compare",
            `Base ref: ${state.baseRef}`,
            `Head ref: ${state.headRef}`,
            `Merge base: ${state.mergeBaseSha || "Unavailable"}`,
          ];

    if (state.stats) {
      lines.push(
        `Diff stats: ${state.stats.filesChanged} files, +${state.stats.additions}, -${state.stats.deletions}`
      );
    }

    return lines.join("\n");
  }

  #formatReviewChatContext(reviewContext: ReviewChatContext | null): string {
    if (!reviewContext) {
      return "No persisted review result or applied guidance exists for this compare target yet.";
    }

    const lines = [
      `Run status: ${reviewContext.runStatus || "unknown"}`,
      reviewContext.appliedInstructions
        ? "Applied review guidance:"
        : "Applied review guidance: default GitOdyssey review behavior only.",
    ];

    if (reviewContext.appliedInstructions) {
      lines.push(reviewContext.appliedInstructions);
    }

    lines.push(
      `Summary: ${String(reviewContext.summary || "").trim() || "No persisted review summary yet."}`,
    );

    if (!reviewContext.findings.length) {
      lines.push("Findings: none");
      return lines.join("\n");
    }

    lines.push("Findings:");
    reviewContext.findings.forEach((finding, index) => {
      const lineRef =
        typeof finding.new_start === "number"
          ? `:${finding.new_start}`
          : typeof finding.old_start === "number"
            ? `:${finding.old_start}`
            : "";
      lines.push(
        `${index + 1}. [${finding.severity}] ${finding.title} (${finding.file_path}${lineRef})`
      );
      lines.push(finding.body);
    });

    return lines.join("\n");
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

  #appendAppliedInstructions(
    instructionLines: string[],
    appliedInstructions: string | null
  ): void {
    if (!appliedInstructions) {
      return;
    }

    instructionLines.push(
      "Apply the following saved and run-specific review guidance for this run:"
    );
    instructionLines.push(appliedInstructions);
  }

  #formatReviewChatCodeContexts(codeContexts: ReviewChatCodeContext[]): string {
    if (!codeContexts.length) {
      return "No code context attached.";
    }

    return codeContexts
      .map((context, index) => {
        const lines = [
          `Context ${index + 1}: ${context.filePath} (${context.side} ${context.startLine}:${context.startColumn}-${context.endLine}:${context.endColumn})`,
          `\`\`\`${context.language || "text"}`,
          context.selectedText,
          "\`\`\`",
        ];
        if (context.isTruncated) {
          lines.push("[selection truncated]");
        }
        return lines.join("\n");
      })
      .join("\n\n");
  }

  #formatReviewChatFindingContexts(
    findingContexts: ReviewChatFindingContext[]
  ): string {
    if (!findingContexts.length) {
      return "No findings attached.";
    }

    return findingContexts
      .map((finding, index) => {
        const lineRef =
          typeof finding.new_start === "number"
            ? `:${finding.new_start}`
            : typeof finding.old_start === "number"
              ? `:${finding.old_start}`
              : "";
        return [
          `Finding ${index + 1}: [${finding.severity}] ${finding.title} (${finding.file_path}${lineRef})`,
          String(finding.body || "").trim() || "(no finding details provided)",
        ].join("\n");
      })
      .join("\n\n");
  }

  #formatReviewChatTranscript(messages: ReviewChatTranscriptMessage[]): string {
    if (!messages.length) {
      return "No previous transcript.";
    }

    return messages
      .map((message) => {
        const parts = [
          `${message.role === "assistant" ? "Assistant" : "User"}:`,
          String(message.content || "").trim() || "(no text)",
        ];
        if (message.codeContexts?.length) {
          parts.push(
            `Attached code context:\n${this.#formatReviewChatCodeContexts(
              message.codeContexts
            )}`
          );
        }
        if (message.findingContexts?.length) {
          parts.push(
            `Attached findings:\n${this.#formatReviewChatFindingContexts(
              message.findingContexts
            )}`
          );
        }
        return parts.join("\n");
      })
      .join("\n\n");
  }

  async #createChatWorktree(state: ChatState): Promise<ChatWorktree> {
    const repoPath = normalizePath(state.repoPath);
    if (!repoPath) {
      throw new Error("Review chat could not resolve the repository path.");
    }

    const worktreeRoot = path.join(
      this.configStore.getState().dataDir,
      "review-chat-worktrees",
      sanitizePathComponent(state.scopeKey)
    );

    fs.mkdirSync(path.dirname(worktreeRoot), { recursive: true });
    await execFileAsync("git", ["worktree", "prune"], { cwd: repoPath });
    await execFileAsync("git", ["worktree", "remove", "--force", worktreeRoot], {
      cwd: repoPath,
    }).catch(() => {});
    fs.rmSync(worktreeRoot, { recursive: true, force: true });
    await execFileAsync(
      "git",
      ["worktree", "add", "--detach", worktreeRoot, state.headHeadSha],
      { cwd: repoPath }
    );

    return {
      path: worktreeRoot,
    };
  }

  async #cleanupChatState(
    state: ChatState,
    options: { removeFromRegistry?: boolean } = {}
  ): Promise<void> {
    for (const waiter of state.turnWaiters.values()) {
      waiter.reject(new Error("The review chat thread has already been reset."));
    }
    state.turnWaiters.clear();
    state.completedTurns.clear();
    state.eventHistory = [];

    if (state.threadId) {
      this.threadToChatScopeKey.delete(state.threadId);
    }

    await this.#cleanupChatWorktree(state);
    state.threadId = null;
    state.currentTurnId = null;
    state.worktreePath = null;
    state.codexHomePath = null;
    state.modelId = null;
    state.initializationPromise = null;

    if (options.removeFromRegistry !== false) {
      this.chatStates.delete(state.scopeKey);
    }
  }

  async #cleanupChatWorktree(state: ChatState): Promise<void> {
    if (!state.worktreePath) {
      return;
    }

    const repoPath = normalizePath(state.repoPath);
    if (!repoPath) {
      return;
    }

    await execFileAsync("git", ["worktree", "remove", "--force", state.worktreePath], {
      cwd: repoPath,
    }).catch(() => {});
    fs.rmSync(state.worktreePath, { recursive: true, force: true });
  }

  async #runReview(state: RunState): Promise<void> {
    const codexRuntime = await this.#ensureCodexRuntime();
    state.codexHomePath = codexRuntime.codexHome;
    const worktree = await this.#createWorktree(state);
    state.worktreePath = worktree.path;
    state.worktreeBranch = worktree.branch;

    await this.#updateRunStatus(state, {
      status: "pending",
      worktree_path: state.worktreePath,
      codex_home_path: state.codexHomePath,
    });

    const client = await this.#ensureCodexClient(codexRuntime.codexHome);
    const thread = await client.request<ThreadStartResponse>("thread/start", {
      cwd: state.worktreePath,
      sandbox: "workspace-write",
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
      personality: "pragmatic",
      ephemeral: true,
      model: codexRuntime.model,
      modelProvider: codexRuntime.modelProvider,
      developerInstructions: this.#buildDeveloperInstructions(state),
    });

    state.baseThreadId = thread.thread.id;
    this.threadToRunId.set(state.baseThreadId, state.runId);
    this.#queueRunEvent(state, "thread_started", {
      thread_id: state.baseThreadId,
      cwd: state.worktreePath,
      model: thread.model,
      model_provider: thread.modelProvider,
    });

    await this.#primeReviewThread(state, client);
    if (state.cancelRequested) {
      await this.#finishCancelled(state);
      return;
    }

    let reviewThreadId: string | null = null;
    let reviewTurnId: string | null = null;
    let reviewMode = "native_review";
    try {
      const reviewStart = await client.request<ReviewStartResponse>("review/start", {
        threadId: state.baseThreadId,
        delivery: "detached",
        target: {
          type: "baseBranch",
          branch: state.baseRef,
        },
      });
      reviewThreadId = reviewStart.reviewThreadId;
      reviewTurnId = reviewStart.turn.id;
      this.threadToRunId.set(reviewThreadId, state.runId);
    } catch (error) {
      if (!this.#isMissingRolloutError(error)) {
        throw error;
      }

      this.#queueRunEvent(state, "review_start_fallback", {
        detail: sanitizeErrorMessage(
          error,
          "review/start reported no rollout for the base thread."
        ),
      });
      await this.#flushBufferedEvents(state);

      const reviewTurn = await client.request<TurnStartResponse>("turn/start", {
        threadId: state.baseThreadId,
        input: [
          {
            type: "text",
            text: this.#buildReviewTurnInstructions(state),
            text_elements: [],
          },
        ],
        approvalPolicy: "on-request",
        approvalsReviewer: "user",
        personality: "pragmatic",
      });
      reviewThreadId = state.baseThreadId;
      reviewTurnId = reviewTurn.turn.id;
      reviewMode = "fallback_turn_review";
    }

    state.reviewThreadId = reviewThreadId;
    state.currentTurnId = reviewTurnId;
    if (!state.reviewThreadId || !state.currentTurnId) {
      throw new Error("Codex review did not start a review thread and turn.");
    }

    await this.#updateRunStatus(state, {
      status: "running",
      review_thread_id: state.reviewThreadId,
      worktree_path: state.worktreePath,
      codex_home_path: state.codexHomePath,
      started_at: nowIso(),
    });
    this.#queueRunEvent(state, "run_started", {
      base_thread_id: state.baseThreadId,
      review_thread_id: state.reviewThreadId,
      review_turn_id: state.currentTurnId,
      review_mode: reviewMode,
    });

    const activeReviewTurnId = state.currentTurnId;
    const reviewTurn = await this.#waitForTurn(state, activeReviewTurnId);
    if (state.cancelRequested) {
      await this.#finishCancelled(state);
      return;
    }
    if (reviewTurn.status !== "completed") {
      throw new Error(this.#formatTurnFailure(reviewTurn, "Codex review turn failed."));
    }

    this.#queueRunEvent(state, "review_turn_completed", {
      turn_id: reviewTurn.id,
      status: reviewTurn.status,
    });
    await this.#flushBufferedEvents(state);

    const extraction = await client.request<TurnStartResponse>("turn/start", {
      threadId: state.reviewThreadId,
      input: [
        {
          type: "text",
          text: this.#buildExtractionInstructions(),
          text_elements: [],
        },
      ],
      outputSchema: this.#buildResultOutputSchema(),
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
      personality: "pragmatic",
      sandboxPolicy: {
        type: "readOnly",
        networkAccess: false,
      },
    });

    const extractionTurnId = extraction.turn.id;
    state.currentTurnId = extractionTurnId;
    this.#queueRunEvent(state, "extraction_turn_started", {
      turn_id: state.currentTurnId,
    });
    const extractionTurn = await this.#waitForTurn(state, extractionTurnId);
    if (state.cancelRequested) {
      await this.#finishCancelled(state);
      return;
    }
    if (extractionTurn.status !== "completed") {
      throw new Error(
        this.#formatTurnFailure(extractionTurn, "Codex extraction turn failed.")
      );
    }

    const structuredResult = this.#extractStructuredResultFromEvents(
      state,
      extractionTurnId
    );

    await this.backendManager.request(
      `/api/review/sessions/${state.sessionId}/runs/${state.runId}/result`,
      {
        method: "POST",
        body: structuredResult,
      }
    );
    this.#queueRunEvent(state, "run_completed", {
      review_thread_id: state.reviewThreadId,
    });
    await this.#flushBufferedEvents(state);
    this.#emitRuntimeChanged(state);

    state.completed = true;
    await this.#cleanupRun(state);
  }

  async #ensureCodexRuntime(modelOverride: string | null = null): Promise<CodexRuntime> {
    const desktopState = this.configStore.getState();
    const aiRuntimeConfig = desktopState.aiRuntimeConfig;
    const binding = aiRuntimeConfig?.capabilities?.text_generation;
    const resolvedModelId = modelOverride || binding?.model_id || "gpt-5.4-mini";
    if (binding) {
      const profile = getProfileById(aiRuntimeConfig, binding.provider_profile_id);
      if (profile?.provider_type === "openai" && profile.api_key_secret_ref) {
        const apiKey = await this.keychain.getSecret(profile.api_key_secret_ref);
        if (apiKey) {
          const codexHome = path.join(desktopState.dataDir, "codex-home");
          fs.mkdirSync(codexHome, { recursive: true });
          await execFileWithInput(
            "codex",
            ["login", "--with-api-key"],
            {
              env: {
                ...process.env,
                CODEX_HOME: codexHome,
              },
            },
            `${apiKey.trim()}\n`
          );

          return {
            codexHome,
            model: resolvedModelId,
            modelProvider: "openai",
          };
        }
      }
    }

    const globalCodexHome = path.join(process.env.HOME || "", ".codex");
    try {
      await execFileAsync("codex", ["login", "status"], {
        env: {
          ...process.env,
          CODEX_HOME: globalCodexHome,
        },
      });
    } catch (_error) {
      throw new Error(
        "Codex review could not import an OpenAI API key from GitOdyssey settings, and no existing Codex CLI login is available."
      );
    }

    return {
      codexHome: globalCodexHome,
      model: resolvedModelId,
      modelProvider: null,
    };
  }

  async #ensureCodexClient(codexHome: string): Promise<CodexAppServerClient> {
    if (this.codexClient && this.codexClientHome === codexHome) {
      return this.codexClient;
    }

    if (this.codexClient) {
      await this.codexClient.stop();
      this.codexClient = null;
      this.codexClientHome = null;
    }

    const client = new CodexAppServerClient({
      codexHome,
      appVersion: this.app.getVersion?.() || "0.1.0",
    });
    client.on("notification", (message) => {
      void this.#handleCodexNotification(message);
    });
    client.on("request", (message) => {
      void this.#handleCodexRequest(message);
    });
    client.on("stderr", (chunk) => {
      this.emit("log", {
        level: "warn",
        source: "codex",
        message: String(chunk).trim(),
      });
    });
    client.on("exit", () => {
      void this.#handleCodexExit();
    });
    await client.start();
    this.codexClient = client;
    this.codexClientHome = codexHome;
    return client;
  }

  #requireCodexClient(): CodexAppServerClient {
    if (!this.codexClient) {
      throw new Error("Codex app-server is not running.");
    }

    return this.codexClient;
  }

  async #handleCodexExit(): Promise<void> {
    this.codexClient = null;
    this.codexClientHome = null;
    const errorMessage = "Codex app-server exited unexpectedly during the review run.";
    const runs = Array.from(this.activeRuns.values());
    for (const state of runs) {
      if (state.completed) {
        continue;
      }
      for (const waiter of state.turnWaiters.values()) {
        waiter.reject(new Error(errorMessage));
      }
      state.turnWaiters.clear();
      await this.#failRun(state, errorMessage);
    }

    const chatErrorMessage =
      "Codex app-server exited unexpectedly during review chat.";
    for (const state of this.chatStates.values()) {
      for (const waiter of state.turnWaiters.values()) {
        waiter.reject(new Error(chatErrorMessage));
      }
      state.turnWaiters.clear();
      state.completedTurns.clear();
      if (state.threadId) {
        this.threadToChatScopeKey.delete(state.threadId);
      }
      state.threadId = null;
      state.currentTurnId = null;
      state.initializationPromise = null;
      state.eventHistory = [];
    }
  }

  async #handleCodexNotification(
    message: CodexNotificationMessage<Record<string, any>>
  ): Promise<void> {
    const threadId = message.params?.threadId;
    const runState = threadId ? this.#findStateByThreadId(threadId) : null;
    if (runState) {
      this.#queueRunEvent(runState, "codex_notification", {
        method: message.method,
        params: message.params,
      });

      if (message.method === "turn/completed") {
        const params = message.params ?? {};
        const turnId = params.turn?.id;
        const waiter = turnId ? runState.turnWaiters.get(turnId) : null;
        if (waiter) {
          runState.turnWaiters.delete(turnId);
          waiter.resolve(params.turn);
        } else if (turnId) {
          runState.completedTurns.set(turnId, params.turn);
        }
      }

      this.#scheduleFlush(runState);
      return;
    }

    const chatState = threadId ? this.#findChatStateByThreadId(threadId) : null;
    if (!chatState) {
      return;
    }

    chatState.eventHistory.push({
      event_type: "codex_notification",
      payload: {
        method: message.method,
        params: message.params ?? {},
      },
      created_at: nowIso(),
    });

    if (message.method !== "turn/completed") {
      return;
    }

    const params = message.params ?? {};
    const turnId = params.turn?.id;
    const waiter = turnId ? chatState.turnWaiters.get(turnId) : null;
    if (waiter) {
      chatState.turnWaiters.delete(turnId);
      waiter.resolve(params.turn);
    } else if (turnId) {
      chatState.completedTurns.set(turnId, params.turn);
    }
  }

  async #handleCodexRequest(
    message: CodexRequestMessage<Record<string, any>>
  ): Promise<void> {
    const threadId = message.params?.threadId;
    const runState = threadId ? this.#findStateByThreadId(threadId) : null;
    if (!runState) {
      const chatState = threadId ? this.#findChatStateByThreadId(threadId) : null;
      if (chatState) {
        chatState.eventHistory.push({
          event_type: "codex_request",
          payload: {
            request_id: String(message.id),
            method: message.method,
            params: message.params ?? {},
          },
          created_at: nowIso(),
        });
      }
      await this.#resolveUnknownRequest(message);
      return;
    }

    const approvalId = `review_approval_${runState.runId}_${String(message.id)}`;
    const summary = this.#summarizeApprovalRequest(message);
    runState.pendingApprovals.set(approvalId, {
      request: message,
      summary,
    });

    this.#queueRunEvent(runState, "codex_request", {
      request_id: String(message.id),
      method: message.method,
      params: message.params,
      approval_id: approvalId,
    });
    await this.backendManager.request(
      `/api/review/sessions/${runState.sessionId}/runs/${runState.runId}/approvals`,
      {
        method: "POST",
        body: {
          id: approvalId,
          method: message.method,
          status: "pending",
          summary,
          thread_id: message.params?.threadId ?? null,
          turn_id: message.params?.turnId ?? null,
          item_id: message.params?.itemId ?? null,
          request_payload: message.params ?? {},
          response_payload: null,
        },
      }
    );
    this.#emitRuntimeChanged(runState);
  }

  async #resolveUnknownRequest(
    message: CodexRequestMessage<Record<string, any>>
  ): Promise<void> {
    if (!this.codexClient) {
      return;
    }

    if (message.method === "item/permissions/requestApproval") {
      await this.codexClient.respond(message.id, {
        permissions: {},
        scope: "turn",
      });
      return;
    }

    if (
      message.method === "item/commandExecution/requestApproval" ||
      message.method === "item/fileChange/requestApproval"
    ) {
      await this.codexClient.respond(message.id, {
        decision: "decline",
      });
    }
  }

  #waitForTurn(state: RunState | ChatState, turnId: string): Promise<CodexTurn> {
    const completedTurn = state.completedTurns.get(turnId);
    if (completedTurn) {
      state.completedTurns.delete(turnId);
      return Promise.resolve(completedTurn);
    }

    return new Promise<CodexTurn>((resolve, reject) => {
      state.turnWaiters.set(turnId, { resolve, reject });
    });
  }

  async #updateRunStatus(state: RunState, payload: Record<string, unknown>): Promise<void> {
    await this.backendManager.request(
      `/api/review/sessions/${state.sessionId}/runs/${state.runId}/status`,
      {
        method: "POST",
        body: payload,
      }
    );
    this.#emitRuntimeChanged(state);
  }

  #queueRunEvent(
    state: RunState,
    eventType: string,
    payload: Record<string, unknown>
  ): void {
    const event: RunEvent = {
      event_type: eventType,
      payload,
      created_at: nowIso(),
    };
    state.eventBuffer.push(event);
    state.eventHistory.push(event);
    this.#scheduleFlush(state);
  }

  #scheduleFlush(state: RunState): void {
    if (state.flushTimer) {
      return;
    }

    state.flushTimer = setTimeout(() => {
      state.flushTimer = null;
      void this.#flushBufferedEvents(state);
    }, 150);
  }

  async #flushBufferedEvents(state: RunState): Promise<void> {
    if (!state.eventBuffer.length) {
      return state.flushPromise;
    }

    const events = state.eventBuffer.splice(0, state.eventBuffer.length);
    state.flushPromise = state.flushPromise
      .then(() =>
        this.backendManager.request(
          `/api/review/sessions/${state.sessionId}/runs/${state.runId}/events`,
          {
            method: "POST",
            body: { events },
          }
        )
      )
      .then(() => {
        this.#emitRuntimeChanged(state);
      })
      .catch((error) => {
        this.emit("log", {
          level: "error",
          source: "review-runtime",
          message: sanitizeErrorMessage(error, "Failed to persist review events."),
        });
      });

    return state.flushPromise;
  }

  async #finishCancelled(state: RunState): Promise<void> {
    await this.#updateRunStatus(state, {
      status: "cancelled",
      completed_at: nowIso(),
    });
    this.#queueRunEvent(state, "run_cancelled", {});
    await this.#flushBufferedEvents(state);
    state.completed = true;
    await this.#cleanupRun(state);
  }

  async #failRun(state: RunState, detail: string): Promise<void> {
    if (state.completed) {
      return;
    }

    await this.#updateRunStatus(state, {
      status: state.cancelRequested ? "cancelled" : "failed",
      error_detail: detail,
      review_thread_id: state.reviewThreadId,
      worktree_path: state.worktreePath,
      codex_home_path: state.codexHomePath,
      completed_at: nowIso(),
    });
    this.#queueRunEvent(state, state.cancelRequested ? "run_cancelled" : "run_failed", {
      detail,
    });
    await this.#flushBufferedEvents(state);
    state.completed = true;
    await this.#cleanupRun(state);
  }

  async #cleanupRun(state: RunState): Promise<void> {
    for (const waiter of state.turnWaiters.values()) {
      waiter.reject(new Error("The review run has already finished."));
    }
    state.turnWaiters.clear();
    state.completedTurns.clear();
    await this.#cleanupWorktree(state);
    this.activeRuns.delete(state.runId);
    if (state.baseThreadId) {
      this.threadToRunId.delete(state.baseThreadId);
    }
    if (state.reviewThreadId) {
      this.threadToRunId.delete(state.reviewThreadId);
    }
    this.#emitRuntimeChanged(state);
  }

  async #createWorktree(state: RunState): Promise<Worktree> {
    const repoPath = normalizePath(state.repoPath);
    if (!repoPath) {
      throw new Error("Review worktree could not resolve the repository path.");
    }
    const worktreeRoot = path.join(
      this.configStore.getState().dataDir,
      "review-worktrees",
      state.sessionId,
      state.runId
    );
    const branch = `${REVIEW_BRANCH_PREFIX}/${state.runId}`;

    fs.mkdirSync(path.dirname(worktreeRoot), { recursive: true });
    await execFileAsync("git", ["worktree", "prune"], { cwd: repoPath });
    await execFileAsync("git", ["worktree", "remove", "--force", worktreeRoot], {
      cwd: repoPath,
    }).catch(() => {});
    await execFileAsync("git", ["branch", "-D", branch], { cwd: repoPath }).catch(
      () => {}
    );
    fs.rmSync(worktreeRoot, { recursive: true, force: true });
    await execFileAsync(
      "git",
      ["worktree", "add", "-b", branch, worktreeRoot, state.headHeadSha],
      { cwd: repoPath }
    );

    return {
      path: worktreeRoot,
      branch,
    };
  }

  async #cleanupWorktree(state: RunState): Promise<void> {
    if (!state.worktreePath || !state.worktreeBranch) {
      return;
    }

    const repoPath = normalizePath(state.repoPath);
    if (!repoPath) {
      return;
    }
    await execFileAsync(
      "git",
      ["worktree", "remove", "--force", state.worktreePath],
      { cwd: repoPath }
    ).catch(() => {});
    await execFileAsync("git", ["branch", "-D", state.worktreeBranch], {
      cwd: repoPath,
    }).catch(() => {});
    fs.rmSync(state.worktreePath, { recursive: true, force: true });
  }

  #buildDeveloperInstructions(state: RunState): string {
    const primaryInstruction =
      state.targetMode === "commit"
        ? `Review commit ${state.commitSha || state.headRef} against its first parent ${state.baseRef}.`
        : `Review the current branch against base branch ${state.baseRef}.`;
    const instructionLines = [
      "You are GitOdyssey's Codex review runtime.",
      primaryInstruction,
      "Inspect the repo freely inside this disposable review worktree.",
      "Focus on actionable bugs, regressions, broken control flow, incorrect data/state handling, and missing validation or error handling.",
      "Do not focus on style-only issues or low-signal nits.",
      "Use commands and exploration normally; the desktop app will handle approvals and observability.",
    ];

    this.#appendAppliedInstructions(instructionLines, state.appliedInstructions);

    return instructionLines.join("\n");
  }

  async #primeReviewThread(
    state: RunState,
    client: CodexAppServerClient
  ): Promise<void> {
    const seedTurn = await client.request<TurnStartResponse>("turn/start", {
      threadId: state.baseThreadId,
      input: [
        {
          type: "text",
          text: "Reply exactly with READY.",
          text_elements: [],
        },
      ],
      approvalPolicy: "never",
      approvalsReviewer: "user",
      personality: "pragmatic",
      effort: "low",
      summary: "none",
      sandboxPolicy: {
        type: "readOnly",
        networkAccess: false,
      },
    });

    const seedTurnId = seedTurn.turn.id;
    state.currentTurnId = seedTurnId;
    this.#queueRunEvent(state, "seed_turn_started", {
      thread_id: state.baseThreadId,
      turn_id: state.currentTurnId,
    });

    const completedSeedTurn = await this.#waitForTurn(state, seedTurnId);
    if (state.cancelRequested) {
      return;
    }
    if (completedSeedTurn.status !== "completed") {
      throw new Error(
        this.#formatTurnFailure(
          completedSeedTurn,
          "Codex review thread priming turn failed."
        )
      );
    }

    this.#queueRunEvent(state, "seed_turn_completed", {
      thread_id: state.baseThreadId,
      turn_id: completedSeedTurn.id,
      status: completedSeedTurn.status,
    });
    await this.#flushBufferedEvents(state);
  }

  #buildExtractionInstructions(): string {
    return [
      "Convert the completed review in this thread into structured JSON.",
      "Use only actionable review findings already supported by the completed review context.",
      "Return a concise summary plus findings.",
      "Each finding must include severity, title, body, file_path, new_start, and old_start.",
      "Anchor findings to changed head-side lines only.",
      "If the actual bug depends on an unchanged supporting file, still set file_path and new_start to the triggering changed diff file and line, and explain the supporting file in the body.",
      "If no actionable issues were found, return an empty findings array.",
      "Set partial to false unless the completed review was obviously interrupted or incomplete.",
    ].join("\n");
  }

  #buildReviewTurnInstructions(state: RunState): string {
    const primaryInstruction =
      state.targetMode === "commit"
        ? `Review commit ${state.commitSha || state.headRef} against its first parent ${state.baseRef}.`
        : `Review the current branch against base branch ${state.baseRef}.`;
    const instructionLines = [
      primaryInstruction,
      "This is a code review, not an implementation task.",
      "Focus on actionable bugs, regressions, broken control flow, incorrect data handling, missing validation, and risky behavior changes.",
      "Do not make edits, do not apply fixes, and do not focus on style-only nits.",
      "Start by inspecting the branch diff, then inspect any supporting files needed to confirm impact.",
      "End with a concise prose review summary and concrete findings, if any.",
    ];

    this.#appendAppliedInstructions(instructionLines, state.appliedInstructions);

    return instructionLines.join("\n");
  }

  #buildResultOutputSchema(): Record<string, unknown> {
    return {
      type: "object",
      required: ["summary", "findings", "partial"],
      additionalProperties: false,
      properties: {
        summary: {
          type: "string",
        },
        partial: {
          type: "boolean",
        },
        findings: {
          type: "array",
          items: {
            type: "object",
            required: [
              "severity",
              "title",
              "body",
              "file_path",
              "new_start",
              "old_start",
            ],
            additionalProperties: false,
            properties: {
              severity: {
                type: "string",
                enum: ["high", "medium", "low"],
              },
              title: {
                type: "string",
              },
              body: {
                type: "string",
              },
              file_path: {
                type: "string",
              },
              new_start: {
                anyOf: [{ type: "integer" }, { type: "null" }],
              },
              old_start: {
                anyOf: [{ type: "integer" }, { type: "null" }],
              },
            },
          },
        },
      },
    };
  }

  #extractStructuredResultFromEvents(
    state: RunState,
    extractionTurnId: string
  ): Record<string, unknown> {
    const finalMessage = this.#collectAgentMessageFromEvents(state, extractionTurnId)?.trim();
    if (!finalMessage) {
      throw new Error("The Codex extraction turn did not return a final message.");
    }

    try {
      return JSON.parse(this.#extractJsonObject(finalMessage));
    } catch (error) {
      throw new Error(
        `Failed to parse Codex extraction output as JSON: ${sanitizeErrorMessage(error, "invalid JSON")}`
      );
    }
  }

  #collectAgentMessageFromEvents(
    state: Pick<RunState, "eventHistory"> | Pick<ChatState, "eventHistory">,
    turnId: string
  ): string | null {
    const byItemId = new Map<string, string>();

    for (const event of state.eventHistory) {
      if (event.event_type !== "codex_notification") {
        continue;
      }

      const payload = (event.payload || {}) as Record<string, any>;
      const method = payload.method;
      const params = (payload.params || {}) as Record<string, any>;
      if (params.turnId !== turnId) {
        continue;
      }

      if (method === "item/agentMessage/delta" && params.itemId) {
        byItemId.set(params.itemId, (byItemId.get(params.itemId) || "") + (params.delta || ""));
      }

      if (
        method === "item/completed" &&
        params.item &&
        params.item.type === "agentMessage" &&
        params.item.id
      ) {
        byItemId.set(params.item.id, params.item.text || byItemId.get(params.item.id) || "");
      }
    }

    return Array.from(byItemId.values()).at(-1) || null;
  }

  #extractJsonObject(value: unknown): string {
    const trimmed = String(value || "").trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/i);
    if (fencedMatch) {
      return fencedMatch[1];
    }

    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return trimmed.slice(start, end + 1);
    }

    return trimmed;
  }

  #summarizeApprovalRequest(message: CodexRequestMessage<Record<string, any>>): string {
    if (message.method === "item/commandExecution/requestApproval") {
      return message.params?.command || message.params?.reason || "Command approval requested.";
    }

    if (message.method === "item/fileChange/requestApproval") {
      return message.params?.reason || "Codex wants to apply file changes in the review worktree.";
    }

    if (message.method === "item/permissions/requestApproval") {
      return message.params?.reason || "Codex requested additional permissions.";
    }

    return "Codex requested approval.";
  }

  #buildApprovalResponsePayload(
    request: CodexRequestMessage<Record<string, any>>,
    decision: ReviewApprovalDecision
  ): Record<string, unknown> {
    if (
      request.method === "item/commandExecution/requestApproval" ||
      request.method === "item/fileChange/requestApproval"
    ) {
      if (
        decision === "accept" ||
        decision === "acceptForSession" ||
        decision === "decline" ||
        decision === "cancel"
      ) {
        return { decision };
      }
      throw new Error(`Unsupported approval decision '${decision}'.`);
    }

    if (request.method === "item/permissions/requestApproval") {
      if (decision === "acceptForSession") {
        return {
          permissions: request.params?.permissions ?? {},
          scope: "session",
        };
      }

      if (decision === "accept") {
        return {
          permissions: request.params?.permissions ?? {},
          scope: "turn",
        };
      }

      return {
        permissions: {},
        scope: "turn",
      };
    }

    throw new Error(`Unsupported approval method '${request.method}'.`);
  }

  #decisionToApprovalStatus(decision: ReviewApprovalDecision): string {
    if (decision === "accept") {
      return "accepted";
    }
    if (decision === "acceptForSession") {
      return "accepted_for_session";
    }
    if (decision === "cancel") {
      return "cancelled";
    }
    return "declined";
  }

  #formatTurnFailure(turn: CodexTurn | null | undefined, fallback: string): string {
    const detail = turn?.error?.message || turn?.error?.codexErrorInfo || null;
    if (!detail) {
      return fallback;
    }

    if (typeof detail === "string") {
      return detail;
    }

    return `${fallback} ${JSON.stringify(detail)}`;
  }

  #getActiveThreadId(state: RunState): string | null {
    return state.reviewThreadId || state.baseThreadId || null;
  }

  #isMissingRolloutError(error: unknown): boolean {
    const message = sanitizeErrorMessage(error, "");
    return message.includes("no rollout found for thread id");
  }

  #isMissingThreadError(error: unknown): boolean {
    const message = sanitizeErrorMessage(error, "").toLowerCase();
    return (
      (message.includes("thread") && message.includes("not found")) ||
      message.includes("unknown thread") ||
      message.includes("no thread found")
    );
  }

  #findStateByThreadId(threadId: string): RunState | null {
    const runId = this.threadToRunId.get(threadId);
    if (!runId) {
      return null;
    }

    return this.activeRuns.get(runId) || null;
  }

  #findChatStateByThreadId(threadId: string): ChatState | null {
    const scopeKey = this.threadToChatScopeKey.get(threadId);
    if (!scopeKey) {
      return null;
    }

    return this.chatStates.get(scopeKey) || null;
  }

  #emitRuntimeChanged(state: RunState): void {
    this.emit("state-changed", {
      sessionId: state.sessionId,
      runId: state.runId,
    });
  }
}

export { ReviewRuntimeManager };
