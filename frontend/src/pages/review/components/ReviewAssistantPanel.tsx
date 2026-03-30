import {
	Maximize2,
	MessageCircle,
	Minimize2,
	PanelRightOpen,
	Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ReviewChatReferenceTarget } from "@/components/ui/custom/MarkdownRenderer";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ReviewChatPanel } from "@/pages/review/components/ReviewChatPanel";
import { ReviewInsightsPanel } from "@/pages/review/components/ReviewInsightsPanel";
import type { ChatCodeContext, ChatMessage } from "@/lib/definitions/chat";
import type {
	ReviewFinding,
	ReviewResult,
	ReviewRun,
} from "@/lib/definitions/review";
import type {
	ReasoningTraceEntry,
	ReviewAssistantTab,
} from "@/pages/review/review-types";
import { cn } from "@/lib/utils";

type ReviewAssistantPanelProps = {
	activeTab: ReviewAssistantTab;
	onActiveTabChange: (tab: ReviewAssistantTab) => void;
	activeRun: ReviewRun | null;
	reviewResult: ReviewResult | null;
	findingsLabel: string;
	selectedFindingId: string | null;
	onSelectFinding: (finding: ReviewFinding) => void;
	canNavigateToFinding: (finding: ReviewFinding) => boolean;
	reasoningTrace: ReasoningTraceEntry[];
	chatMessages: ChatMessage[];
	chatDraft: string;
	draftCodeContexts: ChatCodeContext[];
	onChatDraftChange: (value: string) => void;
	onSendChatMessage: () => void;
	onChatCodeContextClick?: (context: ChatCodeContext) => void;
	onAssistantReferenceClick?: (target: ReviewChatReferenceTarget) => void;
	onRemoveDraftCodeContext?: (contextId: string) => void;
	reviewReferencePaths?: readonly string[];
	reviewReferenceRepoPath?: string | null;
	isChatLoading?: boolean;
	chatError?: string | null;
	isChatComposerDisabled?: boolean;
	chatComposerNote?: string | null;
	composerFocusToken?: number;
	isFullscreen?: boolean;
	isInline?: boolean;
	onToggleOpen: () => void;
	onToggleFullscreen: () => void;
};

function ReviewPlaceholder() {
	return (
		<div className="workspace-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
			<div className="rounded-[16px] border border-dashed border-border-subtle bg-[rgba(255,255,255,0.02)] px-4 py-5 text-sm leading-6 text-text-secondary">
				Start a review run to see the AI summary, findings, and reasoning trace
				for this compare target. Chat is still available for follow-up questions
				about the current diff.
			</div>
		</div>
	);
}

export function ReviewAssistantPanel({
	activeTab,
	onActiveTabChange,
	activeRun,
	reviewResult,
	findingsLabel,
	selectedFindingId,
	onSelectFinding,
	canNavigateToFinding,
	reasoningTrace,
	chatMessages,
	chatDraft,
	draftCodeContexts,
	onChatDraftChange,
	onSendChatMessage,
	onChatCodeContextClick,
	onAssistantReferenceClick,
	onRemoveDraftCodeContext,
	reviewReferencePaths,
	reviewReferenceRepoPath,
	isChatLoading = false,
	chatError = null,
	isChatComposerDisabled = false,
	chatComposerNote = null,
	composerFocusToken = 0,
	isFullscreen = false,
	isInline = false,
	onToggleOpen,
	onToggleFullscreen,
}: ReviewAssistantPanelProps) {
	const sectionPadding = isFullscreen ? "px-6 py-5 xl:px-8" : "px-4 py-4";
	const reviewCountLabel = reviewResult
		? String(reviewResult.findings.length)
		: activeRun
			? "…"
			: "0";

	return (
		<div
			className={cn(
				isInline
					? "workspace-panel overflow-hidden bg-[linear-gradient(180deg,rgba(11,14,19,0.98),rgba(8,10,14,0.94))]"
					: "flex h-full min-h-0 flex-col",
				isFullscreen
					? "bg-[linear-gradient(180deg,rgba(9,12,17,0.98),rgba(6,9,14,0.96))]"
					: undefined,
			)}
		>
			<div className={cn("border-b border-border-subtle", sectionPadding)}>
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="workspace-section-label">Assistant</div>
						<div className="mt-1 text-sm font-semibold text-text-primary">
							{activeTab === "review"
								? "AI review summary and findings"
								: "Codex review chat"}
						</div>
						<div className="mt-1 text-xs text-text-secondary">
							{activeTab === "review"
								? "Navigate findings and inspect the current review output."
								: "Ask Codex about the current compare target and attached code context."}
						</div>
					</div>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="toolbar"
							size="toolbar-icon"
							className="hidden xl:flex"
							onClick={onToggleFullscreen}
							aria-pressed={isFullscreen}
							aria-label={
								isFullscreen ? "Restore split view" : "Expand assistant"
							}
							title={isFullscreen ? "Restore split view" : "Expand assistant"}
						>
							{isFullscreen ? (
								<Minimize2 className="size-4" />
							) : (
								<Maximize2 className="size-4" />
							)}
						</Button>
						<Button
							type="button"
							variant="toolbar"
							size="toolbar-icon"
							onClick={onToggleOpen}
							aria-label={isInline ? "Hide assistant" : "Collapse assistant rail"}
							title={isInline ? "Hide assistant" : "Collapse assistant rail"}
						>
							<PanelRightOpen className="size-4 rotate-180" />
						</Button>
					</div>
				</div>

				<ToggleGroup
					type="single"
					value={activeTab}
					onValueChange={(value) => {
						if (value === "review" || value === "chat") {
							onActiveTabChange(value);
						}
					}}
					className="mt-4 w-full"
				>
					<ToggleGroupItem
						value="review"
						aria-label="Review tab"
						className="gap-2"
					>
						<Sparkles className="size-4" />
						<span>Review</span>
						<span className="rounded-full border border-border-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary">
							{reviewCountLabel}
						</span>
					</ToggleGroupItem>
					<ToggleGroupItem value="chat" aria-label="Chat tab" className="gap-2">
						<MessageCircle className="size-4" />
						<span>Chat</span>
					</ToggleGroupItem>
				</ToggleGroup>
			</div>

			<div
				className={cn(
					"min-h-0",
					isInline ? "max-h-[32rem]" : "flex-1",
				)}
			>
				{activeTab === "review" ? (
					activeRun ? (
						<ReviewInsightsPanel
							activeRun={activeRun}
							reviewResult={reviewResult}
							findingsLabel={findingsLabel}
							selectedFindingId={selectedFindingId}
							onSelectFinding={onSelectFinding}
							canNavigateToFinding={canNavigateToFinding}
							reasoningTrace={reasoningTrace}
							isFullscreen={isFullscreen}
							isInline={isInline}
							showHeader={false}
							onToggleOpen={onToggleOpen}
							onToggleFullscreen={onToggleFullscreen}
						/>
					) : (
						<ReviewPlaceholder />
					)
				) : (
					<ReviewChatPanel
						messages={chatMessages}
						draft={chatDraft}
						draftCodeContexts={draftCodeContexts}
						onDraftChange={onChatDraftChange}
						onSendMessage={onSendChatMessage}
						onCodeContextClick={onChatCodeContextClick}
						onAssistantReferenceClick={onAssistantReferenceClick}
						onRemoveDraftCodeContext={onRemoveDraftCodeContext}
						isLoading={isChatLoading}
						error={chatError}
						isComposerDisabled={isChatComposerDisabled}
						composerNote={chatComposerNote}
						composerFocusToken={composerFocusToken}
						reviewReferencePaths={reviewReferencePaths}
						reviewReferenceRepoPath={reviewReferenceRepoPath}
					/>
				)}
			</div>
		</div>
	);
}

export default ReviewAssistantPanel;
