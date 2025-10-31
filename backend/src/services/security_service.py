from fastapi import Request, HTTPException
import jwt
from jwt.exceptions import JWTError
from infrastructure.settings import settings
from sqlalchemy.orm import Session
from infrastructure.db import get_session
from fastapi import Depends
from data.schema import SQLUser
from data.database import Database
from data.data_model import User


async def get_current_user(
    request: Request, db: Session = Depends(get_session)
) -> User:
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

    user = db.query(SQLUser).filter(SQLUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    db_adapter = Database()
    return db_adapter.parse_sql_user(user)
