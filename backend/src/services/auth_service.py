import time, jwt, datetime
from datetime import timedelta
from infrastructure.settings import settings
from sqlalchemy.orm import Session
from infrastructure.db import get_session
from fastapi import Depends
from data.schema import SQLUser


async def handle_github_callback(
    github_user: dict,
    github_access_token: dict,
    installation_id: str | None = None,
    db: Session = Depends(get_session),
) -> str:
    github_id = github_user["id"]
    username = github_user["login"]
    email = github_user["email"]

    user = db.query(SQLUser).filter(SQLUser.github_id == github_id).first()
    if not user:
        user = SQLUser(
            github_id=github_id,
            username=username,
            email=email,
            installation_id=installation_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(user)
    else:
        user.updated_at = datetime.utcnow()
    db.commit()

    session_jwt = create_session_jwt(user.id)

    return session_jwt


def create_session_jwt(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(days=7),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")
