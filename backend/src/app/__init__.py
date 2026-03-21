from fastapi import FastAPI, APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from openai import AuthenticationError as OpenAIAuthenticationError
from openai import APIStatusError as OpenAIAPIStatusError
import infrastructure.db as db
from infrastructure.db import init_db, close_db
from infrastructure.errors import MissingConfigurationError
from infrastructure.schema import init_schema
from contextlib import asynccontextmanager
from api.dependencies import get_settings
from utils.logger import logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    init_db(settings.database_url, settings.database_sslmode)
    with db.engine.begin() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    init_schema()
    yield
    close_db()


def create_app() -> FastAPI:
    app = FastAPI(lifespan=lifespan)
    get_settings()

    @app.exception_handler(OpenAIAuthenticationError)
    async def handle_openai_auth_error(
        request: Request, exc: OpenAIAuthenticationError
    ) -> JSONResponse:
        logger.error(
            "OpenAI authentication failed for %s %s",
            request.method,
            request.url.path,
        )
        return JSONResponse(
            status_code=502,
            content={
                "detail": (
                    "OpenAI API key is invalid or unauthorized. Update the "
                    "saved desktop OpenAI API key and restart GitOdyssey."
                )
            },
        )

    @app.exception_handler(OpenAIAPIStatusError)
    async def handle_openai_status_error(
        request: Request, exc: OpenAIAPIStatusError
    ) -> JSONResponse:
        logger.error(
            "OpenAI request failed for %s %s with status %s",
            request.method,
            request.url.path,
            exc.status_code,
        )
        return JSONResponse(
            status_code=502,
            content={
                "detail": f"OpenAI request failed with status {exc.status_code}."
            },
        )

    @app.exception_handler(MissingConfigurationError)
    async def handle_missing_configuration(
        request: Request, exc: MissingConfigurationError
    ) -> JSONResponse:
        logger.error(
            "Missing runtime configuration for %s %s: %s",
            request.method,
            request.url.path,
            exc,
        )
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    from api.routers.ingest import router as ingest_router
    from api.routers.auth import router as auth_router
    from api.routers.admin import router as admin_router
    from api.routers.repo import router as repo_router
    from api.routers.filter import router as filter_router
    from api.routers.chat import router as chat_router
    from api.routers.summarize import router as summarize_router
    from api.routers.desktop import router as desktop_router

    api_router = APIRouter(prefix="/api")
    api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
    api_router.include_router(ingest_router, prefix="/ingest", tags=["ingest"])
    api_router.include_router(admin_router, prefix="/admin", tags=["admin"])
    api_router.include_router(repo_router, prefix="/repo", tags=["repo"])
    api_router.include_router(filter_router, prefix="/filter", tags=["filter"])
    api_router.include_router(chat_router, prefix="/chat", tags=["chat"])
    api_router.include_router(
        summarize_router, prefix="/summarize", tags=["summarize"])
    api_router.include_router(desktop_router, prefix="/desktop", tags=["desktop"])

    app.include_router(api_router)

    return app


app = create_app()
