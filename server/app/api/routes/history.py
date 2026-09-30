import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.filenames import build_content_disposition
from app.db.models.user import User
from app.repositories.job_repo import JobRepository
from app.storage import storage

router = APIRouter(prefix="/history", tags=["history"])


class VariantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    operation: str
    params: dict | None
    mime_type: str
    size_bytes: int
    width: int | None
    height: int | None
    created_at: datetime


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    operation: str
    params: dict | None
    status: str
    error_message: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    variants: list[VariantOut]


class HistoryListResponse(BaseModel):
    items: list[JobOut]
    total: int
    skip: int
    limit: int


@router.get("", response_model=HistoryListResponse)
async def list_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> HistoryListResponse:
    """Return the authenticated user's processing history, newest first."""
    repo = JobRepository(session)
    jobs, total = await repo.list_for_user(user_id=user.id, skip=skip, limit=limit)
    return HistoryListResponse(
        items=[JobOut.model_validate(job) for job in jobs],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/{job_id}", response_model=JobOut)
async def get_job(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> JobOut:
    """Return a single job (with its variants) for the user."""
    repo = JobRepository(session)
    job = await repo.get_for_user(user_id=user.id, job_id=job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    return JobOut.model_validate(job)


@router.get("/{job_id}/preview")
async def preview_job_result(
    job_id: uuid.UUID,
    variant_id: uuid.UUID | None = Query(None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Response:
    """Return a job's result bytes for inline display (image previews).

    Only image variants can be previewed; PDF/ZIP results return 400.
    """
    repo = JobRepository(session)
    job = await repo.get_for_user(user_id=user.id, job_id=job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    variants = job.variants
    if not variants:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job has no result.")

    if variant_id is not None:
        variant = next((v for v in variants if v.id == variant_id), None)
        if variant is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found.")
    else:
        variant = variants[0]

    if not variant.mime_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only image results can be previewed.",
        )

    try:
        data = await storage.load(variant.storage_key)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Result bytes missing from storage.",
        )

    return Response(
        content=data,
        media_type=variant.mime_type,
        headers={
            "Content-Disposition": build_content_disposition(
                f"preview.{variant.mime_type.split('/')[1]}", disposition="inline",
            )
        },
    )


@router.get("/{job_id}/download")
async def download_job_result(
    job_id: uuid.UUID,
    variant_id: uuid.UUID | None = Query(None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Response:
    """Download a job's result bytes.

    Downloads the single variant when only one exists, or a specific variant
    when ``variant_id`` is given.
    """
    repo = JobRepository(session)
    job = await repo.get_for_user(user_id=user.id, job_id=job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    variants = job.variants
    if not variants:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job has no result.")

    if variant_id is not None:
        variant = next((v for v in variants if v.id == variant_id), None)
        if variant is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found.")
    else:
        if len(variants) != 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This job has multiple results; specify variant_id.",
            )
        variant = variants[0]

    try:
        data = await storage.load(variant.storage_key)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Result bytes missing from storage.",
        )

    ext = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "application/pdf": "pdf",
        "application/zip": "zip",
    }.get(variant.mime_type, "bin")
    return Response(
        content=data,
        media_type=variant.mime_type,
        headers={
            "Content-Disposition": build_content_disposition(
                f"result.{ext}", disposition="attachment",
            )
        },
    )