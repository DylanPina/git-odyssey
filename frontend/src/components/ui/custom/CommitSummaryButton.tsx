import { useCallback, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Copy, Loader2, Sparkles } from "lucide-react";

import { summarizeCommit } from "@/api/api";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/ui/custom/MarkdownRenderer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type CommitSummaryButtonProps = {
  sha: string;
  summary?: string | null;
  onUpdateSummary?: (sha: string, summary: string) => void;
  compact?: boolean;
};

export function CommitSummaryButton({
  sha,
  summary,
  onUpdateSummary,
  compact = false,
}: CommitSummaryButtonProps) {
  const [isSummarizing, setIsSummarizing] = useState(false);

  const shortSha = useMemo(() => sha.slice(0, 8), [sha]);
  const triggerClassName = cn(
    "nodrag",
    compact && "h-7 w-7 rounded-full p-0 [&_svg]:size-3.5"
  );

  const copyToClipboard = useCallback(async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${type} copied to clipboard`, {
        position: "top-right",
        autoClose: 1800,
        theme: "dark",
      });
    } catch (error) {
      console.error("Failed to copy text:", error);
      toast.error(`Failed to copy ${type.toLowerCase()}`, {
        position: "top-right",
        autoClose: 2600,
        theme: "dark",
      });
    }
  }, []);

  const handleSummarizeCommit = useCallback(async () => {
    try {
      setIsSummarizing(true);
      const summaryText = await summarizeCommit(sha);

      onUpdateSummary?.(sha, summaryText);
      toast.success(`Summary generated for ${shortSha}`, {
        autoClose: 1800,
        theme: "dark",
      });
    } catch (error) {
      console.error("Failed to generate summary:", error);
      toast.error("Failed to generate summary", {
        autoClose: 2600,
        theme: "dark",
      });
    } finally {
      setIsSummarizing(false);
    }
  }, [onUpdateSummary, sha, shortSha]);

  if (summary) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="toolbar"
            size="icon-sm"
            className={triggerClassName}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            aria-label="View summary"
            title="View summary"
          >
            <Sparkles className="commit-summary-icon-active size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="workspace-scrollbar w-[24rem] max-h-[22rem] overflow-y-auto p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-text-primary">Commit Summary</div>
            <Button
              variant="toolbar"
              size="icon-sm"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                void copyToClipboard(summary, "Summary");
              }}
              aria-label="Copy summary"
              title="Copy summary"
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <MarkdownRenderer content={summary} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Button
      variant="toolbar"
      size="icon-sm"
      className={triggerClassName}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        void handleSummarizeCommit();
      }}
      disabled={isSummarizing}
      aria-label="Summarize commit"
      title="Summarize commit"
    >
      {isSummarizing ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Sparkles className="size-4" />
      )}
    </Button>
  );
}
