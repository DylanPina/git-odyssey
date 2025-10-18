import { SidebarGroup } from "../sidebar";
import { Textarea } from "../textarea";
import { Button } from "../button";
import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2 } from "lucide-react";
import type { ChatMessage } from "@/lib/definitions/chat";
import { Citations } from "@/components/ui/custom/Citations";
import { MarkdownRenderer } from "@/components/ui/custom/MarkdownRenderer";

interface ChatProps {
	onSendMessage?: (message: string) => void;
	messages?: ChatMessage[];
	isLoading?: boolean;
	error?: string | null;
	onCommitClick?: (commitSha: string) => void;
}

export default function Chat({
	onSendMessage,
	messages = [],
	isLoading = false,
	error = null,
	onCommitClick,
}: ChatProps) {
	const [inputMessage, setInputMessage] = useState("");
	const [localMessages, setLocalMessages] = useState<ChatMessage[]>(messages);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Auto-scroll to bottom when new messages arrive
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [localMessages, isLoading]);

	// Update local messages when prop messages change
	useEffect(() => {
		setLocalMessages(messages);
	}, [messages]);

	const handleSendMessage = () => {
		if (!inputMessage.trim() || isLoading) return;

		const userMessage: ChatMessage = {
			id: Date.now().toString(),
			role: "user",
			content: inputMessage.trim(),
			timestamp: new Date(),
		};

		// Add user message immediately
		setLocalMessages((prev) => [...prev, userMessage]);

		// Call parent handler
		onSendMessage?.(inputMessage.trim());

		// Clear input
		setInputMessage("");
	};

	const handleKeyPress = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSendMessage();
		}
	};

	const formatTime = (timestamp: Date) => {
		return timestamp.toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	return (
		<SidebarGroup className="h-full">
			<div className="flex flex-col h-full px-3 py-2">
				{/* Chat Header */}
				<div className="flex items-center gap-2 pb-3 border-b border-neutral-700">
					<Bot className="w-5 h-5 text-white" />
					<h3 className="text-sm font-semibold text-white">AI Assistant</h3>
					{isLoading && (
						<Loader2 className="w-4 h-4 text-blue-400 animate-spin ml-auto" />
					)}
				</div>

				{/* Messages Container */}
				<div className="flex-1 overflow-y-auto custom-scrollbar py-3 space-y-3">
					{localMessages.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full text-center">
							<Bot className="w-12 h-12 text-neutral-600 mb-3" />
							<p className="text-sm text-white/50 mb-2">
								Ask me anything about your repository!
							</p>
							<p className="text-xs text-white/30">
								I can help you understand commits, branches, and code changes.
							</p>
						</div>
					) : (
						localMessages.map((message) => (
							<div
								key={message.id}
								className={`flex gap-2 ${
									message.role === "user" ? "justify-end" : "justify-start"
								}`}
							>
								{/* Avatar */}
								<div
									className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
										message.role === "user"
											? "bg-blue-600 order-2"
											: "bg-neutral-600 order-1"
									}`}
								>
									{message.role === "user" ? (
										<User className="w-3 h-3 text-white" />
									) : (
										<Bot className="w-3 h-3 text-white" />
									)}
								</div>

								{/* Message Content */}
								<div
									className={`max-w-[80%] rounded-lg px-3 py-2 ${
										message.role === "user"
											? "bg-blue-600 text-white order-1"
											: "bg-neutral-800 text-white order-2"
									}`}
								>
									{message.isLoading ? (
										<div className="flex items-center gap-2">
											<Loader2 className="w-4 h-4 animate-spin" />
											<span className="text-sm">Thinking...</span>
										</div>
									) : (
										<div>
											{message.role === "assistant" ? (
												<MarkdownRenderer content={message.content} />
											) : (
												<p className="text-sm whitespace-pre-wrap">
													{message.content}
												</p>
											)}
											{message.role === "assistant" &&
												message.citedCommits &&
												message.citedCommits.length > 0 && (
													<Citations
														citedCommits={message.citedCommits}
														onCommitClick={onCommitClick}
													/>
												)}
											<p
												className={`text-xs mt-1 ${
													message.role === "user"
														? "text-blue-100"
														: "text-neutral-400"
												}`}
											>
												{formatTime(message.timestamp)}
											</p>
										</div>
									)}
								</div>
							</div>
						))
					)}

					{/* Loading indicator for new AI message */}
					{isLoading &&
						localMessages[localMessages.length - 1]?.role === "user" && (
							<div className="flex gap-2 justify-start">
								<div className="flex-shrink-0 w-6 h-6 rounded-full bg-neutral-600 flex items-center justify-center">
									<Bot className="w-3 h-3 text-white" />
								</div>
								<div className="bg-neutral-800 text-white rounded-lg px-3 py-2">
									<div className="flex items-center gap-2">
										<Loader2 className="w-4 h-4 animate-spin" />
										<span className="text-sm">AI is typing...</span>
									</div>
								</div>
							</div>
						)}

					<div ref={messagesEndRef} />
				</div>

				{/* Error Display */}
				{error && (
					<div className="bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2 mb-3">
						<p className="text-sm text-red-400">{error}</p>
					</div>
				)}

				{/* Input Area */}
				<div className="border-t border-neutral-700 pt-3">
					<div className="relative">
						<Textarea
							ref={textareaRef}
							value={inputMessage}
							onChange={(e) => setInputMessage(e.target.value)}
							onKeyDown={handleKeyPress}
							placeholder="Ask about your repository..."
							className="w-full resize-none min-h-[40px] max-h-[120px] pr-12 text-white"
							disabled={isLoading}
						/>
						<Button
							onClick={handleSendMessage}
							disabled={!inputMessage.trim() || isLoading}
							size="sm"
							className="absolute top-1/2 right-2 -translate-y-1/2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<Send className="w-4 h-4" />
						</Button>
					</div>
					<p className="text-xs text-white/30 mt-2">
						Press Enter to send, Shift+Enter for new line
					</p>
				</div>
			</div>
		</SidebarGroup>
	);
}
