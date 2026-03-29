import { Handle, Position } from "@xyflow/react";
import { memo, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { CommitSummaryButton } from "@/components/ui/custom/CommitSummaryButton";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useClipboardToast } from "@/hooks/useClipboardToast";
import {
	formatCommitTimestamp,
	getCommitAuthorLabel,
} from "@/lib/commitPresentation";
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const repoPath = readRepoPathFromSearchParams(searchParams);
  const copyToClipboard = useClipboardToast();

  const formattedTime = useMemo(() => {
    return formatCommitTimestamp(
      time,
      {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      },
      "",
    );
  }, [time]);

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
              className="nodrag shrink-0 font-mono text-xs leading-none text-text-secondary transition-colors hover:text-text-primary"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                void copyToClipboard(sha, "SHA");
              }}
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

              <CommitSummaryButton
                sha={sha}
                summary={summary}
                onUpdateSummary={onUpdateSummary}
              />
            </div>
          </div>

          <button
            type="button"
            className="nodrag line-clamp-3 text-left text-sm font-medium leading-6 text-text-primary transition-colors hover:text-white"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              void copyToClipboard(message, "Message");
            }}
            title="Copy commit message"
          >
            {message}
          </button>

          <div className="mt-auto flex items-center gap-3 text-[11px]">
            <span className="truncate text-text-tertiary">
              {getCommitAuthorLabel(author)}
            </span>
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
