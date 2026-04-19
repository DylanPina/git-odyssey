import { useEffect, useMemo, useRef, useState } from "react";
import {
	ArrowUp,
	Check,
	ChevronDown,
	Loader2,
	Sparkles,
	X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineBanner } from "@/components/ui/inline-banner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { REVIEW_CHAT_DEFAULT_MODEL_ID } from "@/pages/review/review-constants";
import { cn } from "@/lib/utils";

const REVIEW_CHAT_MODEL_PRESETS = [
	"gpt-5.4-mini",
	"gpt-5.4",
	"gpt-5.3-codex",
	"o4-mini",
] as const;

type ReviewChatPanelProps = {
	messages: ChatMessage[];
	draft: string;
	draftCodeContexts: ChatCodeContext[];
	draftFindingContexts?: ChatFindingContext[];
	selectedModelId: string;
	configuredModelId?: string | null;
	onDraftChange: (value: string) => void;
	onSelectedModelIdChange: (value: string) => void;
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

function normalizeModelId(value: string | null | undefined) {
	const trimmed = String(value || "").trim();
	return trimmed || REVIEW_CHAT_DEFAULT_MODEL_ID;
}

function buildModelOptions(
	configuredModelId?: string | null,
	selectedModelId?: string | null,
) {
	const normalizedConfiguredModelId = normalizeModelId(configuredModelId);
	const normalizedSelectedModelId = normalizeModelId(selectedModelId);
	return Array.from(
		new Set([
			normalizedConfiguredModelId,
			normalizedSelectedModelId,
			...REVIEW_CHAT_MODEL_PRESETS,
		]),
	);
}

function ReviewChatModelSelector({
	value,
	configuredModelId,
	onChange,
	disabled = false,
}: {
	value: string;
	configuredModelId?: string | null;
	onChange: (value: string) => void;
	disabled?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [customModelDraft, setCustomModelDraft] = useState(value);
	const modelOptions = useMemo(
		() => buildModelOptions(configuredModelId, value),
		[configuredModelId, value],
	);
	const normalizedConfiguredModelId = normalizeModelId(configuredModelId);

	useEffect(() => {
		if (!open) {
			setCustomModelDraft(value);
		}
	}, [open, value]);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					disabled={disabled}
					aria-label="Select chat model"
					className={cn(
						"inline-flex h-8 max-w-[8.75rem] items-center gap-2 rounded-full border px-3 text-[11px] font-medium shadow-[0_10px_24px_rgba(4,8,16,0.28)] backdrop-blur-sm transition-[border-color,background-color,color,box-shadow] duration-150",
						"border-[rgba(122,162,255,0.22)] bg-[linear-gradient(135deg,rgba(12,16,24,0.94),rgba(21,29,43,0.9))] text-text-primary hover:border-[rgba(122,162,255,0.42)] hover:bg-[linear-gradient(135deg,rgba(16,20,29,0.96),rgba(27,38,55,0.92))]",
						"focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50",
					)}
				>
					<span className="min-w-0 truncate">{value}</span>
					<ChevronDown className="size-3.5 shrink-0 text-text-tertiary" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-[20rem] space-y-3 p-3">
				<div className="space-y-1">
					<div className="workspace-section-label">Chat model</div>
					<p className="text-xs leading-5 text-text-secondary">
						Applies only to this review chat thread.
					</p>
				</div>

				<div className="space-y-1.5">
					{modelOptions.map((modelId) => {
						const isSelected = value === modelId;
						const isConfiguredDefault = modelId === normalizedConfiguredModelId;
						const isCustomSelection =
							isSelected &&
							!REVIEW_CHAT_MODEL_PRESETS.includes(
								modelId as (typeof REVIEW_CHAT_MODEL_PRESETS)[number],
							) &&
							!isConfiguredDefault;

						return (
							<button
								key={modelId}
								type="button"
								onClick={() => {
									onChange(modelId);
									setOpen(false);
								}}
								className={cn(
									"flex w-full items-center justify-between gap-3 rounded-[12px] border px-3 py-2 text-left transition-colors duration-150",
									isSelected
										? "border-[rgba(122,162,255,0.36)] bg-[rgba(122,162,255,0.14)] text-text-primary"
										: "border-border-subtle bg-control/55 text-text-secondary hover:border-border-strong hover:bg-control-hover hover:text-text-primary",
								)}
							>
								<span className="min-w-0">
									<span className="block truncate text-sm font-medium">
										{modelId}
									</span>
									<span className="block text-[10px] uppercase tracking-[0.16em] text-text-tertiary">
										{isConfiguredDefault
											? "Configured default"
											: isCustomSelection
												? "Current custom"
												: "Preset"}
									</span>
								</span>
								<Check
									className={cn(
										"size-4 shrink-0",
										isSelected ? "opacity-100 text-accent" : "opacity-0",
									)}
								/>
							</button>
						);
					})}
				</div>

				<div className="rounded-[14px] border border-border-subtle bg-[rgba(255,255,255,0.03)] p-3">
					<div className="mb-2 space-y-1">
						<div className="text-xs font-medium text-text-primary">
							Custom model
						</div>
						<p className="text-xs leading-5 text-text-secondary">
							Enter any model ID supported by the connected runtime.
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Input
							value={customModelDraft}
							onChange={(event) => setCustomModelDraft(event.target.value)}
							onKeyDown={(event) => {
								if (event.key !== "Enter") {
									return;
								}
								event.preventDefault();
								onChange(customModelDraft);
								setOpen(false);
							}}
							placeholder="gpt-5.4-mini"
							aria-label="Custom chat model"
							className="h-8 text-xs"
						/>
						<Button
							type="button"
							size="sm"
							variant="subtle"
							onClick={() => {
								onChange(customModelDraft);
								setOpen(false);
							}}
						>
							Apply
						</Button>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}

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
	selectedModelId,
	configuredModelId,
	onDraftChange,
	onSelectedModelIdChange,
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
						className="min-h-[76px] resize-none pb-11 pr-[10.75rem]"
						disabled={isLoading || isComposerDisabled}
					/>
					<div className="absolute right-2 bottom-2 flex items-center gap-2">
						<ReviewChatModelSelector
							value={selectedModelId}
							configuredModelId={configuredModelId}
							onChange={onSelectedModelIdChange}
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
									aria-label="Send message"
								>
									<ArrowUp className="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Send</TooltipContent>
						</Tooltip>
					</div>
				</div>
				<p className="mt-1 text-[10px] text-text-tertiary">
					Press Enter to send. Use Shift+Enter for a new line.
				</p>
			</div>
		</div>
	);
}

export default ReviewChatPanel;
