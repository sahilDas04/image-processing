from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.db.models.user import User
from app.repositories.image_repo import ImageRepository
from app.schemas.images import (
    ImageDeleteResponse,
    ImageListResponse,
    ImageOperation,
    ImageOut,
    ImageProcessOptions,
    ImageUpdateRequest,
)
from app.services.image_processing import image_processing_service
from app.storage import storage

router = APIRouter(prefix="/images", tags=["images"])


@router.post("/process")
async def process_uploaded_image(
    file: UploadFile = File(...),
    operation: ImageOperation = Form(ImageOperation.grayscale),
    user: User = Depends(get_current_user),
    width: int | None = Form(None),
    height: int | None = Form(None),
    angle: int = Form(90),
    strength: float = Form(1.25),
    quality: int = Form(75),
    max_dimension: int = Form(1600),
    output_format: str = Form("png"),
) -> Response:
    options = ImageProcessOptions(
        operation=operation,
        width=width,
        height=height,
        angle=angle,
        strength=strength,
        quality=quality,
        max_dimension=max_dimension,
        output_format=output_format,
    )
    processed = await image_processing_service.process_upload(
        file=file,
        options=options,
        max_size_mb=settings.max_upload_size_mb,
    )
    return Response(
        content=processed.content,
        media_type=processed.media_type,
        headers={"Content-Disposition": f'inline; filename="{processed.filename}"'},
    )


@router.get("", response_model=ImageListResponse)
async def list_images(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    search: str | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ImageListResponse:
    repo = ImageRepository(session)
    items, total = await repo.list_for_user(
        user_id=user.id, skip=skip, limit=limit, search=search,
    )
    return ImageListResponse(
        items=[ImageOut.model_validate(item) for item in items],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/{image_id}", response_model=ImageOut)
async def get_image(
    image_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ImageOut:
    repo = ImageRepository(session)
    image = await repo.get_for_user(user_id=user.id, image_id=image_id)
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found.")
    return ImageOut.model_validate(image)


@router.get("/{image_id}/download")
async def download_image(
    image_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Response:
    repo = ImageRepository(session)
    image = await repo.get_for_user(user_id=user.id, image_id=image_id)
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found.")
    try:
        data = await storage.load(image.storage_key)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Image bytes missing from storage.",
        )
    return Response(
        content=data,
        media_type=image.mime_type,
        headers={"Content-Disposition": f'inline; filename="{image.original_name}"'},
    )


@router.patch("/{image_id}", response_model=ImageOut)
async def update_image(
    image_id: uuid.UUID,
    body: ImageUpdateRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ImageOut:
    repo = ImageRepository(session)
    image = await repo.get_for_user(user_id=user.id, image_id=image_id)
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found.")

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(image, field, value)
    session.add(image)
    await session.flush()
    await session.refresh(image)
    return ImageOut.model_validate(image)


@router.delete("/{image_id}", response_model=ImageDeleteResponse)
async def delete_image(
    image_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ImageDeleteResponse:
    repo = ImageRepository(session)
    image = await repo.get_for_user(user_id=user.id, image_id=image_id)
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found.")

    image.deleted_at = datetime.now(timezone.utc)
    session.add(image)
    return ImageDeleteResponse(message="Image deleted.", id=image_id)
