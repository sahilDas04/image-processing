"""Tests for OAuth redirect-origin allowlisting.

The code-exchange endpoint rejects any redirect_uri whose origin is not
configured. Regression guard: a hardcoded localhost-only allowlist made every
production login fail with 400 "Unregistered redirect_uri".
"""

from app.core.config import _Settings


def _make_settings(**overrides) -> _Settings:
    return _Settings(_env_file=None, **overrides)


def test_dev_origins_are_allowed_without_frontend_url():
    cfg = _make_settings(frontend_url="")
    origins = cfg.oauth_redirect_origins

    assert "http://localhost:5173" in origins
    assert "http://127.0.0.1:5173" in origins


def test_production_frontend_url_is_allowed():
    cfg = _make_settings(
        frontend_url="https://image-processing.vercel.app",
        allowed_origins=["https://image-processing.vercel.app"],
    )
    assert "https://image-processing.vercel.app" in cfg.oauth_redirect_origins


def test_production_and_dev_coexist():
    """Deploying with FRONTEND_URL set must not break local development."""
    cfg = _make_settings(frontend_url="https://image-processing.vercel.app")
    origins = cfg.oauth_redirect_origins

    assert "https://image-processing.vercel.app" in origins
    assert "http://localhost:5173" in origins


def test_foreign_origin_is_rejected():
    cfg = _make_settings(frontend_url="https://image-processing.vercel.app")
    assert "https://attacker.example" not in cfg.oauth_redirect_origins


def test_trailing_slash_does_not_break_the_match():
    """A FRONTEND_URL pasted with a trailing slash must still match the SPA origin."""
    cfg = _make_settings(frontend_url="https://image-processing.vercel.app/")
    assert "https://image-processing.vercel.app" in cfg.oauth_redirect_origins


def test_origin_from_urlparse_matches_the_allowlist():
    """Mirror the check the route performs: parse, then rebuild scheme://netloc."""
    from urllib.parse import urlparse

    cfg = _make_settings(frontend_url="https://image-processing.vercel.app")
    parsed = urlparse("https://image-processing.vercel.app")
    assert f"{parsed.scheme}://{parsed.netloc}" in cfg.oauth_redirect_origins