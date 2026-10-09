
import asyncio
import logging
from functools import partial

from app.core.config import settings
from app.storage.base import StorageProvider

logger = logging.getLogger(__name__)

# Store files as raw assets so images and PDFs retain their original bytes.
_RESOURCE_TYPE = "raw"
_CHUNK_SIZE = 6_000_000


def _to_public_id(key: str) -> str:
    """Convert a storage key into a Cloudinary public ID."""
    parent, _, filename = key.rpartition("/")
    stem = filename.rsplit(".", 1)[0] if "." in filename else filename
    return f"{parent}/{stem}" if parent else stem


def _from_public_id(public_id: str) -> str:
    """Convert a Cloudinary public ID back into a storage key."""
    parent, _, stem = public_id.rpartition("/")
    return f"{parent}/{stem}" if parent else stem


class CloudinaryStorageProvider(StorageProvider):
    """Cloudinary storage provider using worker threads for network I/O."""

    def __init__(self) -> None:
        if not settings.cloudinary_configured:
            raise RuntimeError(
                "Cloudinary storage requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY "
                "and CLOUDINARY_API_SECRET. Set them, or choose a different "
                "STORAGE_PROVIDER."
            )

        try:
            import cloudinary
            from cloudinary import api as cloudinary_api
            from cloudinary import uploader as cloudinary_uploader
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "Cloudinary storage requires the cloudinary package. "
                "Install it with `uv add cloudinary`."
            ) from exc

        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
            secure=True,
        )

        self._cloudinary = cloudinary
        self._uploader = cloudinary_uploader
        self._api = cloudinary_api
        self.folder = settings.cloudinary_folder.strip("/")
        self.delivery_type = settings.cloudinary_delivery_type

    def _remote_public_id(self, key: str) -> str:
        """Add the configured Cloudinary folder to a storage key."""
        public_id = _to_public_id(key)
        return f"{self.folder}/{public_id}" if self.folder else public_id

    async def save(
        self,
        *,
        key: str,
        data: bytes,
        content_type: str | None = None,
    ) -> str:
        """Upload file bytes to Cloudinary using chunked upload."""
        upload = partial(
            self._uploader.upload_large,
            data,
            public_id=self._remote_public_id(key),
            resource_type=_RESOURCE_TYPE,
            type=self.delivery_type,
            overwrite=True,
            chunk_size=_CHUNK_SIZE,
        )

        result = await asyncio.to_thread(upload)

        if not result or result.get("error"):
            error = (result or {}).get("error") or {}
            message = error.get("message", "unknown Cloudinary error")
            raise RuntimeError(
                f"Cloudinary upload failed for '{key}': {message}"
            )

        return key

    async def load(self, key: str) -> bytes:
        """Download an asset from Cloudinary."""
        fetch = partial(
            self._api.download,
            self._remote_public_id(key),
            resource_type=_RESOURCE_TYPE,
            type=self.delivery_type,
        )

        try:
            data = await asyncio.to_thread(fetch)
        except Exception as exc:
            logger.warning(
                "Cloudinary download failed for '%s': %s",
                key,
                exc,
            )
            raise KeyError(
                f"Cloudinary asset not found: '{key}'"
            ) from exc

        if not data:
            raise KeyError(f"Cloudinary asset not found: '{key}'")

        return data

    async def delete(self, key: str) -> None:
        """Delete an asset from Cloudinary; failures are logged."""
        destroy = partial(
            self._api.destroy,
            self._remote_public_id(key),
            resource_type=_RESOURCE_TYPE,
            type=self.delivery_type,
            invalidate=True,
        )

        try:
            await asyncio.to_thread(destroy)
        except Exception:
            logger.exception(
                "Cloudinary delete failed for '%s'",
                key,
            )

    async def list(self, prefix: str = "") -> list[str]:
        """List storage keys matching a prefix, handling pagination."""
        remote_prefix = (
            f"{self.folder}/{prefix}" if self.folder else prefix
        )
        keys: list[str] = []
        next_cursor: str | None = None

        while True:
            options = (
                {"next_cursor": next_cursor}
                if next_cursor
                else {}
            )

            page = await asyncio.to_thread(
                partial(
                    self._api.resources,
                    type=self.delivery_type,
                    resource_type=_RESOURCE_TYPE,
                    prefix=remote_prefix,
                    max_results=500,
                    **options,
                )
            )

            keys.extend(
                _from_public_id(asset["public_id"])
                for asset in page.get("resources", [])
            )

            next_cursor = page.get("next_cursor")
            if not next_cursor:
                break

        return keys

    async def exists(self, key: str) -> bool:
        """Check whether an asset exists in Cloudinary."""
        probe = partial(
            self._api.resource,
            self._remote_public_id(key),
            resource_type=_RESOURCE_TYPE,
            type=self.delivery_type,
        )

        try:
            await asyncio.to_thread(probe)
            return True
        except Exception as exc:
            status_code = getattr(exc, "http_status", None)
            if status_code == 404:
                return False
            raise
