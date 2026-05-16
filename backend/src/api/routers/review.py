from fastapi import APIRouter, Depends, HTTPException

from api.api_model import (
    GenerateReviewRequest,
    ReviewApprovalResponse,
    ReviewApprovalUpsertRequest,
    ReviewCompareRequest,
    ReviewCompareResponse,
    ReviewHistoryResponse,
    ReviewChatRequest,
    ReviewChatResponse,
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
    get_ai_engine,
    get_review_compare_service,
    get_review_generation_service,
    get_review_session_persistence_service,
)
from core.ai import AIEngine
from services.review_service import (
    ReviewCompareService,
    ReviewGenerationService,
    ReviewServiceError,
)
from services.review_session_service import ReviewSessionPersistenceService

router = APIRouter()


def _format_review_chat_context(request: ReviewChatRequest) -> str:
    context = request.reviewContext
    lines: list[str] = []
    if context:
        lines.append(f"Run status: {context.runStatus or 'unknown'}")
        lines.append(f"Summary: {context.summary or 'No persisted summary.'}")
        if context.appliedInstructions:
            lines.append("Applied instructions:")
            lines.append(context.appliedInstructions)
        if context.findings:
            lines.append("Persisted findings:")
            for index, finding in enumerate(context.findings, start=1):
                line_ref = finding.new_start or finding.old_start
                suffix = f":{line_ref}" if line_ref else ""
                lines.append(
                    f"{index}. [{finding.severity}] {finding.title} "
                    f"({finding.file_path}{suffix})"
                )
                lines.append(finding.body)
    else:
        lines.append("No persisted review result was provided.")

    if request.codeContexts:
        lines.append("Attached code context:")
        for index, context_item in enumerate(request.codeContexts, start=1):
            lines.append(
                (
                    f"Context {index}: {context_item.filePath} "
                    f"({context_item.side} {context_item.startLine}:{context_item.startColumn}-"
                    f"{context_item.endLine}:{context_item.endColumn})"
                )
            )
            lines.append("```")
            lines.append(context_item.selectedText)
            lines.append("```")

    if request.findingContexts:
        lines.append("Attached findings:")
        for index, finding in enumerate(request.findingContexts, start=1):
            lines.append(f"{index}. [{finding.severity}] {finding.title}")
            lines.append(finding.body)

    if request.messages:
        lines.append("Recent transcript:")
        for message in request.messages[-10:]:
            lines.append(f"{message.role}: {message.content}")

    return "\n".join(lines)


@router.post("/compare", response_model=ReviewCompareResponse)
async def compare_review_target(
    request: ReviewCompareRequest,
    review_compare_service: ReviewCompareService = Depends(get_review_compare_service),
):
    try:
        return review_compare_service.compare(request)
    except ReviewServiceError as error:
        raise HTTPException(
            status_code=error.status_code, detail=error.detail
        ) from error


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
        raise HTTPException(
            status_code=error.status_code, detail=error.detail
        ) from error


@router.post("/chat", response_model=ReviewChatResponse)
async def review_chat(
    request: ReviewChatRequest,
    ai_engine: AIEngine = Depends(get_ai_engine),
):
    if not request.sessionId.strip():
        raise HTTPException(status_code=400, detail="Review session id is required.")
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Review chat message is required.")

    instructions = "\n".join(
        [
            "Answer only about the current review target and attached context.",
            "Do not claim you inspected files that were not provided in this chat context.",
            "Be concise and cite file paths or findings when they are relevant.",
        ]
    )
    input_text = "\n\n".join(
        [
            "## Review Context",
            _format_review_chat_context(request),
            "## User Message",
            request.message.strip(),
        ]
    )
    try:
        response = ai_engine.generate_text(
            instructions,
            input_text,
            target=request.target_override,
        )
    except Exception as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return ReviewChatResponse(response=response)


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
        raise HTTPException(
            status_code=error.status_code, detail=error.detail
        ) from error


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
        raise HTTPException(
            status_code=error.status_code, detail=error.detail
        ) from error


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
        raise HTTPException(
            status_code=error.status_code, detail=error.detail
        ) from error


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
        raise HTTPException(
            status_code=error.status_code, detail=error.detail
        ) from error


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
        raise HTTPException(
            status_code=error.status_code, detail=error.detail
        ) from error


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
        raise HTTPException(
            status_code=error.status_code, detail=error.detail
        ) from error


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
        raise HTTPException(
            status_code=error.status_code, detail=error.detail
        ) from error


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
        raise HTTPException(
            status_code=error.status_code, detail=error.detail
        ) from error


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
        raise HTTPException(
            status_code=error.status_code, detail=error.detail
        ) from error
