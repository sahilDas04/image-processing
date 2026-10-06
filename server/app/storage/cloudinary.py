import asyncio
import logging
from functools import partial

from app.core.config import settings
from app.storage.base import StorageProvider

logger = logging.getLogger(__name__)

# Assets are stored as `raw` so Cloudinary treats them as opaque bytes. The
# transformation engine only accepts images/video/audio, and this project also
# handles PDFs — `raw` stores and returns every asset byte-faithfully with no
# re-encode, which matters because processed output must match what was saved.
_RESOURCE_TYPE = "raw"


def _to_public_id(key: str) -> str:
    """Map an opaque storage key onto a Cloudinary public_id.

    Callers build keys as ``"<user_id>/<uuid>.<ext>"`` or
    ``"<user_id>/result/<uuid>.<ext>"``. Cloudinary keeps the format in asset
    metadata rather than in the public_id, so the extension is stripped and the
    remaining slash-separated path is used as-is.
    """
    parent, _, filename = key.rpartition("/")
    stem = filename.rsplit(".", 1)[0] if "." in filename else filename
    return f"{parent}/{stem}" if parent else stem


def _from_public_id(public_id: str) -> str:
    """Inverse of :func:`_to_public_id` — Cloudinary public_id back to a storage key."""
    parent, _, stem = public_id.rpartition("/")
    return f"{parent}/{stem}" if parent else stem


class CloudinaryStorageProvider(StorageProvider):
    """Cloudinary media storage.

    The cloudinary SDK is synchronous and blocks on network I/O, so every call
    is offloaded to a worker thread instead of stalling the event loop for the
    duration of each upload and download.

    The package is imported lazily so the app still runs on the local or S3
    provider when it is not installed.
    """

    def __init__(self) -> None:
        if not settings.cloudinary_configured:
            raise RuntimeError(
                "Cloudinary storage requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and "
                "CLOUDINARY_API_SECRET. Set them, or pick a different STORAGE_PROVIDER."
            )

        try:
            import cloudinary
            from cloudinary import api as cloudinary_api
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
        self._api = cloudinary_api
        self.folder = settings.cloudinary_folder.strip("/")
        self.delivery_type = settings.cloudinary_delivery_type

    def _remote_public_id(self, key: str) -> str:
        public_id = _to_public_id(key)
        return f"{self.folder}/{public_id}" if self.folder else public_id

    async def save(self, *, key: str, data: bytes, content_type: str | None = None) -> str:
        upload = partial(
            self._cloudinary.uploader.upload,
            data,
            public_id=self._remote_public_id(key),
            resource_type=_RESOURCE_TYPE,
            type=self.delivery_type,
            overwrite=True,
        )
        result = await asyncio.to_thread(upload)

        if not result or result.get("error"):
            message = (result or {}).get("error", {}).get("message", "unknown Cloudinary error")
            raise RuntimeError(f"Cloudinary upload failed for '{key}': {message}")

        return key

    async def load(self, key: str) -> bytes:
        fetch = partial(
            self._api.download,
            self._remote_public_id(key),
            resource_type=_RESOURCE_TYPE,
            type=self.delivery_type,
        )
        try:
            data = await asyncio.to_thread(fetch)
        except Exception as exc:
            # Normalise Cloudinary's "resource not found" into the KeyError the
            # base contract documents, so download routes can answer 404.
            raise KeyError(f"Cloudinary asset not found: '{key}'") from exc

        if not data:
            raise KeyError(f"Cloudinary asset not found: '{key}'")
        return data

    async def delete(self, key: str) -> None:
        destroy = partial(
            self._api.destroy,
            self._remote_public_id(key),
            resource_type=_RESOURCE_TYPE,
            type=self.delivery_type,
            invalidate=True,
        )
        try:
            await asyncio.to_thread(destroy)
        except Exception as exc:
            # Best-effort: an already-missing asset must not fail the caller's
            # request, otherwise a stored row can never be cleaned up.
            logger.warning("Cloudinary delete failed for '%s': %s", key, exc)

    async def list(self, prefix: str = "") -> list[str]:
        remote_prefix = f"{self.folder}/{prefix}" if self.folder else prefix
        keys: list[str] = []
        next_cursor: str | None = None

        # Cloudinary caps a listing page at 500 resources and hands back a cursor
        # until the walk is exhausted.
        while True:
            options: dict = {"next_cursor": next_cursor} if next_cursor else {}
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
            keys.extend(_from_public_id(a["public_id"]) for a in page.get("resources", []))
            next_cursor = page.get("next_cursor")
            if not next_cursor:
                break

        return keys

    async def exists(self, key: str) -> bool:
        probe = partial(
            self._api.resource,
            self._remote_public_id(key),
            resource_type=_RESOURCE_TYPE,
            type=self.delivery_type,
        )
        return await asyncio.to_thread(probe) is not None