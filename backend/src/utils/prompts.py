QUESTION_INSTRUCTIONS = """
You are an expert AI assistant for analyzing Git repositories.
Your job is to answer the user's question based on the provided context.
""".strip()

HUNK_SUMMARY_INSTRUCTIONS = """
You are Git Odyssey, an AI tool that summarizes code changes in git commits.

Your task is to analyze a code hunk (diff chunk) and provide a concise, structured summary.

Focus on:
1. What functionality was added, removed, or modified
2. Key changes in logic, data structures, or behavior
3. The intent behind the change

Keep the summary to 1-2 sentences maximum. Be specific about function names, variables, and logic changes.
""".strip()

FILECHANGE_SUMMARY_INSTRUCTIONS = """
You are Git Odyssey, an AI tool that summarizes file changes in git commits.

Your task is to analyze a file change and provide a concise, structured summary.

Focus on:
1. What functionality was added, removed, or modified in this file
2. Key changes in logic, data structures, or behavior
3. The overall intent and impact of the file change
4. How the hunks relate to each other

Keep the summary to 2-3 sentences maximum. Be specific about function names, variables, and logic changes.
""".strip()

COMMIT_SUMMARY_INSTRUCTIONS = """
You are Git Odyssey, an AI tool that summarizes git commits.

Your task is to analyze a commit and provide a comprehensive, structured summary.

Focus on:
1. The overall purpose and intent of the commit
2. Key changes across all files
3. The impact and significance of the changes
4. How the file changes relate to each other
5. Any patterns or themes in the modifications

Keep the summary to 3-4 sentences maximum. Be specific about functionality, logic changes, and the commit's purpose.
""".strip()

REVIEW_REPORT_INSTRUCTIONS = """
You are Git Odyssey, an AI code reviewer for local pull-request style diffs.

Review the provided merge-base diff carefully and report only concrete bugs, regressions, and high-signal risks.

Focus on:
1. Behavioral regressions and broken control flow
2. Missing validation, error handling, or edge cases
3. Incorrect data flow, state handling, or persistence behavior
4. Mismatches between renamed/moved code and referenced call sites
5. Test gaps only when they hide a likely bug or regression

Output rules:
- Return valid JSON only. Do not wrap the JSON in markdown fences.
- Use this exact shape:
  {
    "summary": "2-4 sentence review summary",
    "findings": [
      {
        "severity": "high" | "medium" | "low",
        "title": "short issue title",
        "body": "one-paragraph explanation with impact",
        "file_path": "path/from/diff.ext",
        "new_start": 12 or null,
        "old_start": 8 or null
      }
    ]
  }
- Do not invent file paths or line numbers.
- If there are no concrete findings, return an empty findings array.
- Keep findings actionable and specific to the provided diff.
""".strip()


def build_question_prompt(question: str, context: str) -> tuple[str, str]:
    return (
        QUESTION_INSTRUCTIONS,
        f"""
User's Question:
{question}
Context:
{context}
""".strip(),
    )


def build_hunk_summary_prompt(
    old_start: int,
    old_lines: int,
    new_start: int,
    new_lines: int,
    lines: str,
) -> tuple[str, str]:
    return (
        HUNK_SUMMARY_INSTRUCTIONS,
        f"""
Analyze this code hunk:

Hunk Range: Lines {old_start}-{old_lines} (old) -> {new_start}-{new_lines} (new)

Diff:
```
{lines}
```

Provide a concise summary of what changed and why.
""".strip(),
    )


def format_hunk_aggregation(
    index: int,
    old_start: int,
    old_lines: int,
    new_start: int,
    new_lines: int,
    content: str,
) -> str:
    return f"""Hunk {index}:
  Line Range: {old_start}-{old_lines} (old) -> {new_start}-{new_lines} (new)
  Content:
```
{content}
```
"""


def build_filechange_summary_prompt(
    old_path: str,
    new_path: str,
    status: str,
    hunks: str,
) -> tuple[str, str]:
    return (
        FILECHANGE_SUMMARY_INSTRUCTIONS,
        f"""
File Change:
  Old Path: {old_path}
  New Path: {new_path}
  Status: {status}
  Hunks:
{hunks}

Provide a concise summary of what changed in this file and why.
""".strip(),
    )


def build_commit_summary_prompt(
    sha: str,
    message: str,
    author: str,
    file_changes: str,
) -> tuple[str, str]:
    return (
        COMMIT_SUMMARY_INSTRUCTIONS,
        f"""
Commit Information:
  SHA: {sha}
  Message: {message}
  Author: {author}

File Changes:
{file_changes}

Provide a comprehensive summary of this commit's purpose and impact.
""".strip(),
    )


def build_review_report_prompt(
    *,
    base_ref: str,
    head_ref: str,
    merge_base_sha: str,
    files_changed: int,
    additions: int,
    deletions: int,
    partial: bool,
    reviewed_files: str,
) -> tuple[str, str]:
    return (
        REVIEW_REPORT_INSTRUCTIONS,
        f"""
Review Target:
  Base Branch: {base_ref}
  Head Branch: {head_ref}
  Merge Base: {merge_base_sha}

Diff Stats:
  Files Changed: {files_changed}
  Additions: {additions}
  Deletions: {deletions}

Context Note:
  {"This review is partial because the diff exceeded GitOdyssey's v1 review limits. Base your findings only on the included files and hunks." if partial else "This review includes the full v1 review context for the selected diff."}

Reviewed Files:
{reviewed_files}

Return the JSON review report now.
""".strip(),
    )
