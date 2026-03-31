import { useMemo } from "react";
import { Editor } from "@monaco-editor/react";
import type * as MonacoEditor from "monaco-editor";

import { inferLanguage } from "@/lib/diff";
import { registerGitOdysseyMonacoTheme } from "@/lib/monacoTheme";
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

type SearchResultCodePreviewProps = {
  value: string;
  filePath: string;
  className?: string;
  onOpen?: (() => void) | undefined;
};

export function SearchResultCodePreview({
  value,
  filePath,
  className,
  onOpen,
}: SearchResultCodePreviewProps) {
  const displayValue = useMemo(
    () => normalizeSemanticPreviewSnippet(value),
    [value],
  );
  const language = inferLanguage(filePath);
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

  return (
    <div className={cn(className)} data-testid="search-result-code-preview">
      <div
        className="git-odyssey-search-code-shell"
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
      </div>
    </div>
  );
}

export default SearchResultCodePreview;
