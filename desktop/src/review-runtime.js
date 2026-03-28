const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");
const { execFile, spawn } = require("child_process");
const { promisify } = require("util");

const { CodexAppServerClient } = require("./codex-app-server-client");
const { getProfileById } = require("./ai-config");
const { normalizePath } = require("./git-projects");

const execFileAsync = promisify(execFile);
const REVIEW_BRANCH_PREFIX = "git-odyssey-review";

function nowIso() {
  return new Date().toISOString();
}

function sanitizeErrorMessage(error, fallback) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

async function execFileWithInput(command, args, options = {}, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["pipe", "pipe", "pipe"],
    });

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
  constructor({ app, backendManager, configStore, keychain }) {
    super();
    this.app = app;
    this.backendManager = backendManager;
    this.configStore = configStore;
    this.keychain = keychain;
    this.activeRuns = new Map();
    this.threadToRunId = new Map();
    this.codexClient = null;
    this.codexClientHome = null;
  }

  async startRun(input) {
    const sessionId = String(input.sessionId || "").trim();
    if (!sessionId) {
      throw new Error("A review session id is required.");
    }

    const session = await this.backendManager.request(`/api/review/sessions/${sessionId}`);
    const run = await this.backendManager.request(
      `/api/review/sessions/${sessionId}/runs`,
      {
        method: "POST",
        body: {
          engine: "codex_cli",
          mode: "native_review",
          custom_instructions: input.customInstructions ?? null,
        },
      }
    );

    const state = {
      sessionId,
      runId: run.id,
      repoPath: session.repo_path,
      baseRef: session.base_ref,
      headRef: session.head_ref,
      headHeadSha: session.head_head_sha,
      customInstructions: input.customInstructions ?? null,
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

  async cancelRun(input) {
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

  async respondToApproval(input) {
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
    await this.codexClient.respond(approval.request.id, responsePayload);
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

  async dispose() {
    if (this.codexClient) {
      await this.codexClient.stop();
      this.codexClient = null;
      this.codexClientHome = null;
    }
  }

  async #runReview(state) {
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
    const thread = await client.request("thread/start", {
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

    let reviewThreadId = null;
    let reviewTurnId = null;
    let reviewMode = "native_review";
    try {
      const reviewStart = await client.request("review/start", {
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

      const reviewTurn = await client.request("turn/start", {
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

    const reviewTurn = await this.#waitForTurn(state, state.currentTurnId);
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

    const extraction = await client.request("turn/start", {
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

    state.currentTurnId = extraction.turn.id;
    this.#queueRunEvent(state, "extraction_turn_started", {
      turn_id: state.currentTurnId,
    });
    const extractionTurn = await this.#waitForTurn(state, state.currentTurnId);
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
      state.currentTurnId
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

  async #ensureCodexRuntime() {
    const desktopState = this.configStore.getState();
    const aiRuntimeConfig = desktopState.aiRuntimeConfig;
    const binding = aiRuntimeConfig?.capabilities?.text_generation;
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
            model: binding.model_id || "gpt-5.4-mini",
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
      model: binding?.model_id || null,
      modelProvider: null,
    };
  }

  async #ensureCodexClient(codexHome) {
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

  async #handleCodexExit() {
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
  }

  async #handleCodexNotification(message) {
    const threadId = message.params?.threadId;
    const state = threadId ? this.#findStateByThreadId(threadId) : null;
    if (!state) {
      return;
    }

    this.#queueRunEvent(state, "codex_notification", {
      method: message.method,
      params: message.params,
    });

    if (message.method === "turn/completed") {
      const turnId = message.params?.turn?.id;
      const waiter = turnId ? state.turnWaiters.get(turnId) : null;
      if (waiter) {
        state.turnWaiters.delete(turnId);
        waiter.resolve(message.params.turn);
      } else if (turnId) {
        state.completedTurns.set(turnId, message.params.turn);
      }
    }

    this.#scheduleFlush(state);
  }

  async #handleCodexRequest(message) {
    const threadId = message.params?.threadId;
    const state = threadId ? this.#findStateByThreadId(threadId) : null;
    if (!state) {
      await this.#resolveUnknownRequest(message);
      return;
    }

    const approvalId = `review_approval_${state.runId}_${String(message.id)}`;
    const summary = this.#summarizeApprovalRequest(message);
    state.pendingApprovals.set(approvalId, {
      request: message,
      summary,
    });

    this.#queueRunEvent(state, "codex_request", {
      request_id: String(message.id),
      method: message.method,
      params: message.params,
      approval_id: approvalId,
    });
    await this.backendManager.request(
      `/api/review/sessions/${state.sessionId}/runs/${state.runId}/approvals`,
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
    this.#emitRuntimeChanged(state);
  }

  async #resolveUnknownRequest(message) {
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

  #waitForTurn(state, turnId) {
    const completedTurn = state.completedTurns.get(turnId);
    if (completedTurn) {
      state.completedTurns.delete(turnId);
      return Promise.resolve(completedTurn);
    }

    return new Promise((resolve, reject) => {
      state.turnWaiters.set(turnId, { resolve, reject });
    });
  }

  async #updateRunStatus(state, payload) {
    await this.backendManager.request(
      `/api/review/sessions/${state.sessionId}/runs/${state.runId}/status`,
      {
        method: "POST",
        body: payload,
      }
    );
    this.#emitRuntimeChanged(state);
  }

  #queueRunEvent(state, eventType, payload) {
    const event = {
      event_type: eventType,
      payload,
      created_at: nowIso(),
    };
    state.eventBuffer.push(event);
    state.eventHistory.push(event);
    this.#scheduleFlush(state);
  }

  #scheduleFlush(state) {
    if (state.flushTimer) {
      return;
    }

    state.flushTimer = setTimeout(() => {
      state.flushTimer = null;
      void this.#flushBufferedEvents(state);
    }, 150);
  }

  async #flushBufferedEvents(state) {
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

  async #finishCancelled(state) {
    await this.#updateRunStatus(state, {
      status: "cancelled",
      completed_at: nowIso(),
    });
    this.#queueRunEvent(state, "run_cancelled", {});
    await this.#flushBufferedEvents(state);
    state.completed = true;
    await this.#cleanupRun(state);
  }

  async #failRun(state, detail) {
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

  async #cleanupRun(state) {
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

  async #createWorktree(state) {
    const repoPath = normalizePath(state.repoPath);
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

  async #cleanupWorktree(state) {
    if (!state.worktreePath || !state.worktreeBranch) {
      return;
    }

    const repoPath = normalizePath(state.repoPath);
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

  #buildDeveloperInstructions(state) {
    const instructionLines = [
      "You are GitOdyssey's Codex review runtime.",
      `Review the current branch against base branch ${state.baseRef}.`,
      "Inspect the repo freely inside this disposable review worktree.",
      "Focus on actionable bugs, regressions, broken control flow, incorrect data/state handling, and missing validation or error handling.",
      "Do not focus on style-only issues or low-signal nits.",
      "Use commands and exploration normally; the desktop app will handle approvals and observability.",
    ];

    if (state.customInstructions && String(state.customInstructions).trim()) {
      instructionLines.push(`Additional review instructions: ${state.customInstructions.trim()}`);
    }

    return instructionLines.join("\n");
  }

  async #primeReviewThread(state, client) {
    const seedTurn = await client.request("turn/start", {
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

    state.currentTurnId = seedTurn.turn.id;
    this.#queueRunEvent(state, "seed_turn_started", {
      thread_id: state.baseThreadId,
      turn_id: state.currentTurnId,
    });

    const completedSeedTurn = await this.#waitForTurn(state, state.currentTurnId);
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

  #buildExtractionInstructions() {
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

  #buildReviewTurnInstructions(state) {
    const instructionLines = [
      `Review the current branch against base branch ${state.baseRef}.`,
      "This is a code review, not an implementation task.",
      "Focus on actionable bugs, regressions, broken control flow, incorrect data handling, missing validation, and risky behavior changes.",
      "Do not make edits, do not apply fixes, and do not focus on style-only nits.",
      "Start by inspecting the branch diff, then inspect any supporting files needed to confirm impact.",
      "End with a concise prose review summary and concrete findings, if any.",
    ];

    if (state.customInstructions && String(state.customInstructions).trim()) {
      instructionLines.push(`Additional review instructions: ${state.customInstructions.trim()}`);
    }

    return instructionLines.join("\n");
  }

  #buildResultOutputSchema() {
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

  #extractStructuredResultFromEvents(state, extractionTurnId) {
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

  #collectAgentMessageFromEvents(state, turnId) {
    const byItemId = new Map();

    for (const event of state.eventHistory) {
      if (event.event_type !== "codex_notification") {
        continue;
      }

      const payload = event.payload || {};
      const method = payload.method;
      const params = payload.params || {};
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

  #extractJsonObject(value) {
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

  #summarizeApprovalRequest(message) {
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

  #buildApprovalResponsePayload(request, decision) {
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

  #decisionToApprovalStatus(decision) {
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

  #formatTurnFailure(turn, fallback) {
    const detail = turn?.error?.message || turn?.error?.codexErrorInfo || null;
    if (!detail) {
      return fallback;
    }

    if (typeof detail === "string") {
      return detail;
    }

    return `${fallback} ${JSON.stringify(detail)}`;
  }

  #getActiveThreadId(state) {
    return state.reviewThreadId || state.baseThreadId || null;
  }

  #isMissingRolloutError(error) {
    const message = sanitizeErrorMessage(error, "");
    return message.includes("no rollout found for thread id");
  }

  #findStateByThreadId(threadId) {
    const runId = this.threadToRunId.get(threadId);
    if (!runId) {
      return null;
    }

    return this.activeRuns.get(runId) || null;
  }

  #emitRuntimeChanged(state) {
    this.emit("state-changed", {
      sessionId: state.sessionId,
      runId: state.runId,
    });
  }
}

module.exports = {
  ReviewRuntimeManager,
};
