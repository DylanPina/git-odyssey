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

    app.include_router(ingest_router, prefix="/ingest", tags=["ingest"])
    app.include_router(admin_router, prefix="/admin", tags=["admin"])

    return app


app = create_app()
