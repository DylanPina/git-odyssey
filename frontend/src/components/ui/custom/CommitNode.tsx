import { Handle, Position } from "@xyflow/react";
import { toast } from "react-toastify";
import { memo, useCallback, useMemo, useState } from "react";
import { Copy, Loader2, Sparkles } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { summarizeCommit } from "@/api/api";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { MarkdownRenderer } from "@/components/ui/custom/MarkdownRenderer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { buildCommitRoute, readRepoPathFromSearchParams } from "@/lib/repoPaths";

function CommitNode(props: {
  data: {
    sha: string;
    message: string;
    author?: string | null;
    time?: number;
    summary?: string | null;
    onUpdateSummary?: (sha: string, summary: string) => void;
  };
  selected?: boolean;
}) {
  const { sha, message, author, time, summary, onUpdateSummary } = props.data;
  const [isSummarizing, setIsSummarizing] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const repoPath = readRepoPathFromSearchParams(searchParams);

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

  const formattedTime = useMemo(() => {
    if (!time) return null;
    const date = new Date(time * 1000);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [time]);

  const handleSummarizeCommit = useCallback(async () => {
    try {
      setIsSummarizing(true);
      const summaryText = await summarizeCommit(sha);

      onUpdateSummary?.(sha, summaryText);
      toast.success(`Summary generated for ${sha.slice(0, 8)}`, {
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
  }, [onUpdateSummary, sha]);

  const handleOpenCommitDiff = useCallback(() => {
    if (!repoPath) {
      return;
    }
    navigate(buildCommitRoute(repoPath, sha));
  }, [navigate, repoPath, sha]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="commit-node-card group relative flex min-h-[118px] flex-col gap-3 rounded-[14px] border border-border-subtle bg-surface px-4 py-3 shadow-[0_12px_26px_rgba(0,0,0,0.18)] transition-[border-color,box-shadow,background-color] duration-150">
          <div className="flex min-h-9 items-center justify-between gap-3">
            <button
              type="button"
              className="shrink-0 font-mono text-xs leading-none text-text-secondary transition-colors hover:text-text-primary"
              onClick={() => void copyToClipboard(sha, "SHA")}
              title="Copy SHA"
            >
              {sha.slice(0, 8)}
            </button>

            <div className="flex shrink-0 items-center gap-2">
              {formattedTime ? (
                <span className="font-mono text-[11px] leading-none text-text-tertiary">
                  {formattedTime}
                </span>
              ) : null}

              {summary ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="toolbar"
                      size="icon-sm"
                      aria-label="View summary"
                      title="View summary"
                    >
                      <Sparkles className="size-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="workspace-scrollbar w-[24rem] max-h-[22rem] overflow-y-auto p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-text-primary">
                        Commit Summary
                      </div>
                      <Button
                        variant="toolbar"
                        size="icon-sm"
                        onClick={() => void copyToClipboard(summary, "Summary")}
                        aria-label="Copy summary"
                        title="Copy summary"
                      >
                        <Copy className="size-4" />
                      </Button>
                    </div>
                    <MarkdownRenderer content={summary} />
                  </PopoverContent>
                </Popover>
              ) : (
                <Button
                  variant="toolbar"
                  size="icon-sm"
                  onClick={() => void handleSummarizeCommit()}
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
              )}
            </div>
          </div>

          <button
            type="button"
            className="line-clamp-3 text-left text-sm font-medium leading-6 text-text-primary transition-colors hover:text-white"
            onClick={() => void copyToClipboard(message, "Message")}
            title="Copy commit message"
          >
            {message}
          </button>

          <div className="mt-auto flex items-center justify-between gap-3 text-[11px]">
            <span className="truncate text-text-tertiary">
              {author || "Unknown author"}
            </span>
            {summary ? (
              <span className="inline-flex items-center gap-1 text-[#c7d8ff]">
                <Sparkles className="size-3" />
                Summary ready
              </span>
            ) : null}
          </div>

          <Handle type="source" position={Position.Bottom} />
          <Handle type="target" position={Position.Top} />
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-[200px]">
        <ContextMenuItem onClick={handleOpenCommitDiff}>
          Open Commit Diff
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export default memo(CommitNode);
