from fastapi import Request, HTTPException
from typing import Optional
import jwt
from jwt.exceptions import JWTError
from infrastructure.settings import settings


async def get_current_user(request: Request) -> Optional[dict]:
    token = request.cookies.get("session_token")

    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    # TODO: Fetch user from databas

    return {"user_id": user_id}
