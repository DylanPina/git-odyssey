from fastapi import APIRouter, Depends, HTTPException

from api.api_model import (
    GenerateReviewRequest,
    ReviewApprovalResponse,
    ReviewApprovalUpsertRequest,
    ReviewCompareRequest,
    ReviewCompareResponse,
    ReviewHistoryResponse,
    ReviewResultResponse,
    ReviewResultSubmitRequest,
    ReviewReport,
    ReviewRunEventsRequest,
    ReviewRunEventResponse,
    ReviewRunResponse,
    ReviewRunStartRequest,
    ReviewRunStatusUpdateRequest,
    ReviewSessionCreateRequest,
    ReviewSessionResponse,
)
from api.dependencies import (
    get_review_compare_service,
    get_review_generation_service,
    get_review_session_persistence_service,
)
from services.review_service import (
    ReviewCompareService,
    ReviewGenerationService,
    ReviewServiceError,
)
from services.review_session_service import ReviewSessionPersistenceService

router = APIRouter()


@router.post("/compare", response_model=ReviewCompareResponse)
async def compare_review_target(
    request: ReviewCompareRequest,
    review_compare_service: ReviewCompareService = Depends(
        get_review_compare_service
    ),
):
    try:
        return review_compare_service.compare(request)
    except ReviewServiceError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.post("/generate", response_model=ReviewReport)
async def generate_review(
    request: GenerateReviewRequest,
    review_generation_service: ReviewGenerationService = Depends(
        get_review_generation_service
    ),
):
    try:
        return review_generation_service.generate(request)
    except ReviewServiceError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.post("/sessions", response_model=ReviewSessionResponse)
async def create_review_session(
    request: ReviewSessionCreateRequest,
    review_session_service: ReviewSessionPersistenceService = Depends(
        get_review_session_persistence_service
    ),
):
    try:
        return review_session_service.create_session(request)
    except ReviewServiceError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.get("/sessions/{session_id}", response_model=ReviewSessionResponse)
async def get_review_session(
    session_id: str,
    review_session_service: ReviewSessionPersistenceService = Depends(
        get_review_session_persistence_service
    ),
):
    try:
        return review_session_service.get_session(session_id)
    except ReviewServiceError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.get("/history", response_model=ReviewHistoryResponse)
async def list_review_history(
    repo_path: str,
    target_mode: str = "compare",
    base_ref: str = "",
    head_ref: str = "",
    commit_sha: str | None = None,
    review_session_service: ReviewSessionPersistenceService = Depends(
        get_review_session_persistence_service
    ),
):
    try:
        return review_session_service.list_history(
            repo_path=repo_path,
            target_mode=target_mode,
            base_ref=base_ref,
            head_ref=head_ref,
            commit_sha=commit_sha,
        )
    except ReviewServiceError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.post("/sessions/{session_id}/runs", response_model=ReviewRunResponse)
async def create_review_run(
    session_id: str,
    request: ReviewRunStartRequest,
    review_session_service: ReviewSessionPersistenceService = Depends(
        get_review_session_persistence_service
    ),
):
    try:
        return review_session_service.create_run(session_id, request)
    except ReviewServiceError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.get("/sessions/{session_id}/runs/{run_id}", response_model=ReviewRunResponse)
async def get_review_run(
    session_id: str,
    run_id: str,
    review_session_service: ReviewSessionPersistenceService = Depends(
        get_review_session_persistence_service
    ),
):
    try:
        return review_session_service.get_run(session_id, run_id)
    except ReviewServiceError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.post(
    "/sessions/{session_id}/runs/{run_id}/status",
    response_model=ReviewRunResponse,
)
async def update_review_run_status(
    session_id: str,
    run_id: str,
    request: ReviewRunStatusUpdateRequest,
    review_session_service: ReviewSessionPersistenceService = Depends(
        get_review_session_persistence_service
    ),
):
    try:
        return review_session_service.update_run_status(session_id, run_id, request)
    except ReviewServiceError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.post(
    "/sessions/{session_id}/runs/{run_id}/events",
    response_model=list[ReviewRunEventResponse],
)
async def append_review_run_events(
    session_id: str,
    run_id: str,
    request: ReviewRunEventsRequest,
    review_session_service: ReviewSessionPersistenceService = Depends(
        get_review_session_persistence_service
    ),
):
    try:
        return review_session_service.append_run_events(session_id, run_id, request)
    except ReviewServiceError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.post(
    "/sessions/{session_id}/runs/{run_id}/approvals",
    response_model=ReviewApprovalResponse,
)
async def upsert_review_approval(
    session_id: str,
    run_id: str,
    request: ReviewApprovalUpsertRequest,
    review_session_service: ReviewSessionPersistenceService = Depends(
        get_review_session_persistence_service
    ),
):
    try:
        return review_session_service.upsert_approval(session_id, run_id, request)
    except ReviewServiceError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.post(
    "/sessions/{session_id}/runs/{run_id}/result",
    response_model=ReviewResultResponse,
)
async def submit_review_result(
    session_id: str,
    run_id: str,
    request: ReviewResultSubmitRequest,
    review_session_service: ReviewSessionPersistenceService = Depends(
        get_review_session_persistence_service
    ),
):
    try:
        return review_session_service.submit_result(session_id, run_id, request)
    except ReviewServiceError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error
