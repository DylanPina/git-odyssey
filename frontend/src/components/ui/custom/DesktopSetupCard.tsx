import { useState, type FormEvent } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { saveDesktopCredentials } from "@/api/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  DesktopHealthStatus,
  DesktopSettingsStatus,
} from "@/lib/definitions/desktop";

type DesktopSetupCardProps = {
  desktopSettingsStatus: DesktopSettingsStatus | null;
  desktopHealth: DesktopHealthStatus | null;
  onCredentialsSaved: () => Promise<void>;
};

type HealthPillProps = {
  label: string;
  value: string;
  healthy: boolean;
};

function HealthPill({ label, value, healthy }: HealthPillProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left">
      <div className="text-xs uppercase tracking-[0.2em] text-white/40">
        {label}
      </div>
      <div className={healthy ? "text-emerald-300" : "text-amber-300"}>
        {value}
      </div>
    </div>
  );
}

export function DesktopSetupCard({
  desktopSettingsStatus,
  desktopHealth,
  onCredentialsSaved,
}: DesktopSetupCardProps) {
  const [openAiApiKey, setOpenAiApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setFeedback(null);

    try {
      await saveDesktopCredentials({
        openAiApiKey,
      });
      setOpenAiApiKey("");
      setFeedback("OpenAI key saved to the macOS keychain. Starting local services...");
      await onCredentialsSaved();
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "Failed to save desktop credentials.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto rounded-3xl border border-white/15 bg-slate-950/60 p-6 text-left shadow-2xl backdrop-blur-xl">
      <div className="mb-4">
        <div className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">
          Local Desktop Setup
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-white">
          Store your OpenAI key locally
        </h2>
        <p className="mt-2 text-sm text-white/60">
          Desktop mode keeps your OpenAI key in the macOS keychain while the app
          state stays on this machine.
        </p>
      </div>

      <form className="space-y-3" onSubmit={handleSave}>
        <Input
          type="password"
          value={openAiApiKey}
          onChange={(event) => setOpenAiApiKey(event.target.value)}
          placeholder="OpenAI API key"
          disabled={isSaving}
        />
        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <Button
            type="submit"
            disabled={isSaving || !openAiApiKey}
            className="bg-cyan-500 text-slate-950 hover:bg-cyan-300"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving
              </>
            ) : (
              "Save And Start"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void onCredentialsSaved()}
            className="border-white/20 bg-transparent text-white hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh Health
          </Button>
        </div>
      </form>

      {feedback && <p className="mt-4 text-sm text-emerald-300">{feedback}</p>}
      {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <HealthPill
          label="OpenAI Key"
          value={
            desktopSettingsStatus?.hasOpenAiApiKey ? "Saved locally" : "Missing"
          }
          healthy={Boolean(desktopSettingsStatus?.hasOpenAiApiKey)}
        />
        <HealthPill
          label="Backend"
          value={desktopHealth?.backend.state ?? "unavailable"}
          healthy={desktopHealth?.backend.state === "running"}
        />
        <HealthPill
          label="Postgres"
          value={desktopHealth?.postgres.state ?? "unavailable"}
          healthy={desktopHealth?.postgres.state === "running"}
        />
      </div>

      {(desktopHealth?.backend.message || desktopHealth?.postgres.message) && (
        <div className="mt-4 space-y-2 text-sm text-white/55">
          {desktopHealth?.backend.message && (
            <p>Backend: {desktopHealth.backend.message}</p>
          )}
          {desktopHealth?.postgres.message && (
            <p>Postgres: {desktopHealth.postgres.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
