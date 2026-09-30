import logging
import os
import re
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings
from app.db.models.image import Image
from app.repositories.image_repo import ImageRepository
from app.services.image_validation import (
    IMAGE_EXTENSIONS,
    read_and_validate_image,
    sha256_checksum,
)
from app.storage.base import StorageProvider

logger = logging.getLogger(__name__)

_UPLOAD_ID_RE = re.compile(r"^[0-9a-f]{32}$")


@dataclass
class UploadedImageResult:
    filename: str
    image: Image | None
    checksum: str | None
    duplicate: bool
    error: str | None


@dataclass
class ChunkedUploadInitResult:
    upload_id: str
    chunk_dir: Path


@dataclass
class ChunkUploadResult:
    success: bool
    chunk_index: int
    error: str | None = None


@dataclass
class FinalizeResult:
    success: bool
    image: Image | None = None
    error: str | None = None


class UploadService:
    def __init__(self):
        self.chunk_base_dir = Path(settings.chunk_upload_dir)
        self.chunk_base_dir.mkdir(parents=True, exist_ok=True)

    def _get_chunk_dir(self, upload_id: str) -> Path:
        """Get the directory for a specific upload's chunks.

        ``upload_id`` is client-controlled (form field / path param) even
        though it is normally a server-generated hex UUID. It is validated as
        such and re-resolved before use so a value like ``../../tmp/evil`` can
        never escape ``chunk_base_dir``.
        """
        if not _UPLOAD_ID_RE.fullmatch(upload_id):
            raise ValueError("Invalid upload_id.")

        chunk_dir = (self.chunk_base_dir / upload_id).resolve()
        base = self.chunk_base_dir.resolve()
        if not chunk_dir.is_relative_to(base):
            raise ValueError("Invalid upload_id.")
        chunk_dir.mkdir(parents=True, exist_ok=True)
        return chunk_dir

    async def init_chunked_upload(
        self,
        *,
        file_name: str,
        file_size: int,
        total_chunks: int,
        mime_type: str,
        user_id: uuid.UUID,
    ) -> ChunkedUploadInitResult:
        """Initialize a chunked upload session."""
        upload_id = uuid.uuid4().hex
        chunk_dir = self._get_chunk_dir(upload_id)

        # Store metadata
        metadata = {
            "file_name": file_name,
            "file_size": file_size,
            "total_chunks": total_chunks,
            "mime_type": mime_type,
            "user_id": str(user_id),
            "uploaded_chunks": [],
        }
        import json
        (chunk_dir / "metadata.json").write_text(json.dumps(metadata))

        logger.info("chunked_upload_init upload_id=%s file=%s size=%s chunks=%s", upload_id, file_name, file_size, total_chunks)
        return ChunkedUploadInitResult(upload_id=upload_id, chunk_dir=chunk_dir)

    async def upload_chunk(
        self,
        *,
        upload_id: str,
        chunk_index: int,
        chunk_data: bytes,
        user_id: uuid.UUID,
    ) -> ChunkUploadResult:
        """Save a single chunk to disk."""
        chunk_dir = self._get_chunk_dir(upload_id)
        metadata_path = chunk_dir / "metadata.json"

        if not metadata_path.exists():
            return ChunkUploadResult(success=False, chunk_index=chunk_index, error="Upload session not found")

        import json
        metadata = json.loads(metadata_path.read_text())

        # Verify user owns this upload
        if metadata.get("user_id") != str(user_id):
            return ChunkUploadResult(success=False, chunk_index=chunk_index, error="Unauthorized")

        # Check chunk index validity
        if chunk_index >= metadata["total_chunks"]:
            return ChunkUploadResult(success=False, chunk_index=chunk_index, error="Invalid chunk index")

        # Save chunk
        chunk_path = chunk_dir / f"chunk_{chunk_index:06d}"
        chunk_path.write_bytes(chunk_data)

        # Update metadata
        if chunk_index not in metadata["uploaded_chunks"]:
            metadata["uploaded_chunks"].append(chunk_index)
            metadata["uploaded_chunks"].sort()
            metadata_path.write_text(json.dumps(metadata))

        logger.debug("chunked_upload_chunk upload_id=%s chunk=%s size=%s", upload_id, chunk_index, len(chunk_data))
        return ChunkUploadResult(success=True, chunk_index=chunk_index)

    async def get_upload_status(self, *, upload_id: str, user_id: uuid.UUID) -> list[int]:
        """Get list of uploaded chunk indices."""
        chunk_dir = self._get_chunk_dir(upload_id)
        metadata_path = chunk_dir / "metadata.json"

        if not metadata_path.exists():
            return []

        import json
        metadata = json.loads(metadata_path.read_text())

        if metadata.get("user_id") != str(user_id):
            return []

        return metadata.get("uploaded_chunks", [])

    async def finalize_chunked_upload(
        self,
        *,
        upload_id: str,
        file_name: str,
        user_id: uuid.UUID,
        repo: ImageRepository,
        storage: StorageProvider,
    ) -> FinalizeResult:
        """Reassemble chunks and create final image record."""
        chunk_dir = self._get_chunk_dir(upload_id)
        metadata_path = chunk_dir / "metadata.json"

        if not metadata_path.exists():
            return FinalizeResult(success=False, error="Upload session not found")

        import json
        metadata = json.loads(metadata_path.read_text())

        if metadata.get("user_id") != str(user_id):
            return FinalizeResult(success=False, error="Unauthorized")

        # Verify all chunks are present
        uploaded_chunks = metadata.get("uploaded_chunks", [])
        if len(uploaded_chunks) != metadata["total_chunks"]:
            missing = set(range(metadata["total_chunks"])) - set(uploaded_chunks)
            return FinalizeResult(success=False, error=f"Missing chunks: {sorted(missing)}")

        # Reassemble file
        mime_type = metadata["mime_type"]
        extension = IMAGE_EXTENSIONS.get(mime_type, "img")
        storage_key = f"{user_id}/{uuid.uuid4().hex}.{extension}"
        final_path = chunk_dir / "final"

        # Stream chunks to final file (memory efficient)
        with final_path.open("wb") as outfile:
            for i in range(metadata["total_chunks"]):
                chunk_path = chunk_dir / f"chunk_{i:06d}"
                if chunk_path.exists():
                    with chunk_path.open("rb") as infile:
                        shutil.copyfileobj(infile, outfile)
                else:
                    return FinalizeResult(success=False, error=f"Chunk {i} missing during reassembly")

        # Validate the reassembled file
        try:
            # Read the final file for validation
            contents = final_path.read_bytes()
            # Validate size
            if len(contents) > settings.max_upload_size_mb * 1024 * 1024:
                final_path.unlink(missing_ok=True)
                return FinalizeResult(success=False, error="File exceeds maximum size after reassembly")

            # Validate image
            from io import BytesIO
            from PIL import Image, UnidentifiedImageError
            from app.services.image_validation import validate_signature, ALLOWED_CONTENT_TYPES

            if mime_type not in ALLOWED_CONTENT_TYPES:
                final_path.unlink(missing_ok=True)
                return FinalizeResult(success=False, error="Invalid MIME type after reassembly")

            validate_signature(contents=contents, content_type=mime_type)

            try:
                image = Image.open(BytesIO(contents))
                image.load()
            except UnidentifiedImageError:
                final_path.unlink(missing_ok=True)
                return FinalizeResult(success=False, error="Reassembled file is not a valid image")

            width, height = image.size
            checksum = sha256_checksum(contents)

            # Check for duplicate
            existing = await repo.get_by_checksum(user_id=user_id, checksum=checksum)
            if existing is not None:
                final_path.unlink(missing_ok=True)
                # Clean up chunk directory
                shutil.rmtree(chunk_dir, ignore_errors=True)
                logger.info("chunked_upload_duplicate user_id=%s checksum=%s", user_id, checksum)
                return FinalizeResult(success=True, image=existing)

            # Store in permanent storage
            await storage.save(key=storage_key, data=contents, content_type=mime_type)

            # Create database record
            record = await repo.create(
                user_id=user_id,
                filename=file_name,
                original_name=file_name,
                mime_type=mime_type,
                size_bytes=len(contents),
                width=width,
                height=height,
                storage_key=storage_key,
                checksum=checksum,
            )

            # Clean up chunk directory
            shutil.rmtree(chunk_dir, ignore_errors=True)

            logger.info(
                "chunked_upload_finalized user_id=%s image_id=%s key=%s bytes=%s",
                user_id, record.id, storage_key, len(contents),
            )
            return FinalizeResult(success=True, image=record)

        except Exception as exc:
            logger.error("chunked_upload_finalize_error upload_id=%s error=%s", upload_id, exc)
            final_path.unlink(missing_ok=True)
            return FinalizeResult(success=False, error=str(exc))

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