import logging

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import assert_safe_cors_origins, settings
from app.core.exceptions import AppError, app_error_handler, unhandled_exception_handler, validation_error_handler
from app.core.logging import configure_logging
from app.db.session import engine
from app.middleware.security_headers import add_security_headers

logger = logging.getLogger(__name__)

configure_logging()

# Fail fast on a forged-JWT footgun: a wildcard CORS origin combined with
# allow_credentials silently reflects *any* Origin.
assert_safe_cors_origins(settings.allowed_origins)

app = FastAPI(
    title=settings.app_name,
    docs_url=None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.debug_openapi else None,
)

# Bearer-token auth needs no cookies, so credentials can stay off — this keeps
# CORS strict even if a misconfigured origin list is ever deployed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.middleware("http")(add_security_headers)

app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)


@app.on_event("startup")
async def startup() -> None:
    """Log startup and verify DB connectivity."""
    logger.info("Starting %s", settings.app_name)
    # Engine is lazy — a ping forces connection pool creation.
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("Database connection pool ready.")
    except Exception as exc:
        logger.warning("Database not reachable: %s", exc)
        logger.warning("The app will start, but DB-dependent features will fail.")


@app.on_event("shutdown")
async def shutdown() -> None:
    """Dispose of the DB engine pool."""
    logger.info("Shutting down.")
    await engine.dispose()


app.include_router(api_router)


@app.get("/")
def read_root():
    return {"message": "Image Processing API is running."}


@app.get("/health")
async def health_check():
    return {"status": "ok"}
