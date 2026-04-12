import { useEffect, useRef } from "react";
import { ArrowUp, Loader2, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineBanner } from "@/components/ui/inline-banner";
import { Textarea } from "@/components/ui/textarea";
import {
	MarkdownRenderer,
	type ReviewChatReferenceTarget,
} from "@/components/ui/custom/MarkdownRenderer";
import type {
	ChatCodeContext,
	ChatFindingContext,
	ChatMessage,
} from "@/lib/definitions/chat";
import {
	formatReviewChatCodeContextLabel,
	formatReviewChatFindingContextLabel,
} from "@/pages/review/useReviewChatSession";

type ReviewChatPanelProps = {
	messages: ChatMessage[];
	draft: string;
	draftCodeContexts: ChatCodeContext[];
	draftFindingContexts?: ChatFindingContext[];
	onDraftChange: (value: string) => void;
	onSendMessage: () => void;
	onCodeContextClick?: (context: ChatCodeContext) => void;
	onFindingContextClick?: (context: ChatFindingContext) => void;
	onAssistantReferenceClick?: (target: ReviewChatReferenceTarget) => void;
	onRemoveDraftCodeContext?: (contextId: string) => void;
	onRemoveDraftFindingContext?: (findingId: string) => void;
	isLoading?: boolean;
	error?: string | null;
	isComposerDisabled?: boolean;
	composerNote?: string | null;
	composerFocusToken?: number;
	reviewReferencePaths?: readonly string[];
	reviewReferenceRepoPath?: string | null;
};

function ReviewChatCodeContextButton({
	context,
	onClick,
	onRemove,
}: {
	context: ChatCodeContext;
	onClick?: (context: ChatCodeContext) => void;
	onRemove?: (contextId: string) => void;
}) {
	return (
		<div className="relative inline-flex max-w-full items-stretch">
			<button
				type="button"
				onClick={() => onClick?.(context)}
				aria-label={`Jump to ${formatReviewChatCodeContextLabel(context)}`}
				title={`Jump to ${formatReviewChatCodeContextLabel(context)}`}
				className="group relative inline-flex max-w-full items-center gap-2 overflow-hidden rounded-full border border-[rgba(122,162,255,0.22)] bg-[linear-gradient(135deg,rgba(122,162,255,0.14),rgba(122,162,255,0.06)_60%,rgba(255,255,255,0.03))] px-2.5 py-1.5 pr-8 text-left shadow-[0_6px_18px_rgba(6,10,18,0.16)] transition-[border-color,box-shadow] duration-150 hover:border-[rgba(122,162,255,0.4)] hover:shadow-[0_10px_24px_rgba(40,74,145,0.18)]"
			>
				<span
					className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-[radial-gradient(circle_at_left,rgba(199,220,255,0.18),transparent_70%)] opacity-90"
					aria-hidden="true"
				/>
				<span className="relative flex size-4.5 items-center justify-center rounded-full bg-[rgba(122,162,255,0.18)]">
					<Sparkles className="size-2.5 text-[#dce8ff]" />
				</span>
				<span className="min-w-0">
					<span className="block truncate font-mono text-[10px] text-text-primary">
						{context.filePath}
					</span>
					<span className="block truncate text-[9px] uppercase tracking-[0.14em] text-text-tertiary">
						{context.side === "modified" ? "modified" : "original"} •{" "}
						{context.startLine === context.endLine
							? `L${context.startLine}`
							: `L${context.startLine}-${context.endLine}`}
					</span>
				</span>
			</button>
			{onRemove ? (
				<button
					type="button"
					onClick={(event) => {
						event.stopPropagation();
						onRemove(context.id);
					}}
					aria-label={`Remove ${formatReviewChatCodeContextLabel(context)}`}
					title="Remove attached code context"
					className="absolute right-1 top-1/2 inline-flex size-5.5 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-[rgba(9,12,18,0.34)] text-text-secondary transition-colors duration-150 hover:border-[rgba(122,162,255,0.22)] hover:bg-[rgba(9,12,18,0.56)] hover:text-text-primary"
				>
					<X className="size-3" />
				</button>
			) : null}
		</div>
	);
}

function ReviewChatFindingContextButton({
	context,
	onClick,
	onRemove,
}: {
	context: ChatFindingContext;
	onClick?: (context: ChatFindingContext) => void;
	onRemove?: (findingId: string) => void;
}) {
	const line = context.new_start ?? context.old_start ?? null;

	return (
		<div className="relative inline-flex max-w-full items-stretch">
			<button
				type="button"
				onClick={() => onClick?.(context)}
				aria-label={`Jump to ${formatReviewChatFindingContextLabel(context)}`}
				title={`Jump to ${formatReviewChatFindingContextLabel(context)}`}
				className="group relative inline-flex max-w-full items-center gap-2 overflow-hidden rounded-full border border-[rgba(255,196,122,0.22)] bg-[linear-gradient(135deg,rgba(255,196,122,0.16),rgba(255,196,122,0.07)_60%,rgba(255,255,255,0.03))] px-2.5 py-1.5 pr-8 text-left shadow-[0_6px_18px_rgba(6,10,18,0.16)] transition-[border-color,box-shadow] duration-150 hover:border-[rgba(255,196,122,0.4)] hover:shadow-[0_10px_24px_rgba(145,98,40,0.18)]"
			>
				<span
					className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-[radial-gradient(circle_at_left,rgba(255,221,168,0.18),transparent_70%)] opacity-90"
					aria-hidden="true"
				/>
				<span className="relative rounded-full border border-[rgba(255,214,153,0.25)] bg-[rgba(255,196,122,0.16)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#ffe4bd]">
					{context.severity}
				</span>
				<span className="min-w-0">
					<span className="block truncate text-[11px] font-medium text-text-primary">
						{context.title}
					</span>
					<span className="block truncate font-mono text-[9px] uppercase tracking-[0.14em] text-text-tertiary">
						{line == null ? context.file_path : `${context.file_path}:${line}`}
					</span>
				</span>
			</button>
			{onRemove ? (
				<button
					type="button"
					onClick={(event) => {
						event.stopPropagation();
						onRemove(context.id);
					}}
					aria-label={`Remove ${formatReviewChatFindingContextLabel(context)}`}
					title="Remove attached finding"
					className="absolute right-1 top-1/2 inline-flex size-5.5 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-[rgba(9,12,18,0.34)] text-text-secondary transition-colors duration-150 hover:border-[rgba(255,196,122,0.24)] hover:bg-[rgba(9,12,18,0.56)] hover:text-text-primary"
				>
					<X className="size-3" />
				</button>
			) : null}
		</div>
	);
}

export function ReviewChatPanel({
	messages,
	draft,
	draftCodeContexts,
	draftFindingContexts = [],
	onDraftChange,
	onSendMessage,
	onCodeContextClick,
	onFindingContextClick,
	onAssistantReferenceClick,
	onRemoveDraftCodeContext,
	onRemoveDraftFindingContext,
	isLoading = false,
	error = null,
	isComposerDisabled = false,
	composerNote = null,
	composerFocusToken = 0,
	reviewReferencePaths,
	reviewReferenceRepoPath,
}: ReviewChatPanelProps) {
	const messagesContainerRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const canSendMessage =
		!isComposerDisabled &&
		(Boolean(draft.trim()) ||
			draftCodeContexts.length > 0 ||
			draftFindingContexts.length > 0);

	useEffect(() => {
		const container = messagesContainerRef.current;
		if (!container) {
			return;
		}

		if (typeof container.scrollTo === "function") {
			container.scrollTo({
				top: container.scrollHeight,
				behavior: "smooth",
			});
			return;
		}

		container.scrollTop = container.scrollHeight;
	}, [isLoading, messages]);

	useEffect(() => {
		if (composerFocusToken <= 0) {
			return;
		}

		textareaRef.current?.focus();
		textareaRef.current?.setSelectionRange(
			textareaRef.current.value.length,
			textareaRef.current.value.length,
		);
	}, [composerFocusToken]);

	const handleSend = () => {
		if (!canSendMessage || isLoading) {
			return;
		}

		onSendMessage();
	};

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div
				ref={messagesContainerRef}
				className="workspace-scrollbar min-h-0 flex-1 space-y-2.5 overflow-x-hidden overflow-y-auto px-2.5 py-2.5"
			>
				{messages.length === 0 && !isLoading ? (
					<EmptyState
						title="Ask about this diff"
						description="Ask follow-up questions about the diff, the current review, or any attached code context."
						className="rounded-[14px] border border-dashed border-border-subtle bg-[rgba(255,255,255,0.02)] px-3.5 py-3.5"
					/>
				) : (
					messages.map((message) => {
						const isUser = message.role === "user";
						const hasTextContent = Boolean(message.content.trim());
						const hasCodeContexts = Boolean(message.codeContexts?.length);
						const hasFindingContexts = Boolean(message.findingContexts?.length);
						return (
							<div
								key={message.id}
								className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
							>
								<div
									className={`flex min-w-0 flex-col ${
										isUser
											? "max-w-[90%] items-end"
											: "w-full max-w-[92%] items-start"
									}`}
								>
									<div
										className={`w-full min-w-0 rounded-[12px] border p-2 ${
											isUser
												? "border-[rgba(122,162,255,0.28)] bg-[rgba(122,162,255,0.1)]"
												: "workspace-panel"
										}`}
									>
										{hasFindingContexts ? (
											<div className="mb-1.5 flex flex-wrap gap-1.5">
												{message.findingContexts?.map((context) => (
													<ReviewChatFindingContextButton
														key={context.id}
														context={context}
														onClick={onFindingContextClick}
													/>
												))}
											</div>
										) : null}
										{hasCodeContexts ? (
											<div className="mb-1.5 flex flex-wrap gap-1.5">
												{message.codeContexts?.map((context) => (
													<ReviewChatCodeContextButton
														key={context.id}
														context={context}
														onClick={onCodeContextClick}
													/>
												))}
											</div>
										) : null}
										{message.role === "assistant" ? (
											<>
												<MarkdownRenderer
													content={message.content}
													reviewReferencePaths={reviewReferencePaths}
													onReviewReferenceClick={onAssistantReferenceClick}
													reviewReferenceRepoPath={reviewReferenceRepoPath}
												/>
											</>
										) : hasTextContent ? (
											<p className="whitespace-pre-wrap text-sm leading-5 text-text-primary">
												{message.content}
											</p>
										) : hasCodeContexts || hasFindingContexts ? (
											<p className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
												Attached context
											</p>
										) : null}
									</div>
								</div>
							</div>
						);
					})
				)}

				{isLoading && messages[messages.length - 1]?.role === "user" ? (
					<div className="flex justify-start">
						<div className="workspace-panel flex w-full max-w-[92%] items-center gap-2 px-2.5 py-2 text-sm text-text-secondary">
							<Loader2 className="size-4 animate-spin" />
							AI is typing...
						</div>
					</div>
				) : null}
			</div>

			<div className="border-t border-border-subtle px-2.5 py-2.5">
				{error ? (
					<InlineBanner tone="danger" title={error} className="mb-2" />
				) : null}
				{composerNote ? (
					<InlineBanner tone="info" title={composerNote} className="mb-2" />
				) : null}
				{draftFindingContexts.length > 0 || draftCodeContexts.length > 0 ? (
					<div className="mb-2 flex flex-wrap gap-1.5">
						{draftFindingContexts.map((context) => (
							<ReviewChatFindingContextButton
								key={context.id}
								context={context}
								onClick={onFindingContextClick}
								onRemove={onRemoveDraftFindingContext}
							/>
						))}
						{draftCodeContexts.map((context) => (
							<ReviewChatCodeContextButton
								key={context.id}
								context={context}
								onClick={onCodeContextClick}
								onRemove={onRemoveDraftCodeContext}
							/>
						))}
					</div>
				) : null}
				<div className="relative">
					<Textarea
						ref={textareaRef}
						value={draft}
						onChange={(event) => onDraftChange(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								handleSend();
							}
						}}
						placeholder="Ask AI about this diff"
						className="min-h-[76px] resize-none pr-12"
						disabled={isLoading || isComposerDisabled}
					/>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								onClick={handleSend}
								disabled={!canSendMessage || isLoading}
								variant="toolbar"
								size="icon-sm"
								className="absolute bottom-2 right-2"
								aria-label="Send message"
							>
								<ArrowUp className="size-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Send</TooltipContent>
					</Tooltip>
				</div>
				<p className="mt-1 text-[10px] text-text-tertiary">
					Press Enter to send. Use Shift+Enter for a new line.
				</p>
			</div>
		</div>
	);
}

export default ReviewChatPanel;
