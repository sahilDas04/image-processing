from fastapi import status

import pypdfium2 as pdfium
from PIL import Image

from app.core.exceptions import AppError
from app.schemas.images import ImageOperation, ImageProcessOptions
from app.services.processors.base import ImageProcessor

# 144 DPI — crisp output for a converter tool without ballooning file sizes.
PDF_RENDER_SCALE = 2.0

# Hard ceiling on how many pages can be rasterized at once (Also: long-pole; max output work).
MAX_PDF_PAGES = 64


class PdfToImageProcessor(ImageProcessor):
    """Render pages of an uploaded PDF to raster images.

    Unlike the other processors this one consumes raw PDF bytes rather than a
    PIL image, so ``process`` is called with the validated upload contents.
    """

    operation = ImageOperation.from_pdf

    def process(self, pdf_bytes: bytes, options: ImageProcessOptions) -> Image.Image:
        with pdfium.PdfDocument(pdf_bytes) as document:
            self._require_page(document, options)
            return self._render_page(document, options.page - 1, options)

    def render_all(self, pdf_bytes: bytes, options: ImageProcessOptions) -> list[Image.Image]:
        """Render every page in order."""
        with pdfium.PdfDocument(pdf_bytes) as document:
            page_count = len(document)
            if page_count == 0:
                raise AppError(
                    "The PDF contains no pages.",
                    status_code=status.HTTP_400_BAD_REQUEST,
                    error_code="EMPTY_PDF",
                )
            if page_count > MAX_PDF_PAGES:
                raise AppError(
                    f"This PDF has {page_count} pages; at most {MAX_PDF_PAGES} pages can be "
                    "converted at once.",
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    error_code="PDF_TOO_MANY_PAGES",
                    details={"pages": page_count, "max_pages": MAX_PDF_PAGES},
                )
            return [self._render_page(document, index, options) for index in range(page_count)]

    @staticmethod
    def _require_page(document: "pdfium.PdfDocument", options: ImageProcessOptions) -> None:
        if len(document) == 0:
            raise AppError(
                "The PDF contains no pages.",
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code="EMPTY_PDF",
            )

        page_index = options.page - 1
        if page_index < 0 or page_index >= len(document):
            raise AppError(
                f"Page {options.page} does not exist — the PDF has {len(document)} page(s).",
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                error_code="PDF_PAGE_OUT_OF_RANGE",
                details={"pages": len(document)},
            )

    def _render_page(
        self,
        document: "pdfium.PdfDocument",
        page_index: int,
        options: ImageProcessOptions,
    ) -> Image.Image:
        page = document[page_index]
        bitmap = page.render(scale=PDF_RENDER_SCALE)
        try:
            # to_pil() shares the bitmap buffer, so copy before it is freed.
            image = bitmap.to_pil().copy()
        finally:
            bitmap.close()
        page.close()

        if options.output_format in {"jpeg", "webp"}:
            return image.convert("RGB")

        return image.convert("RGBA")
