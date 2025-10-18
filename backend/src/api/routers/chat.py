from fastapi import APIRouter
from services.chat_service import ChatService
from api.api_model import ChatbotRequest, ChatbotResponse
from core.ai import AIEngine
from data.database import Database


router = APIRouter()


@router.post("/", response_model=ChatbotResponse)
def chat(request: ChatbotRequest):
    service = ChatService(Database(), AIEngine())
    return service.chat(request)
