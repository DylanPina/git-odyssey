const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const ACCOUNTS = {
  openAiApiKey: "openai-api-key",
};

function isMissingItemError(error) {
  const stderr = error?.stderr ?? "";
  return stderr.includes("could not be found in the keychain");
}

class MacKeychainStore {
  constructor({ serviceName }) {
    this.serviceName = serviceName;
  }

  async #runSecurity(args) {
    if (process.platform !== "darwin") {
      throw new Error("The desktop keychain integration currently supports macOS only.");
    }

    const result = await execFileAsync("security", args);
    return result.stdout.trim();
  }

  async getSecret(account) {
    try {
      return await this.#runSecurity([
        "find-generic-password",
        "-s",
        this.serviceName,
        "-a",
        account,
        "-w",
      ]);
    } catch (error) {
      if (isMissingItemError(error)) {
        return null;
      }

      throw error;
    }
  }

  async setSecret(account, value) {
    await this.#runSecurity([
      "add-generic-password",
      "-U",
      "-s",
      this.serviceName,
      "-a",
      account,
      "-w",
      value,
    ]);
  }

  async getCredentials() {
    const openAiApiKey = await this.getSecret(ACCOUNTS.openAiApiKey);

    return {
      openAiApiKey,
    };
  }

  async getCredentialStatus() {
    const credentials = await this.getCredentials();

    return {
      hasOpenAiApiKey: Boolean(credentials.openAiApiKey),
    };
  }

  async saveCredentials(input) {
    if (input.openAiApiKey) {
      await this.setSecret(ACCOUNTS.openAiApiKey, input.openAiApiKey);
    }

    return this.getCredentialStatus();
  }
}

module.exports = {
  MacKeychainStore,
};
