from fastapi import APIRouter, Depends
from services.chat_service import ChatService
from api.api_model import ChatbotRequest, ChatbotResponse
from core.ai import AIEngine
from sqlalchemy.orm import Session
from api.dependencies import get_session


router = APIRouter()


@router.post("/", response_model=ChatbotResponse)
def chat(request: ChatbotRequest, db: Session = Depends(get_session)):
    service = ChatService(db, AIEngine())
    return service.chat(request)
