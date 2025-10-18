from langchain_core.prompts import ChatPromptTemplate

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