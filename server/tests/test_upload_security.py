"""Security tests for the chunked-upload path validation."""

import pytest

from app.services.upload import UploadService


def _service(tmp_path) -> UploadService:
    svc = UploadService()
    svc.chunk_base_dir = tmp_path
    svc.chunk_base_dir.mkdir(parents=True, exist_ok=True)
    return svc


def test_valid_upload_id_creates_dir(tmp_path):
    svc = _service(tmp_path)
    chunk_dir = svc._get_chunk_dir("a" * 32)
    assert chunk_dir.is_relative_to(tmp_path.resolve())
    assert chunk_dir.exists()


@pytest.mark.parametrize(
    "malicious",
    [
        "../escape",
        "..%2fescaped",
        "..",
        "..%2f",
        "a/../b",
        "..\\escape",
        "%2e%2e%2fescape",
        "a" * 31,  # too short
        "g" * 32,  # non-hex
        "A" * 32,  # uppercase hex — invalid by design
    ],
)
def test_path_traversal_is_rejected(tmp_path, malicious):
    svc = _service(tmp_path)
    with pytest.raises(ValueError):
        svc._get_chunk_dir(malicious)


def test_escaped_id_does_not_escape_base_dir(tmp_path):
    svc = _service(tmp_path)
    base = tmp_path.resolve()
    with pytest.raises(ValueError):
        svc._get_chunk_dir("../outside")
    assert base / "outside" not in list(tmp_path.iterdir())


def test_upload_id_regex_rejects_separators():
    from app.services.upload import _UPLOAD_ID_RE

    assert _UPLOAD_ID_RE.fullmatch("a" * 32)
    assert not _UPLOAD_ID_RE.fullmatch("a" * 31)
    assert not _UPLOAD_ID_RE.fullmatch("a/../b")
    assert not _UPLOAD_ID_RE.fullmatch("..")