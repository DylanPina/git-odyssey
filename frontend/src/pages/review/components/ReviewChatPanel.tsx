import { useEffect, useRef } from "react";
import { Loader2, Send, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineBanner } from "@/components/ui/inline-banner";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownRenderer } from "@/components/ui/custom/MarkdownRenderer";
import type { ChatCodeContext, ChatMessage } from "@/lib/definitions/chat";
import { formatReviewChatCodeContextLabel } from "@/pages/review/useReviewChatSession";

type ReviewChatPanelProps = {
	messages: ChatMessage[];
	draft: string;
	draftCodeContexts: ChatCodeContext[];
	onDraftChange: (value: string) => void;
	onSendMessage: () => void;
	onCodeContextClick?: (context: ChatCodeContext) => void;
	onRemoveDraftCodeContext?: (contextId: string) => void;
	isLoading?: boolean;
	error?: string | null;
	isComposerDisabled?: boolean;
	composerNote?: string | null;
	composerFocusToken?: number;
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
				className="group relative inline-flex max-w-full items-center gap-2 overflow-hidden rounded-full border border-[rgba(122,162,255,0.26)] bg-[linear-gradient(135deg,rgba(122,162,255,0.16),rgba(122,162,255,0.08)_60%,rgba(255,255,255,0.04))] px-3 py-2 pr-10 text-left shadow-[0_10px_24px_rgba(6,10,18,0.18)] transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[rgba(122,162,255,0.46)] hover:shadow-[0_14px_30px_rgba(40,74,145,0.22)]"
			>
				<span
					className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-[radial-gradient(circle_at_left,rgba(199,220,255,0.2),transparent_70%)] opacity-90"
					aria-hidden="true"
				/>
				<span className="relative flex size-5 items-center justify-center rounded-full bg-[rgba(122,162,255,0.18)]">
					<Sparkles className="size-3 text-[#dce8ff]" />
					<span className="absolute inline-flex size-5 rounded-full bg-[rgba(122,162,255,0.16)] animate-ping" />
				</span>
				<span className="min-w-0">
					<span className="block truncate font-mono text-[11px] text-text-primary">
						{context.filePath}
					</span>
					<span className="block truncate text-[10px] uppercase tracking-[0.16em] text-text-tertiary">
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
					className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-[rgba(9,12,18,0.34)] text-text-secondary transition-colors duration-150 hover:border-[rgba(122,162,255,0.22)] hover:bg-[rgba(9,12,18,0.56)] hover:text-text-primary"
				>
					<X className="size-3.5" />
				</button>
			) : null}
		</div>
	);
}

export function ReviewChatPanel({
	messages,
	draft,
	draftCodeContexts,
	onDraftChange,
	onSendMessage,
	onCodeContextClick,
	onRemoveDraftCodeContext,
	isLoading = false,
	error = null,
	isComposerDisabled = false,
	composerNote = null,
	composerFocusToken = 0,
}: ReviewChatPanelProps) {
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const canSendMessage =
		!isComposerDisabled && (Boolean(draft.trim()) || draftCodeContexts.length > 0);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
			<div className="workspace-scrollbar min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto px-4 py-4">
				{messages.length === 0 && !isLoading ? (
					<EmptyState
						title="Ask about this compare target"
						description="Codex chat uses the current compare target, any persisted review findings, and recent conversation. Injected code context appears as jump-back buttons instead of raw pasted text."
						className="rounded-[18px] border border-dashed border-border-subtle bg-[rgba(255,255,255,0.02)] px-5 py-6"
					/>
				) : (
					messages.map((message) => {
						const isUser = message.role === "user";
						const hasTextContent = Boolean(message.content.trim());
						const hasCodeContexts = Boolean(message.codeContexts?.length);
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
										className={`w-full min-w-0 rounded-[14px] border p-3 ${
											isUser
												? "border-[rgba(122,162,255,0.28)] bg-[rgba(122,162,255,0.1)]"
												: "workspace-panel"
										}`}
									>
										{hasCodeContexts ? (
											<div className="mb-3 flex flex-wrap gap-2">
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
												<MarkdownRenderer content={message.content} />
											</>
										) : hasTextContent ? (
											<p className="whitespace-pre-wrap text-sm leading-6 text-text-primary">
												{message.content}
											</p>
										) : hasCodeContexts ? (
											<p className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
												Attached code context
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
						<div className="workspace-panel flex w-full max-w-[92%] items-center gap-2 px-3 py-3 text-sm text-text-secondary">
							<Loader2 className="size-4 animate-spin" />
							AI is typing...
						</div>
					</div>
				) : null}

				<div ref={messagesEndRef} />
			</div>

			<div className="border-t border-border-subtle px-4 py-4">
				{error ? <InlineBanner tone="danger" title={error} className="mb-3" /> : null}
				{composerNote ? (
					<InlineBanner
						tone="info"
						title={composerNote}
						className="mb-3"
					/>
				) : null}
				{draftCodeContexts.length > 0 ? (
					<div className="mb-3 flex flex-wrap gap-2">
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
						placeholder="Ask Codex about this diff. Injected code context will stay attached as jump-back buttons."
						className="min-h-[112px] resize-none pr-12"
						disabled={isLoading || isComposerDisabled}
					/>
					<Button
						type="button"
						onClick={handleSend}
						disabled={!canSendMessage || isLoading}
						variant="accent"
						size="icon-sm"
						className="absolute bottom-2 right-2"
					>
						<Send className="size-4" />
					</Button>
				</div>
				<p className="mt-2 text-xs text-text-tertiary">
					Press Enter to send. Use Shift+Enter for a new line.
				</p>
			</div>
		</div>
	);
}

export default ReviewChatPanel;
