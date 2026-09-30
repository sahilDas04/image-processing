import logging
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.db.models.user import User
from app.repositories.image_repo import ImageRepository
from app.schemas.images import ImageOut, UploadResponse, UploadResultItem
from app.services.image_validation import read_upload_limited
from app.services.upload import _UPLOAD_ID_RE, upload_service
from app.storage import storage

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/upload", tags=["upload"])

MAX_TOTAL_CHUNKS = 10_000


# ── Schemas for Chunked Upload ──

class InitChunkedUploadRequest(BaseModel):
    file_name: str
    file_size: int
    total_chunks: int
    mime_type: str


class InitChunkedUploadResponse(BaseModel):
    upload_id: str


class ChunkUploadResponse(BaseModel):
    success: bool
    chunk_index: int
    error: str | None = None


class UploadStatusResponse(BaseModel):
    uploaded_chunks: list[int]


class FinalizeChunkedUploadRequest(BaseModel):
    upload_id: str
    file_name: str


class FinalizeChunkedUploadResponse(BaseModel):
    success: bool
    image: ImageOut | None = None
    error: str | None = None


# ── Regular Upload Endpoint ──

@router.post("", response_model=UploadResponse)
async def upload_images(
    files: list[UploadFile] = File(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> UploadResponse:
    """Upload one or more images.

    Each file is validated (MIME + magic bytes), SHA-256 checksummed, stored
    through the configured storage provider, and recorded as an Image row.
    Files already uploaded by this user are reported as duplicates.
    """
    repo = ImageRepository(session)

    results: list[UploadResultItem] = []
    for file in files:
        result = await upload_service.upload_image(
            file=file,
            user_id=user.id,
            repo=repo,
            storage=storage,
            max_size_mb=settings.max_upload_size_mb,
        )
        status_val: str = (
            "error"
            if result.error
            else "duplicate"
            if result.duplicate
            else "stored"
        )
        results.append(
            UploadResultItem(
                filename=result.filename,
                status=status_val,
                image=ImageOut.model_validate(result.image) if result.image else None,
                checksum=result.checksum,
                error=result.error,
            )
        )

    return UploadResponse(
        total=len(results),
        stored=sum(1 for r in results if r.status == "stored"),
        duplicates=sum(1 for r in results if r.status == "duplicate"),
        errors=sum(1 for r in results if r.status == "error"),
        results=results,
    )


# ── Chunked Upload Endpoints ──

@router.post("/init", response_model=InitChunkedUploadResponse)
async def init_chunked_upload(
    body: InitChunkedUploadRequest,
    user: User = Depends(get_current_user),
) -> InitChunkedUploadResponse:
    """Initialize a chunked upload session for large files."""
    # Validate file size
    if body.file_size > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds maximum allowed ({settings.max_upload_size_mb} MB)",
        )
    if body.file_size <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size must be positive",
        )

    # Bound the number of chunks so finalize/reassembly can't be driven into
    # resource exhaustion by a lying chunk count.
    if not 1 <= body.total_chunks <= MAX_TOTAL_CHUNKS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"total_chunks must be between 1 and {MAX_TOTAL_CHUNKS}",
        )

    # Validate MIME type
    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    if body.mime_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only JPEG, PNG, and WebP images are supported",
        )

    result = await upload_service.init_chunked_upload(
        file_name=body.file_name,
        file_size=body.file_size,
        total_chunks=body.total_chunks,
        mime_type=body.mime_type,
        user_id=user.id,
    )

    return InitChunkedUploadResponse(upload_id=result.upload_id)


@router.post("/chunk", response_model=ChunkUploadResponse)
async def upload_chunk(
    upload_id: str = Form(...),
    chunk_index: int = Form(...),
    chunk: UploadFile = File(...),
    user: User = Depends(get_current_user),
) -> ChunkUploadResponse:
    """Upload a single chunk."""
    chunk_data = await read_upload_limited(
        chunk,
        max_size_mb=settings.max_upload_size_mb,
        kind="Chunk",
    )

    try:
        result = await upload_service.upload_chunk(
            upload_id=upload_id,
            chunk_index=chunk_index,
            chunk_data=chunk_data,
            user_id=user.id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.error or "Chunk upload failed",
        )

    return ChunkUploadResponse(success=True, chunk_index=result.chunk_index)


@router.get("/status/{upload_id}", response_model=UploadStatusResponse)
async def get_upload_status(
    upload_id: str,
    user: User = Depends(get_current_user),
) -> UploadStatusResponse:
    """Get the status of a chunked upload (which chunks have been uploaded)."""
    if not _UPLOAD_ID_RE.fullmatch(upload_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid upload_id.",
        )
    uploaded = await upload_service.get_upload_status(upload_id=upload_id, user_id=user.id)
    return UploadStatusResponse(uploaded_chunks=uploaded)


@router.post("/finalize", response_model=FinalizeChunkedUploadResponse)
async def finalize_chunked_upload(
    body: FinalizeChunkedUploadRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> FinalizeChunkedUploadResponse:
    """Finalize a chunked upload by reassembling chunks into the final file."""
    repo = ImageRepository(session)

    try:
        result = await upload_service.finalize_chunked_upload(
            upload_id=body.upload_id,
            file_name=body.file_name,
            user_id=user.id,
            repo=repo,
            storage=storage,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.error or "Finalization failed",
        )

    return FinalizeChunkedUploadResponse(
        success=True,
        image=ImageOut.model_validate(result.image) if result.image else None,
    )