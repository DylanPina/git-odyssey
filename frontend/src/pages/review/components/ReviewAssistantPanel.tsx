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
import type {
	ChatCodeContext,
	ChatFindingContext,
	ChatMessage,
} from "@/lib/definitions/chat";
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
	draftFindingContexts?: ChatFindingContext[];
	onChatDraftChange: (value: string) => void;
	onSendChatMessage: () => void;
	onAddFindingToChat?: (finding: ReviewFinding) => void;
	onChatCodeContextClick?: (context: ChatCodeContext) => void;
	onChatFindingContextClick?: (context: ChatFindingContext) => void;
	onAssistantReferenceClick?: (target: ReviewChatReferenceTarget) => void;
	onRemoveDraftCodeContext?: (contextId: string) => void;
	onRemoveDraftFindingContext?: (findingId: string) => void;
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
		<div className="workspace-scrollbar min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5">
			<div className="rounded-[12px] border border-dashed border-border-subtle bg-[rgba(255,255,255,0.02)] px-3 py-3 text-sm leading-5 text-text-secondary">
				Start a review to see the summary, findings, and review progress for
				this diff. Chat is still available while you wait.
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
	draftFindingContexts = [],
	onChatDraftChange,
	onSendChatMessage,
	onAddFindingToChat = () => {},
	onChatCodeContextClick,
	onChatFindingContextClick,
	onAssistantReferenceClick,
	onRemoveDraftCodeContext,
	onRemoveDraftFindingContext,
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
	const sectionPadding = isFullscreen ? "px-4 py-3 xl:px-5" : "px-2.5 py-2.5";
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
				<div className="flex flex-wrap items-center justify-between gap-1.5">
					<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
						<ToggleGroup
							type="single"
							value={activeTab}
							onValueChange={(value) => {
								if (value === "review" || value === "chat") {
									onActiveTabChange(value);
								}
							}}
							className="min-w-0 justify-start gap-1"
						>
							<ToggleGroupItem
								value="review"
								aria-label="Review tab"
								className="h-7.5 min-w-[5.75rem] gap-1.5 rounded-[9px] px-2.5 text-[11px]"
							>
								<Sparkles className="size-3.5" />
								<span>Review</span>
								<span className="rounded-full border border-border-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary">
									{reviewCountLabel}
								</span>
							</ToggleGroupItem>
							<ToggleGroupItem
								value="chat"
								aria-label="Chat tab"
								className="h-7.5 min-w-[5.75rem] gap-1.5 rounded-[9px] px-2.5 text-[11px]"
							>
								<MessageCircle className="size-3.5" />
								<span>Chat</span>
							</ToggleGroupItem>
						</ToggleGroup>
					</div>
					<div className="flex items-center gap-1">
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
			</div>

			<div
				className={cn(
					"min-h-0",
					isInline ? "max-h-[30rem]" : "flex-1",
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
							onAddFindingToChat={onAddFindingToChat}
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
						draftFindingContexts={draftFindingContexts}
						onDraftChange={onChatDraftChange}
						onSendMessage={onSendChatMessage}
						onCodeContextClick={onChatCodeContextClick}
						onFindingContextClick={onChatFindingContextClick}
						onAssistantReferenceClick={onAssistantReferenceClick}
						onRemoveDraftCodeContext={onRemoveDraftCodeContext}
						onRemoveDraftFindingContext={onRemoveDraftFindingContext}
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
