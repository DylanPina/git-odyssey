import fs = require("node:fs");
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";

interface JsonRpcError {
  message?: string;
  [key: string]: unknown;
}

interface JsonRpcSuccessMessage<TResult = unknown> {
  id: number | string;
  result: TResult;
}

interface JsonRpcFailureMessage {
  id: number | string;
  error: JsonRpcError;
}

export interface CodexRequestMessage<TParams = Record<string, unknown>> {
  id: number | string;
  method: string;
  params?: TParams;
}

export interface CodexNotificationMessage<TParams = Record<string, unknown>> {
  method: string;
  params?: TParams;
}

export interface CodexTurn {
  id: string;
  status: string;
  error?: {
    message?: string;
    codexErrorInfo?: unknown;
  };
  [key: string]: unknown;
}

type JsonRpcMessage =
  | JsonRpcSuccessMessage
  | JsonRpcFailureMessage
  | CodexRequestMessage
  | CodexNotificationMessage;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

class CodexAppServerClient extends EventEmitter {
  codexHome: string;
  appVersion: string;
  process: ChildProcessWithoutNullStreams | null;
  buffer: string;
  nextId: number;
  pending: Map<number, PendingRequest>;
  startPromise: Promise<void> | null;

  constructor({ codexHome, appVersion }: { codexHome: string; appVersion?: string }) {
    super();
    this.codexHome = codexHome;
    this.appVersion = appVersion || "0.1.0";
    this.process = null;
    this.buffer = "";
    this.nextId = 1;
    this.pending = new Map();
    this.startPromise = null;
  }

  async start(): Promise<void> {
    if (this.process) {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.#startInternal();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async stop(): Promise<void> {
    const processRef = this.process;
    this.process = null;
    if (!processRef) {
      return;
    }

    await new Promise<void>((resolve) => {
      let finished = false;
      const finalize = () => {
        if (finished) {
          return;
        }
        finished = true;
        resolve();
      };
      processRef.once("exit", finalize);
      processRef.kill();
      setTimeout(finalize, 2000);
    });
  }

  async request<TResult = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<TResult> {
    await this.start();
    const id = this.nextId++;
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise<TResult>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as TResult),
        reject,
      });
      this.#write(payload);
    });
  }

  async respond(id: number | string, result: unknown): Promise<void> {
    await this.start();
    this.#write({
      jsonrpc: "2.0",
      id,
      result,
    });
  }

  async #startInternal(): Promise<void> {
    fs.mkdirSync(this.codexHome, { recursive: true });
    const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
      env: {
        ...process.env,
        CODEX_HOME: this.codexHome,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process = child;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => this.#handleStdout(chunk));
    child.stderr.on("data", (chunk) => this.emit("stderr", String(chunk)));
    child.on("error", (error) => {
      this.#rejectPending(error);
      this.emit("error", error);
    });
    child.on("exit", (code, signal) => {
      this.process = null;
      const error = new Error(
        `Codex app-server exited unexpectedly (${code ?? "null"}/${signal ?? "null"}).`
      );
      this.#rejectPending(error);
      this.emit("exit", { code, signal });
    });

    await this.request("initialize", {
      clientInfo: {
        name: "git-odyssey-desktop",
        version: this.appVersion,
      },
      capabilities: {
        experimentalApi: true,
      },
    });
    this.#write({
      jsonrpc: "2.0",
      method: "initialized",
    });
  }

  #handleStdout(chunk: string | Buffer): void {
    this.buffer += String(chunk);

    while (true) {
      const newlineIndex = this.buffer.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }

      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }

      let message: JsonRpcMessage;
      try {
        message = JSON.parse(line) as JsonRpcMessage;
      } catch (error) {
        this.emit("parse-error", { line, error });
        continue;
      }

      this.#handleMessage(message);
    }
  }

  #handleMessage(message: JsonRpcMessage): void {
    if (
      Object.prototype.hasOwnProperty.call(message, "id") &&
      (Object.prototype.hasOwnProperty.call(message, "result") ||
        Object.prototype.hasOwnProperty.call(message, "error")) &&
      !Object.prototype.hasOwnProperty.call(message, "method")
    ) {
      const responseMessage = message as JsonRpcFailureMessage | JsonRpcSuccessMessage;
      const pending = this.pending.get(responseMessage.id as number);
      if (!pending) {
        return;
      }
      this.pending.delete(responseMessage.id as number);
      if (Object.prototype.hasOwnProperty.call(responseMessage, "error")) {
        pending.reject(
          new Error(
            (responseMessage as JsonRpcFailureMessage).error?.message ||
              "Codex app-server request returned an error."
          )
        );
      } else {
        pending.resolve((responseMessage as JsonRpcSuccessMessage).result);
      }
      return;
    }

    if (
      Object.prototype.hasOwnProperty.call(message, "id") &&
      Object.prototype.hasOwnProperty.call(message, "method")
    ) {
      this.emit("request", message);
      return;
    }

    if (Object.prototype.hasOwnProperty.call(message, "method")) {
      this.emit("notification", message);
    }
  }

  #rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  #write(payload: Record<string, unknown>): void {
    if (!this.process?.stdin) {
      throw new Error("Codex app-server is not running.");
    }

    this.process.stdin.write(`${JSON.stringify(payload)}\n`);
  }
}

export { CodexAppServerClient };
