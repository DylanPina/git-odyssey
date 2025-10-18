from fastapi import APIRouter
from data.database import Database

router = APIRouter()

@router.post("/init")
def init_database():
    Database().init()
    return {"status": "Database initialized successfully"}

@router.delete("/drop")
def drop_database():
    Database().drop()
    return {"status": "Database dropped successfully"}
