from langchain_core.prompts import ChatPromptTemplate, PromptTemplate

QUESTION_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """
You are an expert AI assistant for analyzing Git repositories.
Your job is to answer the user's question based on the provided context.

""",
        ),
        (
            "human",
            """
User's Question:
{question}
Context:
{context}
""",
        ),
    ]
)

HUNK_SUMMARY_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """You are Git Odyssey, an AI tool that summarizes code changes in git commits. 
            
Your task is to analyze a code hunk (diff chunk) and provide a concise, structured summary.

Focus on:
1. What functionality was added, removed, or modified
2. Key changes in logic, data structures, or behavior
3. The intent behind the change

Keep the summary to 1-2 sentences maximum. Be specific about function names, variables, and logic changes.""",
        ),
        (
            "human",
            """Analyze this code hunk:

Hunk Range: Lines {old_start}-{old_lines} (old) -> {new_start}-{new_lines} (new)

Diff:
```
{lines}
```

Provide a concise summary of what changed and why.""",
        ),
    ]
)

HUNK_AGGREGATION_PROMPT = PromptTemplate(
    input_variables=["index", "old_start", "old_lines", "new_start", "new_lines", "content"],
    template="""Hunk {index}:
  Line Range: {old_start}-{old_lines} (old) -> {new_start}-{new_lines} (new)
  Content:
```
{content}
```

"""
)

FILECHANGE_SUMMARY_PROMPT = PromptTemplate(
    input_variables=["old_path", "new_path", "status", "hunks"],
    template="""You are Git Odyssey, an AI tool that summarizes file changes in git commits.

Your task is to analyze a file change and provide a concise, structured summary.

Focus on:
1. What functionality was added, removed, or modified in this file
2. Key changes in logic, data structures, or behavior
3. The overall intent and impact of the file change
4. How the hunks relate to each other

Keep the summary to 2-3 sentences maximum. Be specific about function names, variables, and logic changes.

File Change:
  Old Path: {old_path}
  New Path: {new_path}
  Status: {status}
  Hunks:
{hunks}

Provide a concise summary of what changed in this file and why."""
)

COMMIT_SUMMARY_PROMPT = PromptTemplate(
    input_variables=["sha", "message", "author", "file_changes"],
    template="""You are Git Odyssey, an AI tool that summarizes git commits.

Your task is to analyze a commit and provide a comprehensive, structured summary.

Focus on:
1. The overall purpose and intent of the commit
2. Key changes across all files
3. The impact and significance of the changes
4. How the file changes relate to each other
5. Any patterns or themes in the modifications

Keep the summary to 3-4 sentences maximum. Be specific about functionality, logic changes, and the commit's purpose.

Commit Information:
  SHA: {sha}
  Message: {message}
  Author: {author}
  
File Changes:
{file_changes}

Provide a comprehensive summary of this commit's purpose and impact."""
)
