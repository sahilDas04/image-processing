from abc import ABC, abstractmethod
from dataclasses import dataclass

from PIL import Image

from app.schemas.images import ImageOperation, ImageProcessOptions


@dataclass(frozen=True)
class ProcessedImage:
    image: Image.Image
    media_type: str
    content: bytes
    filename: str


class ImageProcessor(ABC):
    operation: ImageOperation

    @abstractmethod
    def process(self, image: Image.Image, options: ImageProcessOptions) -> Image.Image:
        raise NotImplementedError
