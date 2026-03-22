import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

import { cn } from "@/lib/utils";

import "highlight.js/styles/github-dark.css";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({
  content,
  className,
}: MarkdownRendererProps) {
  if (!content || content.trim() === "") {
    return null;
  }

  return (
    <div className={cn("prose prose-invert max-w-none text-sm", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-3 mt-4 text-lg font-semibold text-text-primary first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-4 text-base font-semibold text-text-primary">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-3 text-sm font-semibold text-text-primary">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="mb-3 whitespace-pre-wrap text-sm leading-6 text-text-secondary last:mb-0">
              {children}
            </p>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="rounded-[8px] border border-border-subtle bg-control px-1.5 py-0.5 font-mono text-xs text-[#c7d8ff]">
                  {children}
                </code>
              );
            }
            return <code className={className}>{children}</code>;
          },
          pre: ({ children }) => (
            <pre className="workspace-panel overflow-x-auto p-3 text-xs leading-6">
              {children}
            </pre>
          ),
          ul: ({ children }) => (
            <ul className="mb-3 list-disc space-y-1 pl-5 text-sm leading-6 text-text-secondary">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-text-secondary">
              {children}
            </ol>
          ),
          li: ({ children }) => <li>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="rounded-r-[10px] border-l-2 border-accent bg-[rgba(122,162,255,0.08)] px-3 py-2 text-sm italic text-text-secondary">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="workspace-panel overflow-x-auto">
              <table className="min-w-full border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-border-subtle bg-control">{children}</thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b border-border-subtle last:border-b-0">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-sm text-text-secondary">{children}</td>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline-offset-4 hover:text-[#9bb9ff] hover:underline"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-text-primary">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-text-secondary">{children}</em>,
          hr: () => <hr className="my-3 border-border-subtle" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
