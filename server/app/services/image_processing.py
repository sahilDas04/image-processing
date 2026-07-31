from io import BytesIO
import logging

from fastapi import UploadFile
from PIL import Image, ImageOps

from app.schemas.images import ImageFormat, ImageOperation, ImageProcessOptions
from app.services.image_validation import read_and_validate_image
from app.services.processors.base import ProcessedImage
from app.services.processors.registry import ProcessorRegistry, processor_registry


OUTPUT_MEDIA_TYPE = "image/png"
COMPRESSED_MEDIA_TYPE = "image/jpeg"
WEBP_MEDIA_TYPE = "image/webp"

logger = logging.getLogger(__name__)


class ImageProcessingService:
    def __init__(self, registry: ProcessorRegistry) -> None:
        self._registry = registry

    async def process_upload(
        self,
        *,
        file: UploadFile,
        options: ImageProcessOptions,
        max_size_mb: int,
    ) -> ProcessedImage:
        _, image = await read_and_validate_image(file=file, max_size_mb=max_size_mb)
        normalized = ImageOps.exif_transpose(image)
        processor = self._registry.get(options.operation)
        processed = processor.process(normalized, options)

        content, media_type, filename = self._encode_processed_image(processed, options)

        logger.info(
            "image_processed operation=%s input_content_type=%s output_media_type=%s output_bytes=%s",
            options.operation,
            file.content_type,
            media_type,
            len(content),
        )

        return ProcessedImage(
            image=processed,
            media_type=media_type,
            content=content,
            filename=filename,
        )

    def _encode_processed_image(self, image: Image.Image, options: ImageProcessOptions) -> tuple[bytes, str, str]:
        if options.operation in {ImageOperation.compress, ImageOperation.reduce_size}:
            return self._encode_jpeg(image, options.quality), COMPRESSED_MEDIA_TYPE, "processed.jpg"

        if options.operation == ImageOperation.convert:
            if options.output_format == ImageFormat.jpeg:
                return self._encode_jpeg(image, options.quality), COMPRESSED_MEDIA_TYPE, "processed.jpg"
            if options.output_format == ImageFormat.webp:
                return self._encode_webp(image, options.quality), WEBP_MEDIA_TYPE, "processed.webp"

        return self._encode_png(image), OUTPUT_MEDIA_TYPE, "processed.png"

    def _encode_png(self, image: Image.Image) -> bytes:
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()

    def _encode_jpeg(self, image: Image.Image, quality: int) -> bytes:
        buffer = BytesIO()
        image.convert("RGB").save(
            buffer,
            format="JPEG",
            quality=quality,
            optimize=True,
            progressive=True,
        )
        return buffer.getvalue()

    def _encode_webp(self, image: Image.Image, quality: int) -> bytes:
        buffer = BytesIO()
        image.convert("RGB").save(
            buffer,
            format="WEBP",
            quality=quality,
            method=6,
        )
        return buffer.getvalue()


image_processing_service = ImageProcessingService(processor_registry)
