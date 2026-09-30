"""Security tests for JWT secret handling."""

from datetime import timedelta

import pytest
from jose import JWTError, jwt

from app.core.config import _MIN_SECRET_LENGTH, _Settings


def _make_settings(**overrides) -> _Settings:
    return _Settings(_env_file=None, **overrides)


def test_known_placeholder_secret_is_replaced():
    cfg = _make_settings(secret_key="change-me-in-production")
    assert len(cfg.secret_key) >= _MIN_SECRET_LENGTH
    assert cfg.secret_key != "change-me-in-production"


def test_short_secret_is_replaced():
    cfg = _make_settings(secret_key="short")
    assert len(cfg.secret_key) >= _MIN_SECRET_LENGTH
    assert cfg.secret_key != "short"


def test_empty_secret_is_replaced():
    cfg = _make_settings(secret_key="")
    assert len(cfg.secret_key) >= _MIN_SECRET_LENGTH


def test_strong_secret_is_preserved():
    strong = "A" * 64
    cfg = _make_settings(secret_key=strong)
    assert cfg.secret_key == strong


def test_token_decodes_only_with_its_own_secret():
    cfg = _make_settings(secret_key="development-secret-that-is-very-long-1")
    payload = {"sub": "user-1", "exp": datetime_plus_minutes(5)}
    token = jwt.encode(payload, cfg.secret_key, algorithm="HS256")

    decoded = jwt.decode(token, cfg.secret_key, algorithms=["HS256"])
    assert decoded["sub"] == "user-1"

    with pytest.raises(JWTError):
        jwt.decode(token, "attacker-controlled-secret", algorithms=["HS256"])


def test_placeholder_secret_cannot_decode_real_tokens():
    """A forged token signed with the *publicly known* default must be rejected."""
    cfg = _make_settings(secret_key="a-strong-unique-secret-that-is-long-enough")
    forged = jwt.encode(
        {"sub": "victim", "exp": datetime_plus_minutes(5)},
        "change-me-in-production",
        algorithm="HS256",
    )
    with pytest.raises(JWTError):
        jwt.decode(forged, cfg.secret_key, algorithms=["HS256"])


def datetime_plus_minutes(minutes: int):
    from datetime import datetime, timedelta, timezone

    return datetime.now(timezone.utc) + timedelta(minutes=minutes)