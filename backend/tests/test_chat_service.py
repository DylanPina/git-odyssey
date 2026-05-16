import unittest
from unittest.mock import Mock

from api.api_model import ChatbotRequest
from infrastructure.ai_runtime import GoogleAITarget
from services.chat_service import ChatService


class ChatServiceTests(unittest.TestCase):
    def test_chat_forwards_target_override_to_ai_engine(self) -> None:
        target = GoogleAITarget(
            target_kind="managed_model",
            resource_name="publishers/google/models/gemini-2.5-flash",
            display_name="Gemini 2.5 Flash",
            publisher="google",
            location="us-central1",
            capabilities=["text_generation"],
            adapter_family="gemini",
        )
        ai_engine = Mock()
        ai_engine.answer_question.return_value = "Repository answer"
        retriever = Mock()
        retriever.get_context_with_citations.return_value = (
            "Relevant repo context",
            [
                {
                    "sha": "abc123",
                    "similarity": 0.91,
                    "message": "Auth cleanup",
                }
            ],
        )
        service = ChatService(ai_engine=ai_engine, retriever=retriever)

        response = service.chat(
            ChatbotRequest(
                query="What changed?",
                repo_path="/tmp/example-repo",
                context_shas=["abc123"],
                target_override=target,
            )
        )

        retriever.get_context_with_citations.assert_called_once_with(
            "What changed?",
            "/tmp/example-repo",
            ["abc123"],
        )
        ai_engine.answer_question.assert_called_once_with(
            "What changed?",
            "Relevant repo context",
            target=target,
        )
        self.assertEqual(response.response, "Repository answer")
        self.assertEqual(response.cited_commits[0].sha, "abc123")


if __name__ == "__main__":
    unittest.main()
