import time, jwt
from datetime import datetime, timedelta
from data.schema import SQLUser
from sqlalchemy.orm import Session
from infrastructure.settings import Settings


async def handle_github_callback(
    github_user: dict,
    github_access_token: dict,
    db: Session,
    installation_id: str | None = None,
    settings: Settings = None,
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
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        db.add(user)
    else:
        user.updated_at = datetime.now()
        user.installation_id = installation_id
    db.commit()
    db.refresh(user)
    session_jwt = create_session_jwt(user.id, settings.secret_key)

    return session_jwt


def create_session_jwt(user_id: int, secret_key: str) -> str:
    payload = {
        "sub": str(user_id),
        "iat": datetime.now(),
        "exp": datetime.now() + timedelta(days=7),
    }
    return jwt.encode(payload, secret_key, algorithm="HS256")
