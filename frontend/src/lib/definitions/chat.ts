export type Citation = {
    sha: string;
    similarity: number;
    message: string;
  };
  
  export type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
    isLoading?: boolean;
    citedCommits?: Citation[];
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
  