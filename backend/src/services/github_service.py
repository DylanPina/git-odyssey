import time, httpx, jwt
from infrastructure.settings import settings


def create_app_jwt():
    now = int(time.time())
    payload = {
        "iat": now - 60,
        "exp": now + (10 * 60) - 60,
        "iss": settings.app_id,
    }
    return jwt.encode(payload, settings.private_key, algorithm="RS256")


async def get_installation_access_token(installation_id: int):
    app_jwt = create_app_jwt()
    headers = {
        "Authorization": f"Bearer {app_jwt}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"https://api.github.com/app/installations/{installation_id}/access_tokens",
            headers=headers,
        )
    response.raise_for_status()
    return response.json()["token"]
