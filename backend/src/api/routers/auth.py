from fastapi import APIRouter, Request, HTTPException, Depends
from infrastructure.settings import settings
from starlette.responses import RedirectResponse, Response
from services.auth_service import handle_github_callback
from services.security_service import get_current_user
from data.data_model import User

router = APIRouter()


def get_oauth(request: Request):
    """Get oauth instance from app state"""
    return request.app.state.oauth


@router.get("/login")
async def github_login(request: Request, oauth=Depends(get_oauth)):
    redirect_uri = request.url_for("github_auth_callback")
    return oauth.github.authorize_redirect(request, redirect_uri)


@router.get("/callback")
async def github_auth_callback(request: Request, oauth=Depends(get_oauth)):
    try:
        token = oauth.github.authorize_access_token(request)
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Could not authorize Github token: {str(e)}"
        )

    github_user_resp = await oauth.github.get("user", token=token)
    github_user = github_user_resp.json()

    installation_id = request.query_params.get("installation_id")

    session_jwt = await handle_github_callback(github_user, token, installation_id)

    frontend_dashboard_url = "/"
    response = RedirectResponse(url=frontend_dashboard_url)

    response.set_cookie(
        key="session_token",
        value=session_jwt,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,
    )

    return response


@router.get("/me")
async def get_current_user(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(
        key="session_token", httponly=True, secure=True, samesite="lax"
    )
    return {"message": "Logged out successfully"}
