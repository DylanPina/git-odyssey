from fastapi import APIRouter, Depends
from services.chat_service import ChatService
from api.api_model import ChatbotRequest, ChatbotResponse
from api.dependencies import get_chat_service


router = APIRouter()


@router.post("", response_model=ChatbotResponse)
def chat(
    request: ChatbotRequest,
    chat_service: ChatService = Depends(get_chat_service),
):
    return chat_service.chat(request)
