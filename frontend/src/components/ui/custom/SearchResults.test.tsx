import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import SearchResults from "@/components/ui/custom/SearchResults";
import type { FilterSearchResult } from "@/lib/definitions/api";
import type { Commit } from "@/lib/definitions/repo";

vi.mock("@/components/ui/custom/SearchResultCodePreview", () => ({
  SearchResultCodePreview: (props: {
    value: string;
    filePath: string;
    query?: string;
    highlightStrategy?: string;
    matchedText?: string | null;
    expandedValue?: string | null;
    expandedLine?: number | null;
  }) => (
    <div
      data-testid="mock-code-preview"
      data-file-path={props.filePath}
      data-query={props.query ?? ""}
      data-highlight-strategy={props.highlightStrategy ?? ""}
      data-matched-text={props.matchedText ?? ""}
      data-expanded-line={props.expandedLine ?? ""}
      data-has-expanded-value={props.expandedValue ? "yes" : "no"}
    >
      {props.value}
    </div>
  ),
  normalizeSemanticPreviewSnippet: (value: string) =>
    value.includes("...") && value.trim() === "@@ -1,1 +1,1 @@\n..."
      ? null
      : "normalized preview",
}));

vi.mock("@/components/ui/custom/SearchResultDiffPreview", () => ({
  SearchResultDiffPreview: (props: { value: string }) => (
    <div data-testid="mock-diff-preview">{props.value}</div>
  ),
}));

function buildCommit(overrides: Partial<Commit> = {}): Commit {
  return {
    sha: "abc1234567890",
    repo_path: "/tmp/repo",
    parents: [],
    author: "Casey",
    email: "casey@example.com",
    time: 1_700_000_000,
    message: "Refine auth flow",
    file_changes: [
      {
        commit_sha: "abc1234567890",
        new_path: "src/auth.ts",
        old_path: "src/auth.ts",
        status: "modified",
        hunks: [],
        snapshot: {
          id: 1,
          path: "src/auth.ts",
          content: Array.from(
            { length: 20 },
            (_, index) => `const line${index + 1} = ${index + 1};`,
          ).join("\n"),
          previous_snapshot: {
            id: 2,
            path: "src/auth.ts",
            content: Array.from(
              { length: 20 },
              (_, index) => `const oldLine${index + 1} = ${index + 1};`,
            ).join("\n"),
            commit_sha: "prev123",
          },
          commit_sha: "abc1234567890",
        },
      },
    ],
    summary: null,
    ...overrides,
  };
}

function buildResult(overrides: Partial<FilterSearchResult> = {}): FilterSearchResult {
  return {
    sha: "abc1234567890",
    similarity: 0.12,
    display_match: {
      match_type: "hunk",
      file_path: "src/auth.ts",
      hunk_id: 11,
      new_start: 10,
      old_start: 9,
      preview: "@@ -9,1 +10,2 @@\n-const oldToken = false;\n+const authToken = true;",
      preview_kind: "diff",
      highlight_strategy: "target_hunk",
    },
    ...overrides,
  };
}

describe("SearchResults", () => {
  it("renders Monaco code previews for semantic diff results", () => {
    render(
      <MemoryRouter>
        <SearchResults
          allCommitsCount={1}
          repoPath="/tmp/repo"
          filteredCommits={[buildCommit()]}
          searchResults={[buildResult()]}
          onCommitClick={() => {}}
          query="auth"
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("mock-code-preview")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-diff-preview")).not.toBeInTheDocument();
  });

  it("renders Monaco code previews for exact diff matches when the snippet is readable", () => {
    render(
      <MemoryRouter>
        <SearchResults
          allCommitsCount={1}
          repoPath="/tmp/repo"
          filteredCommits={[buildCommit()]}
          searchResults={[
            buildResult({
              similarity: null,
              display_match: {
                ...buildResult().display_match!,
                matched_text: "auth",
                highlight_strategy: "exact_query",
              },
            }),
          ]}
          onCommitClick={() => {}}
          query="auth"
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("mock-code-preview")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-diff-preview")).not.toBeInTheDocument();
    expect(screen.getByTestId("mock-code-preview")).toHaveAttribute(
      "data-highlight-strategy",
      "exact_query",
    );
    expect(screen.getByTestId("mock-code-preview")).toHaveAttribute(
      "data-matched-text",
      "auth",
    );
  });

  it("falls back to the diff preview when a semantic result lacks a file path", () => {
    render(
      <MemoryRouter>
        <SearchResults
          allCommitsCount={1}
          repoPath="/tmp/repo"
          filteredCommits={[buildCommit()]}
          searchResults={[
            buildResult({
              display_match: {
                ...buildResult().display_match!,
                file_path: null,
              },
            }),
          ]}
          onCommitClick={() => {}}
          query="auth"
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("mock-diff-preview")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-code-preview")).not.toBeInTheDocument();
  });

  it("falls back to the diff preview when the diff cannot be normalized into code", () => {
    render(
      <MemoryRouter>
        <SearchResults
          allCommitsCount={1}
          repoPath="/tmp/repo"
          filteredCommits={[buildCommit()]}
          searchResults={[
            buildResult({
              display_match: {
                ...buildResult().display_match!,
                preview: "@@ -1,1 +1,1 @@\n...\n",
              },
            }),
          ]}
          onCommitClick={() => {}}
          query="auth"
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("mock-diff-preview")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-code-preview")).not.toBeInTheDocument();
  });

  it("renders the searching overlay while a repo search is in flight", () => {
    render(
      <MemoryRouter>
        <SearchResults
          allCommitsCount={1}
          repoPath="/tmp/repo"
          filteredCommits={[buildCommit()]}
          searchResults={[buildResult()]}
          totalRelevantResults={1}
          isSearching
          onCommitClick={() => {}}
          query="auth"
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Refreshing search")).toBeInTheDocument();
    expect(screen.getByText("Showing 1 relevant commit")).toBeInTheDocument();
    expect(screen.getByText("Refine auth flow")).toBeInTheDocument();
  });

  it("renders all thresholded search results in backend order without a client-side cap", () => {
    const commits = Array.from({ length: 26 }, (_, index) =>
      buildCommit({
        sha: `sha-${index}`,
        message: `Commit ${index + 1}`,
      }),
    );
    const results = Array.from({ length: 26 }, (_, index) =>
      buildResult({
        sha: `sha-${index}`,
      }),
    );

    render(
      <MemoryRouter>
        <SearchResults
          allCommitsCount={26}
          repoPath="/tmp/repo"
          filteredCommits={commits}
          searchResults={results}
          totalRelevantResults={26}
          onCommitClick={() => {}}
          query="auth"
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Showing 26 relevant commits")).toBeInTheDocument();
    expect(screen.getByText("Commit 26")).toBeInTheDocument();
    expect(
      screen.queryByText(/Showing the first 25 matches/i),
    ).not.toBeInTheDocument();
  });

  it("shows load more when additional relevant results are available", () => {
    render(
      <MemoryRouter>
        <SearchResults
          allCommitsCount={40}
          repoPath="/tmp/repo"
          filteredCommits={[buildCommit()]}
          searchResults={[buildResult()]}
          searchMaxResults={20}
          totalRankedResults={40}
          totalRelevantResults={31}
          hasMoreRelevant
          onLoadMore={() => {}}
          onCommitClick={() => {}}
          query="auth"
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Showing 1 of 31 relevant commits")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load more (40)" })).toBeInTheDocument();
  });
});
