from fastapi import APIRouter, Header, HTTPException, BackgroundTasks, Depends, Request
import hashlib, hmac
from api.api_model import GitHubPushRequest
from infrastructure.settings import settings


router = APIRouter()


def verify_webhook_signature(payload: bytes, x_hub_signature_256: str = Header(None)):
    if x_hub_signature_256 is None:
        raise HTTPException(status_code=403, detail="X-Hub Signature is Missing")
    expected_signature = (
        "sha256="
        + hmac.new(
            settings.webhook_secret.encode("utf-8"), payload, hashlib.sha256
        ).hexdigest()
    )
    if not hmac.compare_digest(x_hub_signature_256, expected_signature):
        raise HTTPException(status_code=403, detail="X-Hub Signature is Invalid")
    return x_hub_signature_256


def process_push_webhook(request: GitHubPushRequest):
    print(request)


@router.post("/")
async def webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_hub_signature_256: str = Header(None),
):
    body = await request.body()
    verify_webhook_signature(body, x_hub_signature_256)
    payload = await request.json()
    push_data = GitHubPushRequest(**payload)
    background_tasks.add_task(process_push_webhook, push_data)
    return {"message": "Webhook received and processed"}
