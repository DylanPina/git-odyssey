from langchain_google_genai import ChatGoogleGenerativeAI
from utils.prompts import QUESTION_PROMPT, HUNK_SUMMARY_PROMPT, HUNK_AGGREGATION_PROMPT, FILECHANGE_SUMMARY_PROMPT, COMMIT_SUMMARY_PROMPT
from data.data_model import DiffHunk, FileChange, Commit
from langchain_core.output_parsers import StrOutputParser

class AIEngine:
    def __init__(self, model: str="gemini-2.5-flash", temperature: float=0.2):
        self.llm = ChatGoogleGenerativeAI(model=model, temperature=temperature)

    def answer_question(self, question: str, context: str) -> str:
        chain = QUESTION_PROMPT | self.llm | StrOutputParser()
        return chain.invoke({"question": question, "context": context})
    
    def summarize_hunk(self, hunk: DiffHunk) -> str:
        """Generate a summary for a diff hunk using raw content."""
        response = self.llm.invoke(
            HUNK_SUMMARY_PROMPT.format_messages(
                old_start=hunk.old_start,
                old_lines=hunk.old_lines,
                new_start=hunk.new_start,
                new_lines=hunk.new_lines,
                lines=hunk.content.strip(),
            )
        )
        return response.content.strip()
    
    def summarize_filechange(self, file_change: FileChange) -> str:
        """Generate a summary for a file change."""
        # Format each hunk using HUNK_AGGREGATION_PROMPT
        formatted_hunks = []
        for i, hunk in enumerate(file_change.hunks, 1):
            formatted_hunk = HUNK_AGGREGATION_PROMPT.format(
                index=i,
                old_start=hunk.old_start,
                old_lines=hunk.old_lines,
                new_start=hunk.new_start,
                new_lines=hunk.new_lines,
                content=hunk.content or ""
            )
            formatted_hunks.append(formatted_hunk)
        
        # Join all formatted hunks
        hunks_text = "\n".join(formatted_hunks)
        
        # Use FILECHANGE_SUMMARY_PROMPT to summarize the file change
        chain = FILECHANGE_SUMMARY_PROMPT | self.llm | StrOutputParser()
        return chain.invoke({
            "old_path": file_change.old_path,
            "new_path": file_change.new_path,
            "status": file_change.status.value,
            "hunks": hunks_text
        })

    def summarize_commit(self, commit: Commit) -> str:
        """Generate a summary for a commit with all file changes formatted."""
        # Format each file change with its hunks
        formatted_file_changes = []
        for i, file_change in enumerate(commit.file_changes, 1):
            # Format each hunk in the file change
            formatted_hunks = []
            for j, hunk in enumerate(file_change.hunks, 1):
                formatted_hunk = HUNK_AGGREGATION_PROMPT.format(
                    index=j,
                    old_start=hunk.old_start,
                    old_lines=hunk.old_lines,
                    new_start=hunk.new_start,
                    new_lines=hunk.new_lines,
                    content=hunk.content or ""
                )
                formatted_hunks.append(formatted_hunk)
            
            # Join all hunks for this file change
            hunks_text = "\n".join(formatted_hunks)
            
            # Format the file change
            file_change_text = f"""File Change {i}:
            Old Path: {file_change.old_path}
            New Path: {file_change.new_path}
            Status: {file_change.status.value}
            Hunks:
            {hunks_text}
            """
            formatted_file_changes.append(file_change_text)
        
        # Join all formatted file changes
        file_changes_text = "\n".join(formatted_file_changes)
        
        # Use COMMIT_SUMMARY_PROMPT to summarize the commit
        chain = COMMIT_SUMMARY_PROMPT | self.llm | StrOutputParser()
        return chain.invoke({
            "sha": commit.sha,
            "message": commit.message,
            "author": commit.author or "Unknown",
            "file_changes": file_changes_text
        })

