from fastapi import status
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

from app.core.exceptions import AppError
from app.schemas.images import ImageOperation, ImageProcessOptions
from app.services.processors.base import ImageProcessor


class GrayscaleProcessor(ImageProcessor):
    operation = ImageOperation.grayscale

    def process(self, image: Image.Image, _: ImageProcessOptions) -> Image.Image:
        return image.convert("L").convert("RGBA")


class CompressProcessor(ImageProcessor):
    operation = ImageOperation.compress

    def process(self, image: Image.Image, _: ImageProcessOptions) -> Image.Image:
        return image.convert("RGB")


class ConvertProcessor(ImageProcessor):
    operation = ImageOperation.convert

    def process(self, image: Image.Image, options: ImageProcessOptions) -> Image.Image:
        if options.output_format in {"jpeg", "webp"}:
            return image.convert("RGB")

        return image.convert("RGBA")


class BlurProcessor(ImageProcessor):
    operation = ImageOperation.blur

    def process(self, image: Image.Image, _: ImageProcessOptions) -> Image.Image:
        return image.convert("RGBA").filter(ImageFilter.GaussianBlur(radius=4))


class SharpenProcessor(ImageProcessor):
    operation = ImageOperation.sharpen

    def process(self, image: Image.Image, _: ImageProcessOptions) -> Image.Image:
        return image.convert("RGBA").filter(ImageFilter.SHARPEN)


class QualityEnhancementProcessor(ImageProcessor):
    operation = ImageOperation.enhance

    def process(self, image: Image.Image, options: ImageProcessOptions) -> Image.Image:
        enhanced = ImageOps.autocontrast(image.convert("RGB"))
        enhanced = ImageEnhance.Contrast(enhanced).enhance(options.strength)
        enhanced = ImageEnhance.Sharpness(enhanced).enhance(options.strength)
        return ImageEnhance.Color(enhanced).enhance(min(options.strength, 1.5))


class RotateProcessor(ImageProcessor):
    operation = ImageOperation.rotate

    def process(self, image: Image.Image, options: ImageProcessOptions) -> Image.Image:
        return image.convert("RGBA").rotate(options.angle, expand=True)


class ResizeProcessor(ImageProcessor):
    operation = ImageOperation.resize

    def process(self, image: Image.Image, options: ImageProcessOptions) -> Image.Image:
        if options.width is None or options.height is None:
            raise AppError(
                "Width and height are required for resize.",
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                error_code="RESIZE_DIMENSIONS_REQUIRED",
            )

        return image.convert("RGBA").resize((options.width, options.height), Image.Resampling.LANCZOS)


class SizeReductionProcessor(ImageProcessor):
    operation = ImageOperation.reduce_size

    def process(self, image: Image.Image, options: ImageProcessOptions) -> Image.Image:
        reduced = image.convert("RGB")
        reduced.thumbnail((options.max_dimension, options.max_dimension), Image.Resampling.LANCZOS)
        return reduced
