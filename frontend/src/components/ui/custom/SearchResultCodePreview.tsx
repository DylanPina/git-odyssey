import { createElement, useMemo, type ReactNode } from "react";
import { Editor } from "@monaco-editor/react";
import type * as MonacoEditor from "monaco-editor";
import hljs from "highlight.js/lib/common";

import { inferLanguage } from "@/lib/diff";
import { registerGitOdysseyMonacoTheme } from "@/lib/monacoTheme";
import type { FilterHighlightStrategy } from "@/lib/definitions/api";
import { cn } from "@/lib/utils";

const MAX_SNIPPET_LINES = 18;
const LINE_HEIGHT = 18;
const VERTICAL_PADDING = 16;
const PREVIEW_WRAP_COLUMN_ESTIMATE = 68;
const MAX_VISUAL_LINES = 16;

function compactSnippetLines(lines: string[]): string[] {
  const compacted: string[] = [];
  let lastWasBlank = false;

  for (const line of lines) {
    const isBlank = line.trim().length === 0;
    if (isBlank && lastWasBlank) {
      continue;
    }
    compacted.push(line);
    lastWasBlank = isBlank;
  }

  while (compacted[0]?.trim() === "") {
    compacted.shift();
  }
  while (compacted[compacted.length - 1]?.trim() === "") {
    compacted.pop();
  }

  return compacted;
}

function estimateVisualLineCount(
  value: string,
  wrapColumnEstimate: number,
): number {
  const lines = value.split("\n");
  return lines.reduce((total, line) => {
    const contentLength = Math.max(1, line.length);
    return total + Math.max(1, Math.ceil(contentLength / wrapColumnEstimate));
  }, 0);
}

function normalizeSemanticPreviewLines(value: string): string[] | null {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const addedOrContext: string[] = [];
  const removedOrContext: string[] = [];
  let sawAddedLine = false;

  for (const line of lines) {
    if (!line || line === "..." || line.startsWith("@@ ")) {
      continue;
    }

    const prefix = line[0];
    if (prefix === "+") {
      sawAddedLine = true;
      addedOrContext.push(line.slice(1));
      continue;
    }
    if (prefix === " ") {
      const content = line.slice(1);
      addedOrContext.push(content);
      removedOrContext.push(content);
      continue;
    }
    if (prefix === "-") {
      removedOrContext.push(line.slice(1));
      continue;
    }

    addedOrContext.push(line);
    removedOrContext.push(line);
  }

  const preferredLines = compactSnippetLines(
    sawAddedLine
      ? addedOrContext
      : removedOrContext,
  );

  if (preferredLines.length === 0) {
    return null;
  }

  return preferredLines;
}

export function normalizeSemanticPreviewSnippet(
  value: string,
  maxLines = MAX_SNIPPET_LINES,
): string | null {
  const preferredLines = normalizeSemanticPreviewLines(value);
  if (!preferredLines) {
    return null;
  }

  return preferredLines.slice(0, maxLines).join("\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlightedCode(
  value: string,
  matchedText?: string | null,
): ReactNode[] {
  const normalizedMatch = matchedText?.trim();
  if (!normalizedMatch) {
    return [value];
  }

  const parts = value.split(new RegExp(`(${escapeRegExp(normalizedMatch)})`, "gi"));
  return parts.map((part, index) =>
    part.toLowerCase() === normalizedMatch.toLowerCase() ? (
      <mark
        key={`${part}-${index}`}
        className="git-odyssey-search-code-match-highlight"
      >
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeHighlightLanguage(language?: string): string | undefined {
  if (!language) {
    return undefined;
  }

  if (language === "shell") {
    return "bash";
  }

  if (language === "html") {
    return "xml";
  }

  return language;
}

function highlightCodeToHtml(value: string, language?: string): string {
  const normalizedLanguage = normalizeHighlightLanguage(language);

  try {
    if (normalizedLanguage && hljs.getLanguage(normalizedLanguage)) {
      return hljs.highlight(value, {
        language: normalizedLanguage,
        ignoreIllegals: true,
      }).value;
    }

    return hljs.highlightAuto(value).value;
  } catch {
    return escapeHtml(value);
  }
}

function renderHighlightedHtmlWithExactMatches(
  html: string,
  matchedText?: string | null,
): ReactNode {
  if (typeof DOMParser === "undefined") {
    return renderHighlightedCode(html, matchedText);
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = document.body.firstElementChild;

  if (!root) {
    return null;
  }

  const transformNode = (node: ChildNode, key: string): ReactNode => {
    if (node.nodeType === node.TEXT_NODE) {
      return renderHighlightedCode(node.textContent ?? "", matchedText).map(
        (part, index) =>
          typeof part === "string"
            ? createElement("span", { key: `${key}-${index}` }, part)
            : createElement(
                "span",
                { key: `${key}-${index}` },
                part,
              ),
      );
    }

    if (node.nodeType !== node.ELEMENT_NODE) {
      return null;
    }

    const element = node as HTMLElement;
    const className = element.getAttribute("class") ?? undefined;
    const children = Array.from(element.childNodes)
      .map((child, index) => transformNode(child, `${key}-${index}`))
      .filter((child) => child !== null);

    return createElement(
      element.tagName.toLowerCase(),
      { key, className },
      children,
    );
  };

  return Array.from(root.childNodes)
    .map((child, index) => transformNode(child, `node-${index}`))
    .filter((child) => child !== null);
}

type SearchResultCodePreviewProps = {
  value: string;
  filePath: string;
  className?: string;
  onOpen?: (() => void) | undefined;
  useMonaco?: boolean;
  query?: string;
  highlightStrategy?: FilterHighlightStrategy;
  matchedText?: string | null;
};

export function SearchResultCodePreview({
  value,
  filePath,
  className,
  onOpen,
  useMonaco = true,
  query,
  highlightStrategy = "none",
  matchedText,
}: SearchResultCodePreviewProps) {
  const displayValue = useMemo(
    () => normalizeSemanticPreviewSnippet(value),
    [value],
  );
  const normalizedMatchedText = matchedText?.trim() || query?.trim() || null;
  const language = inferLanguage(filePath);
  const staticHighlightedContent = useMemo(
    () =>
      displayValue
        ? renderHighlightedHtmlWithExactMatches(
            highlightCodeToHtml(displayValue, language),
            shouldHighlightExactMatchRef(displayValue, normalizedMatchedText, highlightStrategy),
          )
        : null,
    [displayValue, highlightStrategy, language, normalizedMatchedText],
  );
  if (!displayValue) {
    return null;
  }

  const estimatedVisualLineCount = estimateVisualLineCount(
    displayValue,
    PREVIEW_WRAP_COLUMN_ESTIMATE,
  );
  const visibleLineCount = Math.max(
    1,
    Math.min(MAX_VISUAL_LINES, estimatedVisualLineCount),
  );
  const editorHeight = visibleLineCount * LINE_HEIGHT + VERTICAL_PADDING;
  const shouldHighlightExactMatch =
    highlightStrategy === "exact_query" && Boolean(normalizedMatchedText);
  const shellClassName = cn(
    "git-odyssey-search-code-shell",
    highlightStrategy === "target_hunk" &&
      "git-odyssey-search-code-shell--semantic",
    highlightStrategy === "file_header" &&
      "git-odyssey-search-code-shell--file-match",
    shouldHighlightExactMatch &&
      "git-odyssey-search-code-shell--exact-match",
  );

  return (
    <div className={cn(className)} data-testid="search-result-code-preview">
      <div
        className={shellClassName}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (!onOpen) {
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
        role={onOpen ? "button" : undefined}
        tabIndex={onOpen ? 0 : undefined}
      >
        {useMonaco ? (
          <Editor
            height={`${editorHeight}px`}
            defaultLanguage={language}
            value={displayValue}
            theme="git-odyssey-dark"
            beforeMount={(monaco: typeof MonacoEditor) => {
              registerGitOdysseyMonacoTheme(monaco);
            }}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              glyphMargin: false,
              folding: false,
              lineNumbers: "off",
              lineDecorationsWidth: 0,
              renderLineHighlight: "none",
              overviewRulerBorder: false,
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: "on",
              wrappingIndent: "indent",
              fontSize: 12,
              lineHeight: LINE_HEIGHT,
              fontFamily: "IBM Plex Mono",
              scrollbar: {
                vertical: "auto",
                horizontal: "auto",
                alwaysConsumeMouseWheel: false,
                handleMouseWheel: true,
              },
              padding: {
                top: 8,
                bottom: 8,
              },
              guides: {
                indentation: false,
                highlightActiveIndentation: false,
              },
              stickyScroll: {
                enabled: false,
              },
              contextmenu: false,
              domReadOnly: true,
            }}
          />
        ) : (
          <pre
            data-testid="search-result-code-preview-static"
            className="git-odyssey-search-code-pre"
          >
            <code
              data-testid="search-result-code-preview-static-code"
              className={cn(
                "hljs",
                language ? `language-${normalizeHighlightLanguage(language)}` : undefined,
              )}
            >
              {staticHighlightedContent}
            </code>
          </pre>
        )}
      </div>
    </div>
  );
}

function shouldHighlightExactMatchRef(
  displayValue: string,
  normalizedMatchedText: string | null,
  highlightStrategy: FilterHighlightStrategy,
): string | null {
  if (highlightStrategy !== "exact_query" || !normalizedMatchedText) {
    return null;
  }

  return displayValue.toLowerCase().includes(normalizedMatchedText.toLowerCase())
    ? normalizedMatchedText
    : null;
}

export default SearchResultCodePreview;
