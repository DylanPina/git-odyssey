from core.retriever import Retriever
from core.ai import AIEngine
from api.api_model import ChatbotRequest, ChatbotResponse, CitedCommit


class ChatService:
    def __init__(self, ai_engine: AIEngine, retriever: Retriever):
        self.retriever = retriever
        self.ai = ai_engine

    def chat(self, request: ChatbotRequest) -> ChatbotResponse:
        context, cited_commits_with_scores = self.retriever.get_context_with_citations(
            request.query, request.context_shas
        )
        response = self.ai.answer_question(request.query, context)
        cited_commits = [
            CitedCommit(
                sha=commit["sha"],
                similarity=commit["similarity"],
                message=commit["message"],
            )
            for commit in cited_commits_with_scores
        ]
        return ChatbotResponse(response=response, cited_commits=cited_commits)
