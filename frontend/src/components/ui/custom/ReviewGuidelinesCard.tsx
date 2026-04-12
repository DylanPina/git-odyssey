import { useEffect, useState, type FormEvent } from "react";
import { Loader2, ScrollText } from "lucide-react";

import { saveDesktopReviewSettings } from "@/api/api";
import { Button } from "@/components/ui/button";
import { InlineBanner } from "@/components/ui/inline-banner";
import { PanelHeader } from "@/components/ui/panel-header";
import { Textarea } from "@/components/ui/textarea";
import type {
  DesktopReviewSettings,
  DesktopSettingsStatus,
} from "@/lib/definitions/desktop";

function buildInitialState(
  desktopSettingsStatus: DesktopSettingsStatus | null | undefined
): DesktopReviewSettings {
  return {
    pullRequestGuidelines:
      desktopSettingsStatus?.reviewSettings.pullRequestGuidelines ?? "",
  };
}

export function ReviewGuidelinesCard({
  desktopSettingsStatus,
}: {
  desktopSettingsStatus: DesktopSettingsStatus | null;
}) {
  const [formState, setFormState] = useState<DesktopReviewSettings>(() =>
    buildInitialState(desktopSettingsStatus)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setFormState(buildInitialState(desktopSettingsStatus));
  }, [desktopSettingsStatus?.reviewSettings.pullRequestGuidelines]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const savedSettings = await saveDesktopReviewSettings({
        pullRequestGuidelines: formState.pullRequestGuidelines,
      });
      setFormState(savedSettings);
      setFeedback(
        "App-wide review guidelines saved. They will be prepended to future review runs."
      );
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "Failed to save app-wide review guidelines.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="workspace-panel-elevated space-y-5 p-5 sm:p-6">
      <PanelHeader
        eyebrow="Review Guidelines"
        title="App-wide pull request guidance"
        description="These rules are applied to every Codex review before any repo-specific guidance or one-off run notes."
      />

      {error ? <InlineBanner tone="danger" title={error} /> : null}
      {feedback ? <InlineBanner tone="success" title={feedback} /> : null}

      <form className="space-y-4" onSubmit={handleSave}>
        <label className="space-y-1.5 text-sm text-text-secondary">
          <span className="flex items-center gap-2 text-text-primary">
            <ScrollText className="size-4 text-text-tertiary" />
            App-wide review guidelines
          </span>
          <Textarea
            value={formState.pullRequestGuidelines}
            onChange={(event) =>
              setFormState({
                pullRequestGuidelines: event.target.value,
              })
            }
            placeholder="Example: Prioritize auth, permission, and data-loss regressions. Ignore style-only nits."
            className="min-h-32"
          />
          <p className="text-xs leading-5 text-text-tertiary">
            Leave this blank to use GitOdyssey&apos;s default review behavior unless
            repo-specific guidance or run notes are provided.
          </p>
        </label>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="accent" disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving
              </>
            ) : (
              "Save Review Guidelines"
            )}
          </Button>
        </div>
      </form>
    </section>
  );
}

export default ReviewGuidelinesCard;
