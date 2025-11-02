from fastapi import Request, HTTPException, Depends
import jwt
from api.dependencies import get_session, get_settings
from data.schema import SQLUser
from data.database import Database
from data.data_model import User
from infrastructure.settings import Settings
from sqlalchemy.orm import Session


async def get_current_user(
    request: Request,
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> User:
    print("Cookies: ", request.cookies)
    token = request.cookies.get("session_token")
    print("Token: ", token)
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        print("Payload: ", payload)
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(SQLUser).filter(SQLUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    db_adapter = Database()
    return db_adapter.parse_sql_user(user)
