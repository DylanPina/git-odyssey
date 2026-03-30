import type { DiffViewerSide } from "@/lib/diff";

export type Citation = {
	sha: string;
	similarity: number;
	message: string;
};

export type ChatCodeContext = {
	id: string;
	filePath: string;
	side: DiffViewerSide;
	startLine: number;
	startColumn: number;
	endLine: number;
	endColumn: number;
	selectedText: string;
	language?: string;
	isTruncated?: boolean;
};

export type ChatMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: Date;
	isLoading?: boolean;
	citedCommits?: Citation[];
	codeContexts?: ChatCodeContext[];
};

export type ChatState = {
	messages: ChatMessage[];
	isLoading: boolean;
	error: string | null;
};

export type ChatProps = {
	onSendMessage?: (message: string) => void;
	messages?: ChatMessage[];
	isLoading?: boolean;
	error?: string | null;
};
