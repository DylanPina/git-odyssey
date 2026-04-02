from fastapi import FastAPI, APIRouter, Request
from fastapi.responses import JSONResponse
import infrastructure.db as db
from infrastructure.db import init_db, close_db
from infrastructure.errors import (
    AIAuthenticationError,
    AIConfigurationError,
    AIConnectionError,
    AIModelError,
    AIRequestError,
    AIUnsupportedCapabilityError,
)
from infrastructure.migrations import run_migrations
from infrastructure.schema import ensure_pgvector_extension, init_schema
from contextlib import asynccontextmanager
from api.dependencies import get_settings
from utils.logger import logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    init_db(settings.database_url, settings.database_sslmode)
    ensure_pgvector_extension()
    init_schema()
    run_migrations(settings)
    yield
    close_db()


def create_app() -> FastAPI:
    app = FastAPI(lifespan=lifespan)
    get_settings()

    @app.exception_handler(AIAuthenticationError)
    async def handle_ai_auth_error(
        request: Request, exc: AIAuthenticationError
    ) -> JSONResponse:
        logger.error(
            "AI provider authentication failed for %s %s",
            request.method,
            request.url.path,
        )
        return JSONResponse(
            status_code=502,
            content={
                "detail": (
                    "AI provider authentication failed. Update the configured "
                    "provider credentials in desktop settings."
                )
            },
        )

    @app.exception_handler(AIConnectionError)
    async def handle_ai_connection_error(
        request: Request, exc: AIConnectionError
    ) -> JSONResponse:
        logger.error(
            "AI provider connection failed for %s %s: %s",
            request.method,
            request.url.path,
            exc,
        )
        return JSONResponse(
            status_code=502,
            content={"detail": str(exc)},
        )

    @app.exception_handler(AIConfigurationError)
    async def handle_ai_configuration_error(
        request: Request, exc: AIConfigurationError
    ) -> JSONResponse:
        logger.error(
            "Invalid AI configuration for %s %s: %s",
            request.method,
            request.url.path,
            exc,
        )
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    @app.exception_handler(AIModelError)
    async def handle_ai_model_error(
        request: Request, exc: AIModelError
    ) -> JSONResponse:
        logger.error(
            "AI model request failed for %s %s: %s",
            request.method,
            request.url.path,
            exc,
        )
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(AIUnsupportedCapabilityError)
    async def handle_ai_capability_error(
        request: Request, exc: AIUnsupportedCapabilityError
    ) -> JSONResponse:
        logger.error(
            "AI capability request failed for %s %s: %s",
            request.method,
            request.url.path,
            exc,
        )
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(AIRequestError)
    async def handle_ai_request_error(
        request: Request, exc: AIRequestError
    ) -> JSONResponse:
        logger.error(
            "AI provider request failed for %s %s: %s",
            request.method,
            request.url.path,
            exc,
        )
        return JSONResponse(status_code=502, content={"detail": str(exc)})

    from api.routers.ingest import router as ingest_router
    from api.routers.auth import router as auth_router
    from api.routers.admin import router as admin_router
    from api.routers.repo import router as repo_router
    from api.routers.filter import router as filter_router
    from api.routers.chat import router as chat_router
    from api.routers.review import router as review_router
    from api.routers.summarize import router as summarize_router
    from api.routers.desktop import router as desktop_router

    api_router = APIRouter(prefix="/api")
    api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
    api_router.include_router(ingest_router, prefix="/ingest", tags=["ingest"])
    api_router.include_router(admin_router, prefix="/admin", tags=["admin"])
    api_router.include_router(repo_router, prefix="/repo", tags=["repo"])
    api_router.include_router(filter_router, prefix="/filter", tags=["filter"])
    api_router.include_router(chat_router, prefix="/chat", tags=["chat"])
    api_router.include_router(review_router, prefix="/review", tags=["review"])
    api_router.include_router(
        summarize_router, prefix="/summarize", tags=["summarize"])
    api_router.include_router(desktop_router, prefix="/desktop", tags=["desktop"])

    app.include_router(api_router)

    return app


app = create_app()
