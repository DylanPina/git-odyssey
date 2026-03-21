from fastapi import APIRouter, Depends

from api.dependencies import get_settings
from infrastructure.settings import Settings

router = APIRouter()


@router.get("/health")
async def desktop_health(settings: Settings = Depends(get_settings)):
    return {
        "mode": "desktop",
        "credentials": {
            "has_openai_api_key": bool(settings.openai_api_key),
        },
        "desktop_user": {
            "id": settings.desktop_user_id,
            "username": settings.desktop_user_username,
            "email": settings.desktop_user_email,
        },
    }
