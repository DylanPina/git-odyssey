import { Children, type ReactNode, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

import {
	createReviewChatReferenceMatcher,
	type ReviewChatReferenceTarget,
} from "@/lib/reviewChatReferences";
import { normalizeRepoPath } from "@/lib/repoPaths";
import { cn } from "@/lib/utils";

export type { ReviewChatReferenceTarget } from "@/lib/reviewChatReferences";

interface MarkdownRendererProps {
	content: string;
	className?: string;
	reviewReferencePaths?: readonly string[];
	onReviewReferenceClick?: (target: ReviewChatReferenceTarget) => void;
	reviewReferenceRepoPath?: string | null;
}

function flattenTextContent(children: ReactNode): string {
	return Children.toArray(children)
		.map((child) => {
			if (typeof child === "string" || typeof child === "number") {
				return String(child);
			}

			return "";
		})
		.join("");
}

function isLocalPathHref(href?: string) {
	if (!href) {
		return false;
	}

	return href.startsWith("/") || href.startsWith("file://");
}

function normalizeReviewReferenceHref(
	href: string | undefined,
	reviewReferenceRepoPath?: string | null,
) {
	if (!href) {
		return null;
	}

	let normalizedHref = href;

	if (normalizedHref.startsWith("file://")) {
		try {
			normalizedHref = decodeURIComponent(new URL(normalizedHref).pathname);
		} catch {
			return null;
		}
	}

	if (!normalizedHref.startsWith("/")) {
		return normalizedHref;
	}

	if (!reviewReferenceRepoPath) {
		return normalizedHref;
	}

	const normalizedRepoPath = normalizeRepoPath(reviewReferenceRepoPath);
	normalizedHref = normalizeRepoPath(normalizedHref);

	if (normalizedHref === normalizedRepoPath) {
		return "";
	}

	const repoPrefix = `${normalizedRepoPath}/`;
	if (!normalizedHref.startsWith(repoPrefix)) {
		return normalizedHref;
	}

	return normalizedHref.slice(repoPrefix.length);
}

export function MarkdownRenderer({
	content,
	className,
	reviewReferencePaths,
	onReviewReferenceClick,
	reviewReferenceRepoPath,
}: MarkdownRendererProps) {
	const reviewReferenceMatcher = useMemo(
		() => createReviewChatReferenceMatcher(reviewReferencePaths ?? []),
		[reviewReferencePaths],
	);

	const renderReferenceButton = (
		text: string,
		target: ReviewChatReferenceTarget,
		key: string,
	) => (
		<button
			key={key}
			type="button"
			onClick={() => onReviewReferenceClick?.(target)}
			title={`Jump to ${target.filePath}${target.line ? `:${target.line}` : ""} in diff`}
			className="inline cursor-pointer border-0 bg-transparent p-0 text-left font-mono text-accent underline underline-offset-4 transition-colors [overflow-wrap:anywhere] hover:text-[#9bb9ff]"
		>
			{text}
		</button>
	);

	const renderInlineChildrenWithReferences = (
		children: ReactNode,
		keyPrefix: string,
	) => {
		if (!reviewReferenceMatcher || !onReviewReferenceClick) {
			return children;
		}

		return Children.toArray(children).flatMap((child, childIndex) => {
			if (typeof child !== "string") {
				return child;
			}

			const matches = reviewReferenceMatcher.findMatches(child);
			if (matches.length === 0) {
				return child;
			}

			const nodes: ReactNode[] = [];
			let cursor = 0;

			matches.forEach((match, matchIndex) => {
				if (match.start > cursor) {
					nodes.push(child.slice(cursor, match.start));
				}

				nodes.push(
					renderReferenceButton(
						match.text,
						match.target,
						`${keyPrefix}-${childIndex}-${matchIndex}`,
					),
				);
				cursor = match.end;
			});

			if (cursor < child.length) {
				nodes.push(child.slice(cursor));
			}

			return nodes;
		});
	};

	if (!content || content.trim() === "") {
		return null;
	}

	return (
		<div
			className={cn(
				"prose prose-invert max-w-none text-sm [overflow-wrap:anywhere]",
				className,
			)}
		>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[rehypeHighlight]}
				components={{
					h1: ({ children }) => (
						<h1 className="mb-3 mt-4 text-lg font-semibold text-text-primary first:mt-0">
							{renderInlineChildrenWithReferences(children, "h1")}
						</h1>
					),
					h2: ({ children }) => (
						<h2 className="mb-2 mt-4 text-base font-semibold text-text-primary">
							{renderInlineChildrenWithReferences(children, "h2")}
						</h2>
					),
					h3: ({ children }) => (
						<h3 className="mb-2 mt-3 text-sm font-semibold text-text-primary">
							{renderInlineChildrenWithReferences(children, "h3")}
						</h3>
					),
					p: ({ children }) => (
						<p className="mb-3 whitespace-pre-wrap text-sm leading-6 text-text-secondary last:mb-0">
							{renderInlineChildrenWithReferences(children, "p")}
						</p>
					),
					code: ({ children, className }) => {
						const isInline = !className;
						if (isInline) {
							const textContent = flattenTextContent(children);
							const target =
								reviewReferenceMatcher?.resolveExactReference(textContent) ?? null;

							if (target && onReviewReferenceClick) {
								return (
									<button
										type="button"
										onClick={() => onReviewReferenceClick(target)}
										title={`Jump to ${target.filePath}${target.line ? `:${target.line}` : ""} in diff`}
										className="inline max-w-full cursor-pointer border-0 bg-transparent p-0 text-left"
									>
										<code className="rounded-[8px] border border-border-subtle bg-control px-1.5 py-0.5 font-mono text-xs break-all text-[#c7d8ff]">
											{children}
										</code>
									</button>
								);
							}

							return (
								<code className="rounded-[8px] border border-border-subtle bg-control px-1.5 py-0.5 font-mono text-xs break-all text-[#c7d8ff]">
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
					li: ({ children }) => (
						<li>{renderInlineChildrenWithReferences(children, "li")}</li>
					),
					blockquote: ({ children }) => (
						<blockquote className="rounded-r-[10px] border-l-2 border-accent bg-[rgba(122,162,255,0.08)] px-3 py-2 text-sm italic text-text-secondary">
							{renderInlineChildrenWithReferences(children, "blockquote")}
						</blockquote>
					),
					table: ({ children }) => (
						<div className="workspace-panel overflow-x-auto">
							<table className="min-w-full border-collapse">{children}</table>
						</div>
					),
					thead: ({ children }) => (
						<thead className="border-b border-border-subtle bg-control">
							{children}
						</thead>
					),
					tbody: ({ children }) => <tbody>{children}</tbody>,
					tr: ({ children }) => (
						<tr className="border-b border-border-subtle last:border-b-0">
							{children}
						</tr>
					),
					th: ({ children }) => (
						<th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">
							{renderInlineChildrenWithReferences(children, "th")}
						</th>
					),
					td: ({ children }) => (
						<td className="px-3 py-2 text-sm text-text-secondary">
							{renderInlineChildrenWithReferences(children, "td")}
						</td>
					),
					a: ({ children, href }) => (
						(() => {
							const normalizedHref = normalizeReviewReferenceHref(
								href,
								reviewReferenceRepoPath,
							);
							const hrefTarget =
								reviewReferenceMatcher?.resolveExactReference(
									normalizedHref ?? href ?? "",
								) ?? null;

							if (hrefTarget && onReviewReferenceClick) {
								return renderReferenceButton(
									flattenTextContent(children) || hrefTarget.filePath,
									hrefTarget,
									`anchor-${hrefTarget.filePath}-${hrefTarget.line ?? "file"}`,
								);
							}

							if (reviewReferenceMatcher && isLocalPathHref(href)) {
								return <span className="text-text-secondary">{children}</span>;
							}

							return (
								<a
									href={href}
									target="_blank"
									rel="noopener noreferrer"
									className="text-accent underline-offset-4 hover:text-[#9bb9ff] hover:underline"
								>
									{children}
								</a>
							);
						})()
					),
					strong: ({ children }) => (
						<strong className="font-semibold text-text-primary">
							{renderInlineChildrenWithReferences(children, "strong")}
						</strong>
					),
					em: ({ children }) => (
						<em className="italic text-text-secondary">
							{renderInlineChildrenWithReferences(children, "em")}
						</em>
					),
					hr: () => <hr className="my-3 border-border-subtle" />,
				}}
			>
				{content}
			</ReactMarkdown>
		</div>
	);
}
