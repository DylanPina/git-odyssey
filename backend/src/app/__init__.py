from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from infrastructure.settings import settings


def create_app() -> FastAPI:
    app = FastAPI()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from api.routers.ingest import router as ingest_router
    from api.routers.admin import router as admin_router
    from api.routers.repo import router as repo_router
    from api.routers.filter import router as filter_router
    from api.routers.chat import router as chat_router

    app.include_router(ingest_router, prefix="/ingest", tags=["ingest"])
    app.include_router(admin_router, prefix="/admin", tags=["admin"])
    app.include_router(repo_router, prefix="/repo", tags=["repo"])
    app.include_router(filter_router, prefix="/filter", tags=["filter"])
    app.include_router(chat_router, prefix="/chat", tags=["chat"])

    return app


app = create_app()
