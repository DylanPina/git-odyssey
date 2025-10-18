from fastapi import APIRouter
from api.api_model import IngestRequest
from services.ingest_service import IngestService

router = APIRouter()

@router.post("/")
def ingest(request: IngestRequest):
  service = IngestService()
  service.ingest_repo(request)
  return None # TODO: return the ingested repository data