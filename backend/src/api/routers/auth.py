from fastapi import APIRouter, Request, HTTPException, Depends
from starlette.responses import RedirectResponse, Response
from services.auth_service import handle_github_callback
from api.dependencies import get_current_user
from data.data_model import User
from api.dependencies import get_session, get_settings
import httpx
from sqlalchemy.orm import Session
from infrastructure.settings import Settings

router = APIRouter()


def get_oauth(request: Request):
    """Get oauth instance from app state"""
    return request.app.state.oauth


@router.get("/login")
async def github_login(request: Request, oauth=Depends(get_oauth)):
    redirect_uri = request.url_for("github_auth_callback")
    return await oauth.github.authorize_redirect(request, redirect_uri)


@router.get("/callback")
async def github_auth_callback(
    request: Request,
    oauth=Depends(get_oauth),
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    installation_id = request.query_params.get("installation_id")

    # Manually get access token (equivalent to oauth.github.authorize_access_token) since need to account for
    # both installation and authorization flows
    token_url = "https://github.com/login/oauth/access_token"
    params = {
        "client_id": settings.github_client_id,
        "client_secret": settings.github_client_secret,
        "code": request.query_params.get("code"),
    }
    headers = {
        "Accept": "application/json",
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(token_url, params=params, headers=headers)

    if response.status_code != 200:
        raise HTTPException(
            status_code=400, detail=f"Could not authorize Github token: {response.text}"
        )

    token_data = response.json()
    token = {
        "access_token": token_data["access_token"],
        "token_type": "bearer",
    }

    github_user_resp = await oauth.github.get("user", token=token)
    github_user = github_user_resp.json()

    # Installation ID only present after initial app installation (not normal sign in flow)
    if not installation_id:
        inst_resp = await oauth.github.get("user/installations", token=token)
        installations = inst_resp.json().get("installations", [])
        installation = next(
            (inst for inst in installations if inst["app_id"] == settings.app_id), None
        )
        if not installation:
            # Direct user to install the app
            return RedirectResponse(
                url="https://github.com/apps/Git-Odyssey/installations/new"
            )
        installation_id = installation["id"]
    session_jwt = await handle_github_callback(
        github_user, token, session, installation_id, settings
    )

    frontend_dashboard_url = settings.frontend_url
    response = RedirectResponse(url=frontend_dashboard_url)

    response.set_cookie(
        key="session_token",
        value=session_jwt,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=60 * 60 * 24 * 7,
    )

    return response


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(
        key="session_token",
        httponly=True,
        samesite="lax",
        secure=False,
    )
    return {"message": "Logged out successfully"}
