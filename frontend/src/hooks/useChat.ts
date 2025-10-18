import { useState, useCallback, useEffect } from "react";
import { api } from "@/axios";
import type { ChatMessage, Citation } from "@/lib/definitions/chat";
import type { Commit } from "@/lib/definitions/repo";

interface APIResponse {
	response: string;
	cited_commits: Citation[];
}

export interface UseChatProps {
	owner?: string;
	repoName?: string;
	filteredCommits?: Commit[];
}

export interface UseChatReturn {
	chatMessages: ChatMessage[];
	isChatLoading: boolean;
	chatError: string | null;
	sendMessage: (message: string) => Promise<void>;
	clearMessages: () => void;
	clearError: () => void;
	clearAllChatHistory: () => void;
	reloadMessages: () => void;
}

export const useChat = ({
	owner,
	repoName,
	filteredCommits = [],
}: UseChatProps): UseChatReturn => {
	// Generate a unique storage key based on repository
	const getStorageKey = useCallback(() => {
		if (!owner || !repoName) return null;
		return `git-odyssey-chat-${owner}-${repoName}`;
	}, [owner, repoName]);

	// Load messages from localStorage on initialization
	const loadMessagesFromStorage = useCallback((): ChatMessage[] => {
		const storageKey = getStorageKey();
		if (!storageKey) {
			console.log("Cannot load messages - no storage key available");
			return [];
		}

		try {
			const stored = localStorage.getItem(storageKey);
			console.log(
				`Attempting to load from storage key: ${storageKey}, found:`,
				!!stored
			);
			if (stored) {
				const parsedMessages = JSON.parse(stored) as Array<
					Omit<ChatMessage, "timestamp"> & { timestamp: string }
				>;
				// Convert timestamp strings back to Date objects
				const messages = parsedMessages.map((msg) => ({
					...msg,
					timestamp: new Date(msg.timestamp),
				}));
				console.log(
					`Successfully loaded ${messages.length} messages from localStorage`
				);
				return messages;
			}
		} catch (error) {
			console.error("Failed to load chat messages from localStorage:", error);
		}
		console.log("No messages found in localStorage");
		return [];
	}, [getStorageKey]);

	// Save messages to localStorage
	const saveMessagesToStorage = useCallback(
		(messages: ChatMessage[]) => {
			const storageKey = getStorageKey();
			if (!storageKey) {
				console.log("Cannot save messages - no storage key available");
				return;
			}

			try {
				localStorage.setItem(storageKey, JSON.stringify(messages));
				console.log(
					`Successfully saved ${messages.length} messages to localStorage with key: ${storageKey}`
				);
			} catch (error) {
				console.error("Failed to save chat messages to localStorage:", error);
			}
		},
		[getStorageKey]
	);

	const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
	const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
	const [chatError, setChatError] = useState<string | null>(null);
	const [isInitialized, setIsInitialized] = useState<boolean>(false);

	// Load messages from localStorage when the hook initializes or repository changes
	useEffect(() => {
		// Only load if we have both owner and repoName
		if (!owner || !repoName) {
			console.log("Skipping chat message loading - missing owner or repoName");
			return;
		}

		const messages = loadMessagesFromStorage();
		setChatMessages(messages);
		setIsInitialized(true);

		// Debug logging to confirm loading
		if (messages.length > 0) {
			console.log(
				`Loaded ${messages.length} chat messages for ${owner}/${repoName}`
			);
		}
	}, [loadMessagesFromStorage, owner, repoName]);

	// Save messages to localStorage whenever chatMessages changes
	useEffect(() => {
		// Only save if we have both owner and repoName and we've been initialized
		if (!owner || !repoName || !isInitialized) {
			console.log(
				"Skipping chat message saving - missing owner, repoName, or not initialized"
			);
			return;
		}

		// Don't save empty messages array unless we explicitly want to clear storage
		if (chatMessages.length === 0) {
			console.log("Skipping chat message saving - no messages to save");
			return;
		}

		saveMessagesToStorage(chatMessages);

		// Debug logging to confirm saving
		console.log(
			`Saved ${chatMessages.length} chat messages for ${owner}/${repoName}`
		);
	}, [chatMessages, saveMessagesToStorage, owner, repoName, isInitialized]);

	const sendMessage = useCallback(
		async (message: string) => {
			if (!owner || !repoName) return;

			setIsChatLoading(true);
			setChatError(null);

			// Add user message immediately to the chat
			const userMessage: ChatMessage = {
				id: Date.now().toString(),
				role: "user",
				content: message,
				timestamp: new Date(),
			};

			setChatMessages((prev) => [...prev, userMessage]);

			// Get context from filtered commits (current search/filter results)
			const contextShas = filteredCommits.map((commit) => commit.sha);

			try {
				const response = await api.post<APIResponse>("/chat", {
					query: message,
					context_shas: contextShas,
				});

				const citedCommits = response.data.cited_commits || [];
				console.log("Full API response:", response.data);
				console.log("Cited commits raw data:", citedCommits);
				console.log(
					`AI response received with ${citedCommits.length} cited commits:`,
					citedCommits.map((c: Citation) => ({
						sha: c.sha.substring(0, 8),
						similarity: c.similarity
							? (c.similarity * 100).toFixed(1) + "%"
							: "unknown",
						message: c.message
							? c.message.substring(0, 50) + "..."
							: "no message",
					}))
				);

				const aiMessage: ChatMessage = {
					id: (Date.now() + 1).toString(),
					role: "assistant",
					content: response.data.response,
					timestamp: new Date(),
					citedCommits: citedCommits,
				};

				setChatMessages((prev) => [...prev, aiMessage]);
			} catch (error) {
				console.error("Chat API error:", error);
				setChatError(
					"Failed to get response from AI assistant. Please try again."
				);
			} finally {
				setIsChatLoading(false);
			}
		},
		[owner, repoName, filteredCommits]
	);

	const clearMessages = useCallback(() => {
		setChatMessages([]);
		// Also clear from localStorage
		const storageKey = getStorageKey();
		if (storageKey) {
			localStorage.removeItem(storageKey);
			console.log(
				`Cleared chat messages from localStorage for ${owner}/${repoName}`
			);
		}
	}, [getStorageKey, owner, repoName]);

	const clearError = useCallback(() => {
		setChatError(null);
	}, []);

	const clearAllChatHistory = useCallback(() => {
		// Clear all chat history for all repositories
		try {
			const keys = Object.keys(localStorage);
			keys.forEach((key) => {
				if (key.startsWith("git-odyssey-chat-")) {
					localStorage.removeItem(key);
				}
			});
		} catch (error) {
			console.error("Failed to clear all chat history:", error);
		}
	}, []);

	const reloadMessages = useCallback(() => {
		const messages = loadMessagesFromStorage();
		setChatMessages(messages);
		console.log(
			`Manually reloaded ${messages.length} chat messages for ${owner}/${repoName}`
		);
	}, [loadMessagesFromStorage, owner, repoName]);

	return {
		chatMessages,
		isChatLoading,
		chatError,
		sendMessage,
		clearMessages,
		clearError,
		clearAllChatHistory,
		reloadMessages,
	};
};
