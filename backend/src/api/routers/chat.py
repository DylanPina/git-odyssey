from fastapi import APIRouter, Depends, HTTPException, status
from services.chat_service import ChatService
from api.api_model import ChatbotRequest, ChatbotResponse
from api.dependencies import get_chat_service


router = APIRouter()


@router.post("", response_model=ChatbotResponse)
def chat(
    request: ChatbotRequest,
    chat_service: ChatService = Depends(get_chat_service),
):
    if not request.repo_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Repository path is required for chat requests.",
        )
    return chat_service.chat(request)
