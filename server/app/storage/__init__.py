from app.core.config import settings
from app.storage.base import StorageProvider
from app.storage.local import LocalStorageProvider

_storage: StorageProvider | None = None


def get_storage() -> StorageProvider:
    """Return the configured storage provider (module-level singleton)."""
    global _storage
    if _storage is None:
        if settings.storage_provider == "s3":
            from app.storage.s3 import S3StorageProvider

            _storage = S3StorageProvider()
        elif settings.storage_provider == "local":
            _storage = LocalStorageProvider()
        else:
            raise ValueError(
                f"Unknown storage_provider '{settings.storage_provider}'. "
                "Use 'local' or 's3'."
            )
    return _storage


storage = get_storage()
