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


def test_database_url_omits_sslmode_when_disabled():
    cfg = _make_settings(
        secret_key="A" * 64,
        postgres_user="user name",
        postgres_password="p@ss:word/456",
        postgres_host="db.example.com",
        postgres_port=5432,
        postgres_db="appdb",
        postgres_sslmode="disable",
    )
    url = cfg.database_url
    assert url.startswith("postgresql+asyncpg://user+name:p%40ss%3Aword%2F456@db.example.com:5432/appdb")
    assert "sslmode" not in url


def test_database_url_appends_ssl_when_required():
    cfg = _make_settings(
        secret_key="A" * 64,
        postgres_user="postgres",
        postgres_password="secret",
        postgres_host="ep-foo.aws.neon.tech",
        postgres_port=5432,
        postgres_db="appdb",
        postgres_sslmode="require",
    )
    # asyncpg's parameter is `ssl`; `sslmode` would be forwarded verbatim by
    # SQLAlchemy and rejected by asyncpg.connect().
    assert cfg.database_url.endswith("?ssl=require")


def test_database_url_override_wins():
    cfg = _make_settings(
        secret_key="A" * 64,
        database_url_override="postgresql+asyncpg://u:p@neon.example.com/db?ssl=require",
        postgres_host="localhost",
    )
    assert cfg.database_url == "postgresql+asyncpg://u:p@neon.example.com/db?ssl=require"


def test_neon_pooler_string_is_rewritten_for_asyncpg():
    """A Neon console string must work without hand-editing.

    Neon hands out `postgresql://...?sslmode=require&channel_binding=require`.
    Only asyncpg is installed, and it rejects both `sslmode` and
    `channel_binding`, so the raw string would fail on first connect.
    """
    cfg = _make_settings(
        secret_key="A" * 64,
        database_url_override=(
            "postgresql://neondb_owner:pw@ep-foo-pooler.us-east-2.aws.neon.tech"
            "/neondb?sslmode=require&channel_binding=require"
        ),
    )
    url = cfg.database_url
    assert url == (
        "postgresql+asyncpg://neondb_owner:pw@ep-foo-pooler.us-east-2.aws.neon.tech"
        "/neondb?ssl=require"
    )
    assert "sslmode" not in url
    assert "channel_binding" not in url


def test_connection_string_params_reach_asyncpg_intact():
    """Every query param must be one asyncpg.connect() actually accepts."""
    import asyncpg
    import inspect

    from sqlalchemy.engine.url import make_url
    from sqlalchemy.dialects.postgresql import asyncpg as asyncpg_dialect

    accepted = set(inspect.signature(asyncpg.connect).parameters)
    cfg = _make_settings(
        secret_key="A" * 64,
        database_url_override=(
            "postgresql://neondb_owner:pw@ep-foo.us-east-2.aws.neon.tech/neondb"
            "?sslmode=require&channel_binding=require&statement_cache_size=0"
        ),
    )
    _, connect_kwargs = asyncpg_dialect.dialect().create_connect_args(
        make_url(cfg.database_url)
    )
    assert "sslmode" not in connect_kwargs
    assert "channel_binding" not in connect_kwargs
    # Nothing unrecognised is smuggled through to the driver.
    unsupported = set(connect_kwargs) - accepted
    assert not unsupported, f"asyncpg.connect() rejects: {sorted(unsupported)}"


def test_non_postgres_url_is_left_untouched():
    cfg = _make_settings(
        secret_key="A" * 64,
        database_url_override="mysql://user:pw@localhost:3306/db",
    )
    assert cfg.database_url == "mysql://user:pw@localhost:3306/db"


def test_database_url_env_var_is_honoured():
    """`DATABASE_URL` is the name Render/Neon expose, so it must be read."""
    cfg = _make_settings(
        secret_key="A" * 64,
        postgres_host="localhost",
        DATABASE_URL="postgresql://u:p@neon.example.com/db?sslmode=require",
    )
    assert cfg.database_url == "postgresql+asyncpg://u:p@neon.example.com/db?ssl=require"


def test_allowed_origins_accepts_comma_separated_values():
    cfg = _make_settings(
        secret_key="A" * 64,
        allowed_origins="https://app.vercel.app, https://api.onrender.com",
    )
    assert cfg.allowed_origins == ["https://app.vercel.app", "https://api.onrender.com"]


def test_allowed_origins_accepts_json_array():
    cfg = _make_settings(
        secret_key="A" * 64,
        allowed_origins='["https://app.vercel.app", "https://api.onrender.com"]',
    )
    assert cfg.allowed_origins == ["https://app.vercel.app", "https://api.onrender.com"]


def datetime_plus_minutes(minutes: int):
    from datetime import datetime, timedelta, timezone

    return datetime.now(timezone.utc) + timedelta(minutes=minutes)