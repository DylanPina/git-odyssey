from fastapi import APIRouter, Request, HTTPException
from infrastructure.settings import settings
from app import oauth
from services.auth_service import generate_session_jwt

router = APIRouter()


@router.get("/login")
async def github_login(request: Request):
    redirect_uri = request.url_for("github_auth_callback")
    return oauth.github.authorize_redirect(request, redirect_uri)


@router.get("/callback")
async def github_auth_callback(request: Request):
    try:
        token = oauth.github.authorize_access_token(request)
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Could not authorize Github token: {str(e)}"
        )

    github_user_resp = await oauth.github.get("user", token=token)
    github_user = github_user_resp.json()

    installation_id = request.query_params.get("installation_id")

    if not installation_id:
        raise HTTPException(status_code=400, detail="Installation ID is required")

    session_jwt = await generate_session_jwt(github_user["id"], installation_id)
    return RedirectResponse(
        url=f"{settings.frontend_url}/auth/callback?session_jwt={session_jwt}"
    )
