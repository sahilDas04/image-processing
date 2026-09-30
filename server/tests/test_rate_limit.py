"""Security tests for the in-process rate limiter."""

from app.core.rate_limit import _SlidingWindowRateLimiter


def test_sliding_window_blocks_bursts():
    limiter = _SlidingWindowRateLimiter(limit_per_minute=3)
    bucket = ("auth-login", "1.2.3.4")
    now = 1_000.0

    assert limiter.allow(bucket, now) is True
    assert limiter.allow(bucket, now) is True
    assert limiter.allow(bucket, now) is True
    assert limiter.allow(bucket, now) is False  # 4th hit within the window


def test_per_ip_isolation():
    limiter = _SlidingWindowRateLimiter(limit_per_minute=1)
    now = 1_000.0

    assert limiter.allow(("auth-login", "1.1.1.1"), now) is True
    assert limiter.allow(("auth-login", "1.1.1.1"), now) is False
    # A different IP is still allowed.
    assert limiter.allow(("auth-login", "2.2.2.2"), now) is True


def test_window_expiry_reallows():
    limiter = _SlidingWindowRateLimiter(limit_per_minute=1)
    bucket = ("auth-login", "3.3.3.3")

    assert limiter.allow(bucket, 1_000.0) is True
    assert limiter.allow(bucket, 1_000.0) is False
    # 61 seconds later the bucket has expired.
    assert limiter.allow(bucket, 1_061.0) is True


def test_dependency_returns_429(monkeypatch):
    from fastapi import HTTPException
    from starlette.requests import Request

    from app.core import rate_limit as rl_mod
    from app.core.rate_limit import rate_limit

    dependency = rate_limit("test-bucket")

    request = Request(
        {"type": "http", "method": "GET", "path": "/", "query_string": b"", "headers": [], "client": ("9.9.9.9", 12345)}
    )

    monkeypatch.setattr(rl_mod, "_limiter", _SlidingWindowRateLimiter(limit_per_minute=1))

    dependency(request)  # first pass
    try:
        dependency(request)  # second should 429
        assert False, "expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 429
        assert exc.headers.get("Retry-After") == "60"