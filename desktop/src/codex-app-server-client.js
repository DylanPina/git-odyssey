const fs = require("fs");
const { EventEmitter } = require("events");
const { spawn } = require("child_process");

class CodexAppServerClient extends EventEmitter {
  constructor({ codexHome, appVersion }) {
    super();
    this.codexHome = codexHome;
    this.appVersion = appVersion || "0.1.0";
    this.process = null;
    this.buffer = "";
    this.nextId = 1;
    this.pending = new Map();
    this.startPromise = null;
  }

  async start() {
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

  async stop() {
    const processRef = this.process;
    this.process = null;
    if (!processRef) {
      return;
    }

    await new Promise((resolve) => {
      const finalize = () => resolve();
      processRef.once("exit", finalize);
      processRef.kill();
      setTimeout(finalize, 2000);
    });
  }

  async request(method, params) {
    await this.start();
    const id = this.nextId++;
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.#write(payload);
    });
  }

  async respond(id, result) {
    await this.start();
    this.#write({
      jsonrpc: "2.0",
      id,
      result,
    });
  }

  async #startInternal() {
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

  #handleStdout(chunk) {
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

      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        this.emit("parse-error", { line, error });
        continue;
      }

      this.#handleMessage(message);
    }
  }

  #handleMessage(message) {
    if (
      Object.prototype.hasOwnProperty.call(message, "id") &&
      (Object.prototype.hasOwnProperty.call(message, "result") ||
        Object.prototype.hasOwnProperty.call(message, "error")) &&
      !Object.prototype.hasOwnProperty.call(message, "method")
    ) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      if (Object.prototype.hasOwnProperty.call(message, "error")) {
        pending.reject(
          new Error(
            message.error?.message || "Codex app-server request returned an error."
          )
        );
      } else {
        pending.resolve(message.result);
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

  #rejectPending(error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  #write(payload) {
    if (!this.process?.stdin) {
      throw new Error("Codex app-server is not running.");
    }

    this.process.stdin.write(`${JSON.stringify(payload)}\n`);
  }
}

module.exports = {
  CodexAppServerClient,
};
