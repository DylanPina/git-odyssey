import { Handle, Position } from "@xyflow/react";
import { Tooltip } from "react-tooltip";
import { toast } from "react-toastify";
import { useCallback, useMemo, useState, memo } from "react";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui/context-menu";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { summarizeCommit } from "@/api/api";
import Lottie from "lottie-react";
import aiIcon from "@/assets/ai-icon.json";
import { Loader2, Sparkles, Copy } from "lucide-react";
import { MarkdownRenderer } from "@/components/ui/custom/MarkdownRenderer";

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
  const selected = props.selected;
  const [isSummarizing, setIsSummarizing] = useState(false);
  const navigate = useNavigate();

  // Calculate dynamic text size based on message length
  const getMessageStyles = useCallback(() => {
    if (!author) return { textSize: "text-sm" };
    
    // Shrink text for longer messages to fit better
    if (message.length > 100) {
      return { textSize: "text-xs" }; // Smaller text for long messages
    }
    return { textSize: "text-sm" }; // Normal text for shorter messages
  }, [message, author]);

  const copyToClipboard = useCallback(async (text: string, type: "SHA" | "Message" | "Summary") => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${type} copied to clipboard`, {
        position: "top-right",
        autoClose: 2000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        theme: "dark",
      });
    } catch (err) {
      console.error("Failed to copy text: ", err);
      toast.error(`Failed to copy ${type.toLowerCase()}`, {
        position: "top-right",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
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

  const handleShaClick = useCallback(() => {
    copyToClipboard(sha, "SHA");
  }, [sha, copyToClipboard]);

  const handleMessageClick = useCallback(() => {
    copyToClipboard(message, "Message");
  }, [message, copyToClipboard]);

  const handleSummarizeCommit = useCallback(async () => {
    try {
      setIsSummarizing(true);
      toast.info(`Generating summary for ${sha.slice(0, 8)}...`, {
        position: "top-right",
        autoClose: 2000,
        theme: "dark",
      });

      const summaryText = await summarizeCommit(sha);

      if (onUpdateSummary) {
        onUpdateSummary(sha, summaryText);
      }

      toast.success(`Summary generated for ${sha.slice(0, 8)}!`, {
        position: "top-right",
        autoClose: 2000,
        theme: "dark",
      });
    } catch (error) {
      console.error("Failed to generate summary:", error);
      toast.error("Failed to generate summary", {
        position: "top-right",
        autoClose: 3000,
        theme: "dark",
      });
    } finally {
      setIsSummarizing(false);
    }
  }, [sha, onUpdateSummary]);

  const handleCopySummary = useCallback(() => {
    if (!summary) return;
    copyToClipboard(summary, "Summary");
  }, [summary, copyToClipboard]);

  const handleOpenCommitDiff = useCallback(() => {
    // Navigate relative to current repo route
    navigate(`commit/${sha}`);
  }, [navigate, sha]);

  return (
    <>
      <div className={`sparkle gradient ${summary ? "!opacity-100" : ""}`}>
        {summary ? (
          <Popover>
            <PopoverTrigger asChild>
              <div
                className="cursor-pointer w-full h-full flex items-center justify-center"
                data-tooltip-id={`sparkle-${sha}`}
                data-tooltip-content="View Summary"
              >
                <Sparkles className="w-4 h-4 text-white" />
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-150 max-h-96 overflow-y-auto bg-neutral-800/95 backdrop-blur-sm border-white/20 text-white relative">
              <button
                className="absolute top-2 right-2 flex items-center justify-center rounded hover:bg-white/10 text-white/80 hover:text-white cursor-pointer"
                aria-label="Copy summary"
                data-tooltip-id={`copy-summary-${sha}`}
                data-tooltip-content="Copy summary"
                onClick={handleCopySummary}
              >
                <Copy className="w-4 h-4 text-white" />
              </button>
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-white/90">Commit Summary</h4>
                <MarkdownRenderer content={summary as string} />
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <div
            data-tooltip-id={`sparkle-${sha}`}
            data-tooltip-content={isSummarizing ? "Generating summary..." : "Generate summary"}
          >
            {isSummarizing ? (
              <div
                className="flex items-center justify-center"
                aria-label="Generating summary"
                aria-busy="true"
                role="status"
              >
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </div>
            ) : (
              <Lottie
                animationData={aiIcon}
                loop={true}
                autoplay={true}
                style={{ width: 30, height: 30 }}
                onClick={handleSummarizeCommit}
              />
            )}
          </div>
        )}
      </div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className={`wrapper gradient ${selected ? "selected" : ""}`}>
            <div className="inner  max-w-[350px] min-w-[200px]">
              <span className="flex gap-2">
                <div
                  className="absolute top-2 left-4 text-[10px] text-white font-bold cursor-pointer"
                  data-tooltip-id={`sha-${sha}`}
                  data-tooltip-content={sha}
                  onClick={handleShaClick}
                >
                  {sha.slice(0, 8)}
                </div>
                {formattedTime && (
                  <div className="absolute top-2 right-4 text-[10px] text-white/50">
                    {formattedTime}
                  </div>
                )}
              </span>
              <span
                className={`font-medium cursor-pointer rounded transition-colors mt-3 break-words ${getMessageStyles().textSize} ${author ? "pb-6" : ""} ${selected ? "" : "line-clamp-2"}`}
                data-tooltip-id={`msg-${sha}`}
                data-tooltip-content={message}
                onClick={handleMessageClick}
              >
                {message}
              </span>
              {author && (
                <div className="absolute bottom-2 right-4 text-[10px] text-white font-medium bg-black/50 px-1 py-0.5 rounded">
                  {author}
                </div>
              )}
              <Handle type="source" position={Position.Bottom} />
              <Handle type="target" position={Position.Top} />
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-[200px] p-2">
          <ContextMenuItem onClick={handleOpenCommitDiff}>Open Commit Diff</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <Tooltip id={`sparkle-${sha}`} place="top" className="max-w-xs" delayShow={800} />
      <Tooltip id={`copy-summary-${sha}`} place="top" className="max-w-xs" delayShow={500} />
    </>
  );
}

export default memo(CommitNode);
