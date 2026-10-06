import json
import logging
import secrets
from typing import Annotated, ClassVar
from urllib.parse import parse_qsl, quote_plus, urlencode, urlsplit, urlunsplit

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

logger = logging.getLogger(__name__)

# Publicly-known placeholder values that must never be used as JWT secrets.
_INSECURE_SECRET_PLACEHOLDERS = {"change-me-in-production", "your_generated_secret_key", "secret", "changeme"}
_MIN_SECRET_LENGTH = 32

# asyncpg is the only Postgres driver this project installs, and it does not
# accept the libpq-style query params that managed providers (Neon, Supabase,
# Railway) put in their connection strings. SQLAlchemy's asyncpg dialect
# forwards query params to asyncpg.connect() verbatim, so `sslmode=require` or
# `channel_binding=require` would raise TypeError on the first DB call. Rewrite
# them so a provider string can be pasted verbatim.
_ASYNCPG_SSLMODE_MAP = {
    "require": "require",
    "verify-ca": "require",
    "verify-full": "require",
    "prefer": "require",
    "allow": "disable",
    "disable": "disable",
}
_ASYNCPG_UNSUPPORTED_PARAMS = frozenset({"channel_binding"})


def normalize_postgres_url(url: str) -> str:
    """Make a managed-Postgres connection string safe for the asyncpg driver.

    - ``postgresql://`` -> ``postgresql+asyncpg://`` (psycopg2 isn't installed)
    - ``sslmode=...``    -> ``ssl=...``            (asyncpg's parameter name)
    - drops ``channel_binding=...``                 (asyncpg has no such option)
    """
    raw = (url or "").strip()
    if not raw:
        return ""

    parts = urlsplit(raw)
    scheme = parts.scheme.lower()
    if scheme in {"postgresql", "postgres"}:
        scheme = "postgresql+asyncpg"
    elif scheme != "postgresql+asyncpg":
        return raw  # not a Postgres URL — leave it alone

    pairs: list[tuple[str, str]] = []
    for key, value in parse_qsl(parts.query, keep_blank_values=True):
        lowered = key.lower()
        if lowered in _ASYNCPG_UNSUPPORTED_PARAMS:
            continue
        if lowered == "sslmode":
            pairs.append(("ssl", _ASYNCPG_SSLMODE_MAP.get(value.lower(), "require")))
        elif lowered == "ssl":
            pairs.append(("ssl", value))
        else:
            pairs.append((key, value))

    return urlunsplit(
        (scheme, parts.netloc, parts.path, urlencode(pairs), parts.fragment)
    )


class _Settings(BaseSettings):
    # ── App ──
    app_name: str = "Image Processing API"
    # NoDecode hands the raw env string to _split_origins below. Without it
    # pydantic-settings JSON-decodes every list field itself, so the
    # comma-separated form (`a,b`) raises a SettingsError before the validator
    # ever runs and the process refuses to boot.
    allowed_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    # Canonical frontend origin. The SPA sends this as the OAuth redirect_uri, so
    # it doubles as the allowlist for the code-exchange endpoint. Empty in dev:
    # the Vite dev server origins in allowed_origins cover it.
    frontend_url: str = ""
    # 2.5 GB is not servable on a free-tier instance — uploads are buffered in
    # memory before decoding, so large files OOM the process. Render overrides
    # this explicitly; the default is kept low enough to be safe anywhere.
    max_upload_size_mb: int = 25
    debug_openapi: bool = False  # set True in dev to expose OpenAPI docs

    # ── Rate limiting ──
    rate_limit_enabled: bool = True
    rate_limit_per_minute: int = 30

    # ── JWT ──
    secret_key: str = ""
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    @field_validator("secret_key", mode="before")
    @classmethod
    def _secure_secret_key(cls, value: object) -> str:
        raw = str(value or "")
        normalized = raw.strip()
        if normalized in _INSECURE_SECRET_PLACEHOLDERS or len(normalized) < _MIN_SECRET_LENGTH:
            generated = secrets.token_urlsafe(48)
            logger.critical(
                "Insecure or missing SECRET_KEY detected — generating a random one for this "
                "process. Set a strong SECRET_KEY (>= 32 chars) in server/.env for production; "
                "otherwise every restart invalidates all tokens."
            )
            return generated
        return normalized

    # ── PostgreSQL ──
    # Full connection string; if set, wins over the individual postgres_* fields.
    # Aliased to DATABASE_URL because that is the name every host and dashboard
    # (Render, Neon, Supabase, Railway) exposes, so a provider string pastes in
    # unchanged. populate_by_name keeps the field usable as a Python kwarg.
    database_url_override: str = Field(default="", validation_alias="DATABASE_URL")
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "image_processing_db"
    postgres_user: str = "postgres"
    postgres_password: str = ""
    # Neon/Render require SSL. "require" encrypts; "disable" allows insecure local dev.
    postgres_sslmode: str = "disable"

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        # Accept both JSON arrays and comma-separated env values.
        if isinstance(value, str):
            if value.strip().startswith("["):
                try:
                    return json.loads(value)
                except ValueError:
                    return []
            return [o.strip() for o in value.split(",") if o.strip()]
        return value

    # ── Google OAuth ──
    google_client_id: str = ""
    google_client_secret: str = ""

    # ── Storage ──
    storage_provider: str = "local"  # "local" | "s3" | "cloudinary"
    local_storage_dir: str = "data/uploads"
    s3_bucket: str = ""
    s3_endpoint_url: str = ""  # AWS default; set for R2/MinIO
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_region: str = "us-east-1"
    # Cloudinary — the production media store. Render's filesystem is ephemeral,
    # so anything written to local_storage_dir is lost on redeploy.
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""
    # Folder all uploads are nested under. Keeps this project's assets isolated
    # from anything else in the same Cloudinary account.
    cloudinary_folder: str = "image-processing"
    # Cloudinary delivery type. "private" keeps assets unreadable without the
    # API secret, so the backend's per-user ownership checks stay meaningful;
    # "upload" makes every asset publicly readable by URL.
    cloudinary_delivery_type: str = "private"

    # ── Chunked Upload ──
    chunk_upload_dir: str = "data/chunks"
    chunk_size_mb: int = 10  # 10 MB chunks

    model_config: ClassVar[SettingsConfigDict] = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    @property
    def database_url(self) -> str:
        # A full DATABASE_URL override wins (easy for Neon/Render one-line paste).
        if self.database_url_override:
            return normalize_postgres_url(self.database_url_override)
        url = (
            f"postgresql+asyncpg://{quote_plus(self.postgres_user)}:"
            f"{quote_plus(self.postgres_password)}@{self.postgres_host}:"
            f"{self.postgres_port}/{self.postgres_db}"
        )
        if self.postgres_sslmode and self.postgres_sslmode != "disable":
            # `ssl`, not `sslmode` — see normalize_postgres_url.
            url += f"?ssl={self.postgres_sslmode}"
        return url

    @property
    def google_auth_configured(self) -> bool:
        # ID-token (Google Identity Services) verification only needs the client
        # ID — tokens are validated against Google's public keys with the
        # audience pinned to this client. The secret is reserved for a future
        # server-side code-exchange flow.
        return bool(self.google_client_id)

    @property
    def cloudinary_configured(self) -> bool:
        return bool(
            self.cloudinary_cloud_name and self.cloudinary_api_key and self.cloudinary_api_secret
        )

    @property
    def oauth_redirect_origins(self) -> set[str]:
        """Origins the OAuth code-exchange endpoint will accept a redirect_uri from.

        Derived from configuration instead of a hardcoded set so a deployed
        frontend (e.g. https://app.vercel.app) works without a code change.
        FRONTEND_URL wins when set; allowed_origins supplies the dev origins so
        local development keeps working alongside it.
        """
        origins = {origin.rstrip("/") for origin in self.allowed_origins}
        if self.frontend_url:
            origins.add(self.frontend_url.strip().rstrip("/"))
        return origins


def assert_safe_cors_origins(origins: list[str]) -> None:
    """Fail fast on a wildcard CORS origin.

    A credentialed wildcard policy silently reflects any Origin, which is a
    footgun even for a Bearer-token API. Kept as a pure function so it can be
    unit-tested without importing the whole app.
    """
    if "*" in origins:
        raise RuntimeError(
            "ALLOWED_ORIGINS must not contain '*' — it would create a credentialed "
            "wildcard CORS policy. List explicit origins instead."
        )


settings = _Settings()