from fastapi import APIRouter, Depends
from api.dependencies import get_current_user
from data.data_model import User

router = APIRouter()


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/logout")
async def logout():
    return {"message": "Desktop credentials are managed locally in settings."}
