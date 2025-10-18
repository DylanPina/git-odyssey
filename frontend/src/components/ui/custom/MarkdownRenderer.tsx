import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils";

// Import highlight.js CSS for syntax highlighting
import "highlight.js/styles/github-dark.css";

interface MarkdownRendererProps {
	content: string;
	className?: string;
}

/**
 * MarkdownRenderer - A component that renders markdown content with syntax highlighting
 * and custom styling optimized for the dark chat interface.
 *
 * Features:
 * - GitHub Flavored Markdown (GFM) support
 * - Syntax highlighting for code blocks
 * - Custom dark theme styling
 * - Responsive tables and lists
 * - Secure rendering (no raw HTML)
 *
 * @param content - The markdown content to render
 * @param className - Optional additional CSS classes
 */
export function MarkdownRenderer({
	content,
	className,
}: MarkdownRendererProps) {
	// Handle empty or null content
	if (!content || content.trim() === "") {
		return null;
	}

	return (
		<div className={cn("prose prose-invert max-w-none text-sm", className)}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[rehypeHighlight]}
				components={{
					// Custom styling for different markdown elements
					h1: ({ children }) => (
						<h1 className="text-lg font-bold text-white mb-2 mt-4 first:mt-0">
							{children}
						</h1>
					),
					h2: ({ children }) => (
						<h2 className="text-base font-semibold text-white mb-2 mt-3">
							{children}
						</h2>
					),
					h3: ({ children }) => (
						<h3 className="text-sm font-semibold text-white mb-1 mt-2">
							{children}
						</h3>
					),
					p: ({ children }) => (
						<p className="text-sm text-white mb-2 last:mb-0 leading-relaxed whitespace-pre-wrap">
							{children}
						</p>
					),
					code: ({ children, className }) => {
						const isInline = !className;
						if (isInline) {
							return (
								<code className="bg-neutral-700 text-blue-300 px-1.5 py-0.5 rounded text-xs font-mono">
									{children}
								</code>
							);
						}
						return <code className={className}>{children}</code>;
					},
					pre: ({ children }) => (
						<pre className="bg-neutral-900 border border-neutral-700 rounded-lg p-3 overflow-x-auto mb-3 text-xs">
							{children}
						</pre>
					),
					ul: ({ children }) => (
						<ul className="list-disc list-inside text-sm text-white mb-2 space-y-1">
							{children}
						</ul>
					),
					ol: ({ children }) => (
						<ol className="list-decimal list-inside text-sm text-white mb-2 space-y-1">
							{children}
						</ol>
					),
					li: ({ children }) => (
						<li className="text-sm text-white">{children}</li>
					),
					blockquote: ({ children }) => (
						<blockquote className="border-l-4 border-blue-500 pl-3 py-1 my-2 bg-neutral-800/50 rounded-r">
							<div className="text-sm text-neutral-300 italic">{children}</div>
						</blockquote>
					),
					table: ({ children }) => (
						<div className="overflow-x-auto mb-3">
							<table className="min-w-full border border-neutral-700 rounded-lg">
								{children}
							</table>
						</div>
					),
					thead: ({ children }) => (
						<thead className="bg-neutral-800">{children}</thead>
					),
					tbody: ({ children }) => (
						<tbody className="bg-neutral-900">{children}</tbody>
					),
					tr: ({ children }) => (
						<tr className="border-b border-neutral-700">{children}</tr>
					),
					th: ({ children }) => (
						<th className="px-3 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider">
							{children}
						</th>
					),
					td: ({ children }) => (
						<td className="px-3 py-2 text-sm text-white">{children}</td>
					),
					a: ({ children, href }) => (
						<a
							href={href}
							target="_blank"
							rel="noopener noreferrer"
							className="text-blue-400 hover:text-blue-300 underline"
						>
							{children}
						</a>
					),
					strong: ({ children }) => (
						<strong className="font-semibold text-white">{children}</strong>
					),
					em: ({ children }) => (
						<em className="italic text-neutral-300">{children}</em>
					),
					hr: () => <hr className="border-neutral-700 my-3" />,
				}}
			>
				{content}
			</ReactMarkdown>
		</div>
	);
}
