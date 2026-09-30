from fastapi import status

from app.core.exceptions import AppError
from app.schemas.images import ImageOperation
from app.services.processors.base import ImageProcessor
from app.services.processors.basic import (
    BlurProcessor,
    CompressProcessor,
    ConvertProcessor,
    GrayscaleProcessor,
    QualityEnhancementProcessor,
    ResizeProcessor,
    RotateProcessor,
    SharpenProcessor,
    SizeReductionProcessor,
)
from app.services.processors.pdf import PdfToImageProcessor


class ProcessorRegistry:
    def __init__(self, processors: list[ImageProcessor]) -> None:
        self._processors = {processor.operation: processor for processor in processors}

    def get(self, operation: ImageOperation) -> ImageProcessor:
        try:
            return self._processors[operation]
        except KeyError:
            raise AppError(
                f"Operation '{operation}' is not supported here.",
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                error_code="UNSUPPORTED_OPERATION",
            ) from None


processor_registry = ProcessorRegistry(
    processors=[
        GrayscaleProcessor(),
        CompressProcessor(),
        ConvertProcessor(),
        BlurProcessor(),
        SharpenProcessor(),
        QualityEnhancementProcessor(),
        RotateProcessor(),
        ResizeProcessor(),
        SizeReductionProcessor(),
        PdfToImageProcessor(),
    ]
)
