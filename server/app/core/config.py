import json
import logging
import secrets
from typing import ClassVar
from urllib.parse import quote_plus

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

# Publicly-known placeholder values that must never be used as JWT secrets.
_INSECURE_SECRET_PLACEHOLDERS = {"change-me-in-production", "your_generated_secret_key", "secret", "changeme"}
_MIN_SECRET_LENGTH = 32


class _Settings(BaseSettings):
    # ── App ──
    app_name: str = "Image Processing API"
    allowed_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    max_upload_size_mb: int = 2560  # 2.5 GB
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
    database_url_override: str = ""
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
    storage_provider: str = "local"  # "local" | "s3"
    local_storage_dir: str = "data/uploads"
    s3_bucket: str = ""
    s3_endpoint_url: str = ""  # AWS default; set for R2/MinIO
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_region: str = "us-east-1"

    # ── Chunked Upload ──
    chunk_upload_dir: str = "data/chunks"
    chunk_size_mb: int = 10  # 10 MB chunks

    model_config: ClassVar[SettingsConfigDict] = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def database_url(self) -> str:
        # A full DATABASE_URL override wins (easy for Neon/Render one-line paste).
        if self.database_url_override:
            return self.database_url_override
        url = (
            f"postgresql+asyncpg://{quote_plus(self.postgres_user)}:"
            f"{quote_plus(self.postgres_password)}@{self.postgres_host}:"
            f"{self.postgres_port}/{self.postgres_db}"
        )
        if self.postgres_sslmode and self.postgres_sslmode != "disable":
            url += f"?sslmode={self.postgres_sslmode}"
        return url

    @property
    def google_auth_configured(self) -> bool:
        # ID-token (Google Identity Services) verification only needs the client
        # ID — tokens are validated against Google's public keys with the
        # audience pinned to this client. The secret is reserved for a future
        # server-side code-exchange flow.
        return bool(self.google_client_id)


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