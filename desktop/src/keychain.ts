import type { AIRuntimeConfig, CredentialStatus, DesktopAiConfigInput } from "./types";

class MacKeychainStore {
  serviceName: string;

  constructor({ serviceName }: { serviceName: string }) {
    this.serviceName = serviceName;
  }

  async getSecret(_secretRef: string): Promise<string | null> {
    return null;
  }

  async setSecret(_secretRef: string, _value: string): Promise<void> {
    return;
  }

  async migrateLegacySecrets(
    _aiRuntimeConfig: AIRuntimeConfig | null | undefined
  ): Promise<boolean> {
    return false;
  }

  async getSecrets(
    _aiRuntimeConfig: AIRuntimeConfig | null | undefined
  ): Promise<Record<string, string>> {
    return {};
  }

  async getCredentialStatus(
    _aiRuntimeConfig: AIRuntimeConfig | null | undefined
  ): Promise<CredentialStatus> {
    return { secretRefs: {} };
  }

  async saveAiConfig(input: DesktopAiConfigInput): Promise<CredentialStatus> {
    return this.getCredentialStatus(input.config);
  }
}

export { MacKeychainStore };
