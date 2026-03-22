import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineBanner } from "@/components/ui/inline-banner";
import { SidebarGroup } from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { Citations } from "@/components/ui/custom/Citations";
import { MarkdownRenderer } from "@/components/ui/custom/MarkdownRenderer";
import type { ChatMessage } from "@/lib/definitions/chat";

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSendMessage = () => {
    if (!inputMessage.trim() || isLoading) return;
    onSendMessage?.(inputMessage.trim());
    setInputMessage("");
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (timestamp: Date) =>
    timestamp.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <SidebarGroup className="min-h-0 flex-1 py-4">
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="workspace-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {messages.length === 0 && !isLoading ? (
            <EmptyState
              icon={<Bot className="size-4" />}
              title="Ask about this repository"
              description="Use chat to explain commits, summarize the current result set, or investigate what changed across branches."
            />
          ) : (
            messages.map((message) => {
              const isUser = message.role === "user";
              return (
                <div
                  key={message.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[88%] rounded-[14px] border px-3 py-3 ${
                      isUser
                        ? "border-[rgba(122,162,255,0.28)] bg-[rgba(122,162,255,0.1)]"
                        : "workspace-panel"
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2 text-xs text-text-tertiary">
                      <span className="flex size-5 items-center justify-center rounded-full border border-border-subtle bg-control">
                        {isUser ? <User className="size-3" /> : <Bot className="size-3" />}
                      </span>
                      <span>{isUser ? "You" : "Assistant"}</span>
                      <span className="font-mono">{formatTime(message.timestamp)}</span>
                    </div>

                    {message.isLoading ? (
                      <div className="flex items-center gap-2 text-sm text-text-secondary">
                        <Loader2 className="size-4 animate-spin" />
                        Thinking...
                      </div>
                    ) : message.role === "assistant" ? (
                      <>
                        <MarkdownRenderer content={message.content} />
                        {message.citedCommits?.length ? (
                          <Citations
                            citedCommits={message.citedCommits}
                            onCommitClick={onCommitClick}
                            className="mt-3"
                          />
                        ) : null}
                      </>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-6 text-text-primary">
                        {message.content}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {isLoading && messages[messages.length - 1]?.role === "user" ? (
            <div className="flex justify-start">
              <div className="workspace-panel flex max-w-[80%] items-center gap-2 px-3 py-3 text-sm text-text-secondary">
                <Loader2 className="size-4 animate-spin" />
                AI is typing...
              </div>
            </div>
          ) : null}

          <div ref={messagesEndRef} />
        </div>

        {error ? <InlineBanner tone="danger" title={error} /> : null}

        <div className="border-t border-border-subtle pt-4">
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={(event) => setInputMessage(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this repository..."
              className="min-h-[96px] resize-none pr-12"
              disabled={isLoading}
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isLoading}
              variant="accent"
              size="icon-sm"
              className="absolute right-2 bottom-2"
            >
              <Send className="size-4" />
            </Button>
          </div>
          <p className="mt-2 text-xs text-text-tertiary">
            Press Enter to send. Use Shift+Enter for a new line.
          </p>
        </div>
      </div>
    </SidebarGroup>
  );
}
