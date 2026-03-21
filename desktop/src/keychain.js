const { execFile } = require("child_process");
const { promisify } = require("util");
const {
  DEFAULT_OPENAI_PROFILE_ID,
  buildApiKeySecretRef,
  collectSecretRefs,
} = require("./ai-config");

const execFileAsync = promisify(execFile);

const LEGACY_OPENAI_ACCOUNT = "openai-api-key";

function isMissingItemError(error) {
  const stderr = error?.stderr ?? "";
  return stderr.includes("could not be found in the keychain");
}

class MacKeychainStore {
  constructor({ serviceName }) {
    this.serviceName = serviceName;
  }

  async #getSecretByAccount(account) {
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

  async #runSecurity(args) {
    if (process.platform !== "darwin") {
      throw new Error("The desktop keychain integration currently supports macOS only.");
    }

    const result = await execFileAsync("security", args);
    return result.stdout.trim();
  }

  async getSecret(secretRef) {
    return this.#getSecretByAccount(secretRef);
  }

  async setSecret(secretRef, value) {
    await this.#runSecurity([
      "add-generic-password",
      "-U",
      "-s",
      this.serviceName,
      "-a",
      secretRef,
      "-w",
      value,
    ]);
  }

  async migrateLegacySecrets(aiRuntimeConfig) {
    const defaultSecretRef = buildApiKeySecretRef(DEFAULT_OPENAI_PROFILE_ID);
    const existingScopedSecret = await this.#getSecretByAccount(defaultSecretRef);
    if (existingScopedSecret) {
      return false;
    }

    const legacySecret = await this.#getSecretByAccount(LEGACY_OPENAI_ACCOUNT);
    if (!legacySecret) {
      for (const profile of aiRuntimeConfig?.profiles || []) {
        if (
          profile?.provider_type !== "openai" ||
          !profile.api_key_secret_ref ||
          profile.api_key_secret_ref === defaultSecretRef
        ) {
          continue;
        }

        const migratedSecret = await this.#getSecretByAccount(
          profile.api_key_secret_ref
        );
        if (!migratedSecret) {
          continue;
        }

        await this.setSecret(defaultSecretRef, migratedSecret);
        return true;
      }

      return false;
    }

    await this.setSecret(defaultSecretRef, legacySecret);
    return true;
  }

  async getSecrets(aiRuntimeConfig) {
    const secretValues = {};
    for (const secretRef of collectSecretRefs(aiRuntimeConfig)) {
      const value = await this.getSecret(secretRef);
      if (value) {
        secretValues[secretRef] = value;
      }
    }
    return secretValues;
  }

  async getCredentialStatus(aiRuntimeConfig) {
    const secretRefs = {};
    for (const secretRef of collectSecretRefs(aiRuntimeConfig)) {
      secretRefs[secretRef] = Boolean(await this.getSecret(secretRef));
    }
    return { secretRefs };
  }

  async saveAiConfig(input) {
    for (const [secretRef, value] of Object.entries(input.secretValues ?? {})) {
      if (typeof value === "string" && value.trim()) {
        await this.setSecret(secretRef, value.trim());
      }
    }

    return this.getCredentialStatus(input.config);
  }
}

module.exports = {
  MacKeychainStore,
};
