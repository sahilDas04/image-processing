import logging
from pathlib import Path

import aiofiles

from app.core.config import settings
from app.storage.base import StorageProvider

logger = logging.getLogger(__name__)


class LocalStorageProvider(StorageProvider):
    """Filesystem-backed storage for local development.

    Files are stored under ``{local_storage_dir}/{key}``. Keys are resolved
    against the root and rejected if they would escape it (path traversal).
    """

    def __init__(self, root: str | Path | None = None) -> None:
        self.root = Path(root or settings.local_storage_dir).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _resolve(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError(f"Storage key escapes root: {key}")
        return path

    async def save(self, *, key: str, data: bytes, content_type: str | None = None) -> str:
        path = self._resolve(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        async with aiofiles.open(path, "wb") as fh:
            await fh.write(data)
        logger.info("storage_local_save key=%s bytes=%s", key, len(data))
        return key

    async def load(self, key: str) -> bytes:
        path = self._resolve(key)
        if not path.exists():
            raise KeyError(key)
        async with aiofiles.open(path, "rb") as fh:
            return await fh.read()

    async def delete(self, key: str) -> None:
        path = self._resolve(key)
        try:
            path.unlink()
        except FileNotFoundError:
            pass

    async def list(self, prefix: str = "") -> list[str]:
        base = self._resolve(prefix) if prefix else self.root
        return [
            str(path.relative_to(self.root)).replace("\\", "/")
            for path in base.rglob("*")
            if path.is_file()
        ]

    async def exists(self, key: str) -> bool:
        return self._resolve(key).exists()
