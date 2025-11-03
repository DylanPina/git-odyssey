from fastapi import APIRouter
from infrastructure.schema import init_schema, drop_schema

router = APIRouter()


@router.post("/init")
def init_database():
    init_schema()
    return {"status": "Database initialized successfully"}


@router.delete("/drop")
def drop_database():
    drop_schema()
    return {"status": "Database dropped successfully"}
