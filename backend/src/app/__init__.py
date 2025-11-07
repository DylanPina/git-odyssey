from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from authlib.integrations.starlette_client import OAuth
from starlette.middleware.sessions import SessionMiddleware
from infrastructure.db import init_db, close_db
from contextlib import asynccontextmanager
from api.dependencies import get_settings
from services.secrets_service import get_secrets_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(get_settings().database_url)
    yield
    close_db()


def create_app() -> FastAPI:
    app = FastAPI(lifespan=lifespan)
    get_secrets_service().load()
    settings = get_settings()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.frontend_url,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(SessionMiddleware, secret_key=settings.secret_key)

    oauth = OAuth()
    oauth.register(
        name="github",
        client_id=settings.github_client_id,
        client_secret=settings.github_client_secret,
        access_token_url="https://github.com/login/oauth/access_token",
        authorize_url="https://github.com/login/oauth/authorize",
        api_base_url="https://api.github.com",
        client_kwargs={
            "scope": "read:user user:email",
        },
    )
    app.state.oauth = oauth

    from api.routers.ingest import router as ingest_router
    from api.routers.auth import router as auth_router
    from api.routers.admin import router as admin_router
    from api.routers.repo import router as repo_router
    from api.routers.filter import router as filter_router
    from api.routers.chat import router as chat_router
    from api.routers.summarize import router as summarize_router
    from api.routers.webhook import router as webhook_router

    app.include_router(auth_router, prefix="/auth", tags=["auth"])
    app.include_router(ingest_router, prefix="/ingest", tags=["ingest"])
    app.include_router(admin_router, prefix="/admin", tags=["admin"])
    app.include_router(repo_router, prefix="/repo", tags=["repo"])
    app.include_router(filter_router, prefix="/filter", tags=["filter"])
    app.include_router(chat_router, prefix="/chat", tags=["chat"])
    app.include_router(
        summarize_router, prefix="/summarize", tags=["summarize"])
    app.include_router(webhook_router, prefix="/webhook", tags=["webhook"])

    return app


app = create_app()
