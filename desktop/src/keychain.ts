import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { AIRuntimeConfig, CredentialStatus, DesktopAiConfigInput } from "./types";

import {
  DEFAULT_OPENAI_PROFILE_ID,
  buildApiKeySecretRef,
  collectSecretRefs,
} from "./ai-config";

const execFileAsync = promisify(execFile);

const LEGACY_OPENAI_ACCOUNT = "openai-api-key";

type KeychainExecError = Error & {
  stderr?: string;
};

function isMissingItemError(error: KeychainExecError): boolean {
  const stderr = error?.stderr ?? "";
  return stderr.includes("could not be found in the keychain");
}

class MacKeychainStore {
  serviceName: string;

  constructor({ serviceName }: { serviceName: string }) {
    this.serviceName = serviceName;
  }

  async #getSecretByAccount(account: string): Promise<string | null> {
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

  async #runSecurity(args: string[]): Promise<string> {
    if (process.platform !== "darwin") {
      throw new Error("The desktop keychain integration currently supports macOS only.");
    }

    const result = await execFileAsync("security", args);
    return result.stdout.trim();
  }

  async getSecret(secretRef: string): Promise<string | null> {
    return this.#getSecretByAccount(secretRef);
  }

  async setSecret(secretRef: string, value: string): Promise<void> {
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

  async migrateLegacySecrets(aiRuntimeConfig: AIRuntimeConfig | null | undefined): Promise<boolean> {
    const defaultSecretRef = buildApiKeySecretRef(DEFAULT_OPENAI_PROFILE_ID);
    const existingScopedSecret = await this.#getSecretByAccount(defaultSecretRef);
    if (existingScopedSecret) {
      return false;
    }

    const legacySecret = await this.#getSecretByAccount(LEGACY_OPENAI_ACCOUNT);
    if (!legacySecret) {
      for (const profile of aiRuntimeConfig?.profiles || []) {
        if (
          profile.provider_type !== "openai" ||
          !profile.api_key_secret_ref ||
          profile.api_key_secret_ref === defaultSecretRef
        ) {
          continue;
        }

        const migratedSecret = await this.#getSecretByAccount(profile.api_key_secret_ref);
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

  async getSecrets(aiRuntimeConfig: AIRuntimeConfig | null | undefined): Promise<Record<string, string>> {
    const secretValues: Record<string, string> = {};
    for (const secretRef of collectSecretRefs(aiRuntimeConfig)) {
      const value = await this.getSecret(secretRef);
      if (value) {
        secretValues[secretRef] = value;
      }
    }
    return secretValues;
  }

  async getCredentialStatus(
    aiRuntimeConfig: AIRuntimeConfig | null | undefined
  ): Promise<CredentialStatus> {
    const secretRefs: Record<string, boolean> = {};
    for (const secretRef of collectSecretRefs(aiRuntimeConfig)) {
      secretRefs[secretRef] = Boolean(await this.getSecret(secretRef));
    }
    return { secretRefs };
  }

  async saveAiConfig(input: DesktopAiConfigInput): Promise<CredentialStatus> {
    for (const [secretRef, value] of Object.entries(input.secretValues ?? {})) {
      if (typeof value === "string" && value.trim()) {
        await this.setSecret(secretRef, value.trim());
      }
    }

    return this.getCredentialStatus(input.config);
  }
}

export { MacKeychainStore };
