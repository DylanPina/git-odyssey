import time
import httpx
import jwt
from infrastructure.settings import Settings


def create_app_jwt(app_id: int, private_key: str):
    now = int(time.time())
    payload = {
        "iat": now - 60,
        "exp": now + (10 * 60) - 60,
        "iss": app_id,
    }
    return jwt.encode(payload, private_key, algorithm="RS256")


async def get_installation_access_token(installation_id: int, settings: Settings):
    app_jwt = create_app_jwt(settings.github_app_id,
                             settings.github_app_private_key)
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
        print("Response: ", response.json())
        return response.json()["token"]
