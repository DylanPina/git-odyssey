from fastapi import APIRouter, Depends, HTTPException

from api.api_model import (
    GenerateReviewRequest,
    ReviewCompareRequest,
    ReviewCompareResponse,
    ReviewReport,
)
from api.dependencies import (
    get_review_compare_service,
    get_review_generation_service,
)
from services.review_service import (
    ReviewCompareService,
    ReviewGenerationService,
    ReviewServiceError,
)

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
