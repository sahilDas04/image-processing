"""Security tests for header/CORS/size-cap protections."""

import asyncio
import io

import pytest

from app.core.exceptions import AppError
from app.core.filenames import build_content_disposition, sanitize_filename
from app.services.image_validation import read_upload_limited


# ── Filename sanitization (Content-Disposition injection) ──


@pytest.mark.parametrize(
    "dirty",
    [
        'evil"name.txt',
        "evil\r\nX-Injected: 1",
        "evil\nInjected: header",
        "evil\x00nul.jpg",
        "../outside.png",
    ],
)
def test_sanitize_filename_strips_injection_chars(dirty):
    clean = sanitize_filename(dirty)
    assert "\r" not in clean and "\n" not in clean and '"' not in clean
    assert "\x00" not in clean


def test_sanitize_filename_fallback_on_empty():
    assert sanitize_filename("  ") == "download"
    assert sanitize_filename("..") == "download"


def test_sanitize_filename_keeps_good_name():
    assert sanitize_filename("photo.png") == "photo.png"


def test_content_disposition_is_wellformed():
    value = build_content_disposition('a"b\r\nc.png')
    assert value.startswith('inline; filename="')
    assert "\r" not in value and "\n" not in value
    # RFC 5987 asterisk filename is appended after the quoted name.
    assert "filename*=UTF-8''" in value
    # The name echoed in the quoted filename= has no quotes or control chars.
    _, quoted = value.split('filename="', 1)
    name, _rest = quoted.split('"', 1)
    assert '"' not in name
    assert not any(ch in name for ch in "\r\n\x00")


# ── CORS wildcard guard ──


def test_wildcard_cors_origin_is_rejected():
    from app.core.config import assert_safe_cors_origins

    try:
        assert_safe_cors_origins(["*"])
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "wildcard" in str(exc).lower()


def test_explicit_cors_origins_are_accepted():
    from app.core.config import assert_safe_cors_origins

    assert_safe_cors_origins(["http://localhost:5173", "http://127.0.0.1:5173"])
    assert_safe_cors_origins([])


# ── Bounded upload reads (memory DoS) ──


def _upload_with(raw: bytes):
    from starlette.datastructures import UploadFile

    return UploadFile(file=io.BytesIO(raw), filename="x.png", headers={})


def test_oversized_upload_is_rejected_without_full_buffering():
    async def run():
        upload = _upload_with(b"\x00" * (5 * 1024 * 1024 + 10))
        try:
            await read_upload_limited(upload, max_size_mb=4, kind="Image")
        except AppError as exc:
            assert exc.status_code == 413
            return
        assert False, "expected AppError for oversized upload"

    asyncio.run(run())


def test_undersized_upload_reads_entirely():
    async def run():
        upload = _upload_with(b"\xff" * 1024)
        data = await read_upload_limited(upload, max_size_mb=4, kind="Image")
        assert len(data) == 1024

    asyncio.run(run())


# ── PDF page cap ──


def test_pdf_render_all_caps_pages(monkeypatch):
    from fastapi import status

    from app.core.exceptions import AppError
    from app.services.processors.pdf import MAX_PDF_PAGES, PdfToImageProcessor

    processor = PdfToImageProcessor()

    class FakeDoc:
        def __len__(self):
            return MAX_PDF_PAGES + 1

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(
        "app.services.processors.pdf.pdfium.PdfDocument",
        lambda _pdf_bytes: FakeDoc(),
    )

    async def run():
        from app.schemas.images import ImageProcessOptions

        options = ImageProcessOptions(operation="from_pdf", all_pages=True, output_format="png")
        try:
            processor.render_all(b"%PDF-1.4 fake", options)
        except AppError as exc:
            assert exc.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
            assert exc.error_code == "PDF_TOO_MANY_PAGES"
            return
        assert False, "expected AppError for too many pages"

    asyncio.run(run())


# ── Security headers middleware ──


def test_security_headers_present():
    async def run():
        from starlette.requests import Request
        from starlette.responses import Response

        from app.middleware.security_headers import add_security_headers

        async def call_next(request):
            return Response(content=b"{}")

        scope = {"type": "http", "method": "GET", "path": "/", "query_string": b"", "headers": []}
        response = await add_security_headers(Request(scope), call_next)
        for header in (
            "x-content-type-options",
            "x-frame-options",
            "referrer-policy",
            "content-security-policy",
            "cross-origin-opener-policy",
            "cross-origin-resource-policy",
        ):
            assert header in response.headers, header

    asyncio.run(run())


# ── CORS wildcard guard ──


def test_wildcard_cors_origin_is_rejected():
    from app.core.config import assert_safe_cors_origins

    try:
        assert_safe_cors_origins(["*"])
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "wildcard" in str(exc).lower()


def test_explicit_cors_origins_are_accepted():
    from app.core.config import assert_safe_cors_origins

    assert_safe_cors_origins(["http://localhost:5173"])
    assert_safe_cors_origins([])