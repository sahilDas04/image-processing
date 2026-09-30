from collections.abc import Awaitable, Callable

from starlette.requests import Request
from starlette.responses import Response

# Reasonable default CSP for the API. The frontend is a separate Vite SPA and
# talks to this API over XHR, so only what the API itself needs is allowed.
# CSP is only meaningful over HTTPS; it is harmless in local dev.
CSP = (
    "default-src 'none'; "
    "base-uri 'none'; "
    "frame-ancestors 'none'; "
    "form-action 'none'; "
    "connect-src 'self'; "
    "img-src 'self' data:; "
    "media-src 'self' data:; "
)


async def add_security_headers(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    response.headers["Content-Security-Policy"] = CSP
    # Only advertise HSTS on HTTPS connections; a plain-HTTP response with this
    # header is ignored by browsers but adding it unconditionally is safe.
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response
