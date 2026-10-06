"""Tests for the production storage provider selection and key mapping."""

import pytest

from app.core.config import _Settings
from app.storage.cloudinary import _from_public_id, _to_public_id


def _make_settings(**overrides) -> _Settings:
    return _Settings(_env_file=None, **overrides)


# ── public_id <-> storage key mapping ──


@pytest.mark.parametrize(
    "key",
    [
        "0f8fad5b-d9cb-469f-a165-70867728950e/a1b2c3d4.png",
        "0f8fad5b-d9cb-469f-a165-70867728950e/result/deadbeef.jpg",
        "0f8fad5b-d9cb-469f-a165-70867728950e/doc.pdf",
    ],
)
def test_public_id_strips_only_the_extension(key: str):
    """The user id and sub-folders must survive so Cloudinary can list by prefix."""
    public_id = _to_public_id(key)

    assert not public_id.endswith(".png")
    assert not public_id.endswith(".jpg")
    assert not public_id.endswith(".pdf")
    assert public_id.startswith("0f8fad5b-d9cb-469f-a165-70867728950e")


def test_public_id_mapping_is_lossless_enough_to_list():
    """`list()` must hand back keys the other methods can consume again."""
    key = "user-1/result/abc123.webp"
    assert _from_public_id(_to_public_id(key)) == "user-1/result/abc123"


def test_extensionless_key_is_preserved():
    assert _to_public_id("user-1/abc123") == "user-1/abc123"


# ── configuration guards ──


def test_cloudinary_is_not_configured_without_credentials():
    cfg = _make_settings(
        cloudinary_cloud_name="",
        cloudinary_api_key="",
        cloudinary_api_secret="",
    )
    assert cfg.cloudinary_configured is False


def test_cloudinary_requires_all_three_credentials():
    cfg = _make_settings(
        cloudinary_cloud_name="demo",
        cloudinary_api_key="key",
        cloudinary_api_secret="",
    )
    assert cfg.cloudinary_configured is False


def test_cloudinary_is_configured_when_complete():
    cfg = _make_settings(
        cloudinary_cloud_name="demo",
        cloudinary_api_key="key",
        cloudinary_api_secret="secret",
    )
    assert cfg.cloudinary_configured is True


def test_provider_rejects_an_unknown_name():
    """A typo in STORAGE_PROVIDER must fail loudly at boot, not silently write locally."""
    import app.storage as storage_module

    original_name = storage_module.settings.storage_provider
    original_instance = storage_module._storage
    storage_module.settings.storage_provider = "gcs"
    storage_module._storage = None  # bypass the import-time singleton
    try:
        with pytest.raises(ValueError, match="cloudinary"):
            storage_module.get_storage()
    finally:
        storage_module.settings.storage_provider = original_name
        storage_module._storage = original_instance


def test_cloudinary_provider_is_reachable_from_the_factory():
    """The factory must wire STORAGE_PROVIDER=cloudinary, not reject it as unknown."""
    import app.storage as storage_module
    from app.storage.cloudinary import CloudinaryStorageProvider

    original_name = storage_module.settings.storage_provider
    original_instance = storage_module._storage
    original_credentials = (
        storage_module.settings.cloudinary_cloud_name,
        storage_module.settings.cloudinary_api_key,
        storage_module.settings.cloudinary_api_secret,
    )
    storage_module.settings.storage_provider = "cloudinary"
    storage_module.settings.cloudinary_cloud_name = "demo-cloud"
    storage_module.settings.cloudinary_api_key = "demo-key"
    storage_module.settings.cloudinary_api_secret = "demo-secret"
    storage_module._storage = None
    try:
        assert isinstance(storage_module.get_storage(), CloudinaryStorageProvider)
    finally:
        storage_module.settings.storage_provider = original_name
        storage_module._storage = original_instance
        (
            storage_module.settings.cloudinary_cloud_name,
            storage_module.settings.cloudinary_api_key,
            storage_module.settings.cloudinary_api_secret,
        ) = original_credentials


def test_cloudinary_provider_refuses_to_start_without_credentials():
    """Better a boot-time failure than a silent fallback to ephemeral local disk."""
    import app.storage as storage_module
    from app.storage.cloudinary import CloudinaryStorageProvider

    original = (
        storage_module.settings.cloudinary_cloud_name,
        storage_module.settings.cloudinary_api_key,
        storage_module.settings.cloudinary_api_secret,
    )
    storage_module.settings.cloudinary_cloud_name = ""
    storage_module.settings.cloudinary_api_key = ""
    storage_module.settings.cloudinary_api_secret = ""
    try:
        with pytest.raises(RuntimeError, match="CLOUDINARY_CLOUD_NAME"):
            CloudinaryStorageProvider()
    finally:
        (
            storage_module.settings.cloudinary_cloud_name,
            storage_module.settings.cloudinary_api_key,
            storage_module.settings.cloudinary_api_secret,
        ) = original