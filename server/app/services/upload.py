import logging
import uuid
from dataclasses import dataclass

from fastapi import UploadFile

from app.db.models.image import Image
from app.repositories.image_repo import ImageRepository
from app.services.image_validation import (
    IMAGE_EXTENSIONS,
    read_and_validate_image,
    sha256_checksum,
)
from app.storage.base import StorageProvider

logger = logging.getLogger(__name__)


@dataclass
class UploadedImageResult:
    filename: str
    image: Image | None
    checksum: str | None
    duplicate: bool
    error: str | None


class UploadService:
    async def upload_image(
        self,
        *,
        file: UploadFile,
        user_id: uuid.UUID,
        repo: ImageRepository,
        storage: StorageProvider,
        max_size_mb: int,
    ) -> UploadedImageResult:
        name = file.filename or "image"

        try:
            contents, image = await read_and_validate_image(file=file, max_size_mb=max_size_mb)
        except Exception as exc:
            # Per-file errors are surfaced in the response so a multi-file
            # upload can still succeed for the valid files.
            message = getattr(exc, "message", str(exc))
            logger.warning("upload_rejected filename=%s error=%s", name, message)
            return UploadedImageResult(
                filename=name, image=None, checksum=None, duplicate=False, error=message,
            )

        checksum = sha256_checksum(contents)

        existing = await repo.get_by_checksum(user_id=user_id, checksum=checksum)
        if existing is not None:
            logger.info("upload_duplicate user_id=%s checksum=%s", user_id, checksum)
            return UploadedImageResult(
                filename=name, image=existing, checksum=checksum, duplicate=True, error=None,
            )

        mime_type = file.content_type or "image/png"
        extension = IMAGE_EXTENSIONS.get(mime_type, "img")
        width, height = image.size
        storage_key = f"{user_id}/{uuid.uuid4().hex}.{extension}"

        await storage.save(key=storage_key, data=contents, content_type=mime_type)

        record = await repo.create(
            user_id=user_id,
            filename=name,
            original_name=name,
            mime_type=mime_type,
            size_bytes=len(contents),
            width=width,
            height=height,
            storage_key=storage_key,
            checksum=checksum,
        )

        logger.info(
            "upload_stored user_id=%s image_id=%s key=%s bytes=%s",
            user_id, record.id, storage_key, len(contents),
        )
        return UploadedImageResult(
            filename=name, image=record, checksum=checksum, duplicate=False, error=None,
        )


upload_service = UploadService()
