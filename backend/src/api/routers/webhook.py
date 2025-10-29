from fastapi import APIRouter, Header, HTTPException, BackgroundTasks, Depends, Request
import hashlib, hmac, json
from pydantic import ValidationError
from api.api_model import GitHubPushRequest
from infrastructure.settings import settings


router = APIRouter()


async def verify_webhook_signature(
    request: Request, x_hub_signature_256: str = Header(None)
):
    if x_hub_signature_256 is None:
        raise HTTPException(status_code=403, detail="X-Hub Signature is Missing")
    body = await request.body()
    expected_signature = (
        "sha256="
        + hmac.new(
            settings.github_webhook_secret.encode("utf-8"), body, hashlib.sha256
        ).hexdigest()
    )
    if not hmac.compare_digest(x_hub_signature_256, expected_signature):
        raise HTTPException(status_code=403, detail="X-Hub Signature is Invalid")

    try:
        payload = json.loads(body.decode("utf-8"))
        return payload
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")


def process_push_webhook(request: GitHubPushRequest):
    print(request)


@router.post("/")
async def webhook(
    background_tasks: BackgroundTasks,
    payload: dict = Depends(verify_webhook_signature),
):
    try:
        push_data = GitHubPushRequest(**payload)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=f"Invalid payload: {e}")
    background_tasks.add_task(process_push_webhook, push_data)
    return {"message": "Webhook received and processed"}
