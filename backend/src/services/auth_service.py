import time, jwt, datetime
from datetime import timedelta
from infrastructure.settings import settings


async def handle_github_callback(
    github_user: dict, github_access_token: dict, installation_id: str
) -> str:
    github_id = github_user["id"]
    username = github_user["login"]
    email = github_user["email"]

    # TODO: Check if user already exists in database and create if not

    # placeholder until db is implemented
    user = {"id": github_id, "username": username, "email": email}
    session_jwt = create_session_jwt(user["id"])

    return session_jwt


def create_session_jwt(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(days=7),
    }
    return jwt.encode(payload, settings.app_secret_key, algorithm="HS256")
