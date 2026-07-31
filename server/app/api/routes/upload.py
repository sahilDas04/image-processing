from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.db.models.user import User
from app.repositories.image_repo import ImageRepository
from app.schemas.images import ImageOut, UploadResponse, UploadResultItem
from app.services.upload import upload_service
from app.storage import storage

router = APIRouter(prefix="/upload", tags=["upload"])


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
        status: str = (
            "error"
            if result.error
            else "duplicate"
            if result.duplicate
            else "stored"
        )
        results.append(
            UploadResultItem(
                filename=result.filename,
                status=status,
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
