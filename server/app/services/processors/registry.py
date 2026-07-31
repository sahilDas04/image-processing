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


class ProcessorRegistry:
    def __init__(self, processors: list[ImageProcessor]) -> None:
        self._processors = {processor.operation: processor for processor in processors}

    def get(self, operation: ImageOperation) -> ImageProcessor:
        return self._processors[operation]


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
    ]
)
