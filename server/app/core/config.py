from typing import ClassVar

from pydantic_settings import BaseSettings, SettingsConfigDict


class _Settings(BaseSettings):
    # ── App ──
    app_name: str = "Image Processing API"
    allowed_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    max_upload_size_mb: int = 10

    # ── JWT ──
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # ── PostgreSQL ──
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "image_processing_db"
    postgres_user: str = "postgres"
    postgres_password: str = ""

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

    model_config: ClassVar[SettingsConfigDict] = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def google_auth_configured(self) -> bool:
        # ID-token (Google Identity Services) verification only needs the client
        # ID — tokens are validated against Google's public keys with the
        # audience pinned to this client. The secret is reserved for a future
        # server-side code-exchange flow.
        return bool(self.google_client_id)


settings = _Settings()
