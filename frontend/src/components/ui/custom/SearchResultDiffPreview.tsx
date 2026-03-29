import { useMemo } from "react";
import hljs from "highlight.js/lib/core";
import diff from "highlight.js/lib/languages/diff";

import { cn } from "@/lib/utils";

let diffLanguageRegistered = false;

function ensureDiffLanguage() {
  if (diffLanguageRegistered) {
    return;
  }

  hljs.registerLanguage("diff", diff);
  diffLanguageRegistered = true;
}

type SearchResultDiffPreviewProps = {
  value: string;
  className?: string;
};

export function SearchResultDiffPreview({
  value,
  className,
}: SearchResultDiffPreviewProps) {
  const highlightedHtml = useMemo(() => {
    ensureDiffLanguage();
    return hljs.highlight(value, {
      language: "diff",
      ignoreIllegals: true,
    }).value;
  }, [value]);

  return (
    <div className={cn("git-odyssey-search-diff-shell", className)}>
      <pre className="git-odyssey-search-diff-pre">
        <code
          className="hljs language-diff"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      </pre>
    </div>
  );
}

export default SearchResultDiffPreview;
