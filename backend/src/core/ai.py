from langchain_google_genai import ChatGoogleGenerativeAI
from utils.prompts import QUESTION_PROMPT, HUNK_SUMMARY_PROMPT
from data.data_model import DiffHunk, FileChange
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



