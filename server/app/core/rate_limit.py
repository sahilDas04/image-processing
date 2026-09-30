import time
from collections import deque
from collections.abc import Callable
from datetime import datetime, timezone

from fastapi import HTTPException, Request, status

from app.core.config import settings

# A simple in-process sliding-window rate limiter keyed by (route, client IP).
# It is deliberately dependency-free: auth endpoints are the only sensitive
# surface and the fastapi workers are stateless, so a per-process window is
# an acceptable baseline. Swap for a shared store (Redis) for multi-worker prod.


class _SlidingWindowRateLimiter:
    def __init__(self, *, limit_per_minute: int) -> None:
        self._limit = limit_per_minute
        self._hits: dict[tuple[str, str], deque[float]] = {}
        self._last_prune = 0.0

    def _prune(self, now: float) -> None:
        if now - self._last_prune < 60:
            return
        expired = [key for key, hits in self._hits.items() if not hits or hits[-1] < now - 60]
        for key in expired:
            del self._hits[key]
        self._last_prune = now

    def allow(self, bucket: tuple[str, str], now: float | None = None) -> bool:
        now = now if now is not None else time.monotonic()
        self._prune(now)
        hits = self._hits.setdefault(bucket, deque())
        while hits and hits[0] <= now - 60:
            hits.popleft()
        if len(hits) >= self._limit:
            return False
        hits.append(now)
        return True


_limiter = _SlidingWindowRateLimiter(limit_per_minute=settings.rate_limit_per_minute)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(bucket_name: str) -> Callable[[Request], None]:
    """FastAPI dependency that rejects bursts beyond the per-minute limit."""

    def dependency(request: Request) -> None:
        if not settings.rate_limit_enabled:
            return
        key = (bucket_name, _client_ip(request))
        if not _limiter.allow(key):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please try again later.",
                headers={"Retry-After": "60"},
            )

    return dependency