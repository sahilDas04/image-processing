from abc import ABC, abstractmethod


class StorageProvider(ABC):
    """Pluggable object-storage backend.

    Keys are opaque strings (e.g. ``"<user_id>/<uuid>.png"``) that the provider
    resolves to a physical location. Callers must treat keys as opaque so they
    never depend on a concrete layout.
    """

    @abstractmethod
    async def save(self, *, key: str, data: bytes, content_type: str | None = None) -> str:
        """Persist ``data`` under ``key`` and return the key."""

    @abstractmethod
    async def load(self, key: str) -> bytes:
        """Read the bytes stored under ``key``. Raises KeyError if missing."""

    @abstractmethod
    async def delete(self, key: str) -> None:
        """Remove the object stored under ``key``. No-op if missing."""

    @abstractmethod
    async def list(self, prefix: str = "") -> list[str]:
        """Return all keys matching ``prefix``."""

    @abstractmethod
    async def exists(self, key: str) -> bool:
        """Return True if an object exists under ``key``."""

    def signed_url(self, key: str, expires_in: int = 3600) -> str | None:
        """Return a temporary public URL for ``key``, or None if unsupported."""
        return None
