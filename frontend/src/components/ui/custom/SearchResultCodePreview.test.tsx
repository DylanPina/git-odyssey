import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  SearchResultCodePreview,
  normalizeSemanticPreviewSnippet,
} from "@/components/ui/custom/SearchResultCodePreview";

const monacoHarness = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
  beforeMountCalls: 0,
}));

vi.mock("@monaco-editor/react", async () => {
  const React = await import("react");

  return {
    Editor: (props: Record<string, unknown> & { beforeMount?: (monaco: unknown) => void }) => {
      monacoHarness.props = props;
      React.useEffect(() => {
        props.beforeMount?.({
          editor: {
            defineTheme() {},
          },
        });
        monacoHarness.beforeMountCalls += 1;
      }, [props]);

      return React.createElement("div", {
        "data-testid": "mock-monaco-editor",
      });
    },
  };
});

describe("normalizeSemanticPreviewSnippet", () => {
  it("removes diff chrome and prefers added lines with context", () => {
    expect(
      normalizeSemanticPreviewSnippet(
        "@@ -10,2 +10,3 @@\n const oldValue = 1;\n-const staleToken = false;\n+const authToken = true;\n...\n",
      ),
    ).toBe("const oldValue = 1;\nconst authToken = true;");
  });

  it("falls back to removed lines when no added lines exist", () => {
    expect(
      normalizeSemanticPreviewSnippet(
        "@@ -4,2 +4,0 @@\n-function removeAuth() {\n-  return false;\n }\n",
      ),
    ).toBe("function removeAuth() {\n  return false;\n}");
  });

  it("returns null when no readable code lines remain", () => {
    expect(normalizeSemanticPreviewSnippet("@@ -1,1 +1,1 @@\n...\n")).toBeNull();
  });
});

describe("SearchResultCodePreview", () => {
  it("renders a Monaco snippet with inferred language and minimal options", () => {
    render(
      <SearchResultCodePreview
        filePath="src/auth.ts"
        value={"@@ -1,1 +1,2 @@\n-const oldValue = false;\n+const authToken = true;\n"}
      />,
    );

    expect(screen.getByTestId("search-result-code-preview")).toBeInTheDocument();
    expect(screen.getByTestId("mock-monaco-editor")).toBeInTheDocument();
    expect(monacoHarness.beforeMountCalls).toBeGreaterThan(0);
    expect(monacoHarness.props).toMatchObject({
      defaultLanguage: "typescript",
      theme: "git-odyssey-dark",
      value: "const authToken = true;",
    });
    expect(monacoHarness.props?.options).toMatchObject({
      readOnly: true,
      lineNumbers: "off",
      glyphMargin: false,
      folding: false,
      scrollbar: {
        vertical: "auto",
        horizontal: "auto",
      },
    });
  });

  it("shows the normalized hunk snippet without expand controls", () => {
    render(
      <SearchResultCodePreview
        filePath="src/auth.ts"
        value={
          "@@ -1,2 +1,6 @@\n const oldValue = false;\n+const authToken = true;\n+const authMode = 'strict';\n+const authScope = 'admin';\n+const authPolicy = 'required';\n"
        }
      />,
    );

    expect(monacoHarness.props?.value).toContain("const authToken = true;");
    expect(monacoHarness.props?.value).toContain("const authScope = 'admin';");
    expect(screen.queryByRole("button", { name: /show more/i })).not.toBeInTheDocument();
  });

  it("renders nothing when the diff preview cannot be normalized", () => {
    const { container } = render(
      <SearchResultCodePreview filePath="src/auth.ts" value={"@@ -1,1 +1,1 @@\n...\n"} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
