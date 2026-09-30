from datetime import datetime
from enum import StrEnum
import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ImageOperation(StrEnum):
    compress = "compress"
    convert = "convert"
    grayscale = "grayscale"
    blur = "blur"
    sharpen = "sharpen"
    enhance = "enhance"
    rotate = "rotate"
    resize = "resize"
    reduce_size = "reduce_size"
    from_pdf = "from_pdf"
    to_pdf = "to_pdf"


class ImageFormat(StrEnum):
    jpeg = "jpeg"
    png = "png"
    webp = "webp"


class ImageProcessOptions(BaseModel):
    operation: ImageOperation = ImageOperation.grayscale
    width: int | None = Field(default=None, ge=1, le=4000)
    height: int | None = Field(default=None, ge=1, le=4000)
    angle: int = Field(default=90, ge=-360, le=360)
    strength: float = Field(default=1.25, ge=1, le=3)
    quality: int = Field(default=75, ge=10, le=95)
    max_dimension: int = Field(default=1600, ge=100, le=4000)
    page: int = Field(default=1, ge=1)
    all_pages: bool = False
    output_format: ImageFormat = ImageFormat.png


class ImageProcessResponse(BaseModel):
    id: str
    filename: str
    content_type: str
    size_bytes: int
    width: int
    height: int


# ── Image CRUD ──


class ImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    filename: str
    original_name: str
    mime_type: str
    size_bytes: int
    width: int | None
    height: int | None
    storage_key: str
    checksum: str | None
    created_at: datetime
    updated_at: datetime


class ImageListResponse(BaseModel):
    items: list[ImageOut]
    total: int
    skip: int
    limit: int


class ImageUpdateRequest(BaseModel):
    filename: str | None = Field(default=None, min_length=1, max_length=255)
    original_name: str | None = Field(default=None, min_length=1, max_length=255)


class ImageDeleteResponse(BaseModel):
    message: str
    id: uuid.UUID


# ── Upload ──


class UploadResultItem(BaseModel):
    filename: str
    status: Literal["stored", "duplicate", "error"]
    image: ImageOut | None = None
    checksum: str | None = None
    error: str | None = None


class UploadResponse(BaseModel):
    total: int
    stored: int
    duplicates: int
    errors: int
    results: list[UploadResultItem]
