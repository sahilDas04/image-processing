import hashlib
from io import BytesIO

from fastapi import UploadFile, status
from PIL import Image, UnidentifiedImageError

from app.core.exceptions import AppError

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
IMAGE_SIGNATURES = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
}
IMAGE_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def sha256_checksum(contents: bytes) -> str:
    return hashlib.sha256(contents).hexdigest()


def validate_signature(*, contents: bytes, content_type: str | None) -> None:
    """Reject content whose magic bytes don't match the declared MIME type."""
    if content_type is None:
        raise AppError(
            "Missing image content type.",
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            error_code="MISSING_CONTENT_TYPE",
        )

    signatures = IMAGE_SIGNATURES.get(content_type)
    if signatures is None or not any(contents.startswith(sig) for sig in signatures):
        raise AppError(
            "The uploaded file content does not match its declared image type.",
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code="IMAGE_SIGNATURE_MISMATCH",
            details={"content_type": content_type},
        )

    if content_type == "image/webp" and contents[8:12] != b"WEBP":
        raise AppError(
            "The uploaded file content does not match its declared image type.",
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code="IMAGE_SIGNATURE_MISMATCH",
            details={"content_type": content_type},
        )


async def read_and_validate_image(
    file: UploadFile,
    *,
    max_size_mb: int,
) -> tuple[bytes, Image.Image]:
    """Read an uploaded image, validate it, and return (bytes, PIL.Image)."""
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise AppError(
            "Upload a JPEG, PNG, or WebP image.",
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            error_code="UNSUPPORTED_IMAGE_TYPE",
            details={"content_type": file.content_type},
        )

    contents = await file.read()
    max_size = max_size_mb * 1024 * 1024
    if len(contents) > max_size:
        raise AppError(
            f"Image must be {max_size_mb} MB or smaller.",
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            error_code="IMAGE_TOO_LARGE",
            details={"max_size_mb": max_size_mb},
        )

    validate_signature(contents=contents, content_type=file.content_type)

    try:
        image = Image.open(BytesIO(contents))
        image.load()
    except UnidentifiedImageError as exc:
        raise AppError(
            "The uploaded file is not a valid image.",
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code="INVALID_IMAGE",
        ) from exc

    return contents, image
