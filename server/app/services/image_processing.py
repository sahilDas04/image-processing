from io import BytesIO
import logging
import zipfile

from fastapi import UploadFile, status
from PIL import Image, ImageOps

from app.core.exceptions import AppError

from app.schemas.images import ImageFormat, ImageOperation, ImageProcessOptions
from app.services.image_validation import read_and_validate_image, read_and_validate_pdf
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
        if options.operation == ImageOperation.from_pdf:
            return await self._process_pdf(file=file, options=options, max_size_mb=max_size_mb)

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

    async def _process_pdf(
        self,
        *,
        file: UploadFile,
        options: ImageProcessOptions,
        max_size_mb: int,
    ) -> ProcessedImage:
        pdf_bytes = await read_and_validate_pdf(file=file, max_size_mb=max_size_mb)
        processor = self._registry.get(options.operation)

        if options.all_pages:
            pages = processor.render_all(pdf_bytes, options)
            content, media_type, filename = self._encode_pages_zip(pages, options)
            image = pages[0]
        else:
            rendered = processor.process(pdf_bytes, options)
            content, media_type, filename = self._encode_processed_image(rendered, options)
            image = rendered

        logger.info(
            "pdf_processed operation=%s page=%s all_pages=%s input_content_type=%s output_media_type=%s output_bytes=%s",
            options.operation,
            options.page,
            options.all_pages,
            file.content_type,
            media_type,
            len(content),
        )

        return ProcessedImage(
            image=image,
            media_type=media_type,
            content=content,
            filename=filename,
        )

    async def images_to_pdf(
        self,
        *,
        files: list[UploadFile],
        max_size_mb: int,
    ) -> ProcessedImage:
        """Combine one or more images into a single multi-page PDF (one page each)."""
        if not files:
            raise AppError(
                "Choose at least one image.",
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                error_code="NO_IMAGES_TO_CONVERT",
            )

        images: list[Image.Image] = []
        for file in files:
            _, image = await read_and_validate_image(file=file, max_size_mb=max_size_mb)
            images.append(ImageOps.exif_transpose(image))

        content = self._encode_images_pdf(images)

        logger.info(
            "images_to_pdf input_count=%s output_media_type=application/pdf output_bytes=%s",
            len(images),
            len(content),
        )

        return ProcessedImage(
            image=images[0],
            media_type="application/pdf",
            content=content,
            filename="converted.pdf",
        )

    def _encode_processed_image(self, image: Image.Image, options: ImageProcessOptions) -> tuple[bytes, str, str]:
        if options.operation in {ImageOperation.compress, ImageOperation.reduce_size}:
            return self._encode_jpeg(image, options.quality), COMPRESSED_MEDIA_TYPE, "processed.jpg"

        if options.operation in {ImageOperation.convert, ImageOperation.from_pdf}:
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

    def _encode_pages_zip(
        self,
        pages: list[Image.Image],
        options: ImageProcessOptions,
    ) -> tuple[bytes, str, str]:
        extension = {
            ImageFormat.jpeg: "jpg",
            ImageFormat.webp: "webp",
            ImageFormat.png: "png",
        }[options.output_format]

        buffer = BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            for index, page in enumerate(pages, start=1):
                if options.output_format == ImageFormat.jpeg:
                    data = self._encode_jpeg(page, options.quality)
                elif options.output_format == ImageFormat.webp:
                    data = self._encode_webp(page, options.quality)
                else:
                    data = self._encode_png(page)
                archive.writestr(f"page_{index:03d}.{extension}", data)

        return buffer.getvalue(), "application/zip", "pdf_pages.zip"

    def _encode_images_pdf(self, images: list[Image.Image]) -> bytes:
        flattened = [self._flatten_to_rgb(image) for image in images]
        buffer = BytesIO()
        flattened[0].save(
            buffer,
            format="PDF",
            save_all=True,
            append_images=flattened[1:],
            resolution=144,
        )
        return buffer.getvalue()

    @staticmethod
    def _flatten_to_rgb(image: Image.Image) -> Image.Image:
        """Composite alpha onto white so PDF pages render predictably."""
        if image.mode in {"RGBA", "LA"}:
            rgba = image.convert("RGBA")
            background = Image.new("RGB", rgba.size, (255, 255, 255))
            background.paste(rgba, mask=rgba.getchannel("A"))
            return background
        return image.convert("RGB")


image_processing_service = ImageProcessingService(processor_registry)
