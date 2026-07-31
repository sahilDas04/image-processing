import logging
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.core.google_auth import verify_google_token
from app.core.security import create_access_token
from app.db.models.user import User
from app.repositories.user_repo import UserRepository

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


# ── Schemas ──


class GoogleLoginRequest(BaseModel):
    token: str


class GoogleCodeExchangeRequest(BaseModel):
    code: str
    code_verifier: str
    redirect_uri: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserResponse(BaseModel):
    id: str
    email: str
    name: str | None
    avatar_url: str | None


class MessageResponse(BaseModel):
    message: str


# ── Constants ──

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

# Redirect URIs the OAuth client is allowed to return to. The frontend must
# send exactly the registered URI; Google enforces the exact match server-side
# (only the origin is pre-checked here as a guard).
ALLOWED_REDIRECT_ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}


# ── Helpers ──


async def _get_or_create_user(session: AsyncSession, info: dict) -> User:
    """Look up a user by Google sub, creating the DB record on first login."""
    repo = UserRepository(session)
    user = await repo.get_by_google_sub(info["sub"])
    if user is None:
        user = await repo.create_from_google(
            google_sub=info["sub"],
            email=info["email"],
            name=info.get("name", ""),
            avatar_url=info.get("picture", ""),
        )
        logger.info("user_created google_sub=%s email=%s", info["sub"], info["email"])
    return user


# ── Routes ──


@router.post("/google", response_model=AuthResponse)
async def google_login(
    body: GoogleLoginRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """Exchange a Google OAuth credential token for a JWT."""

    try:
        info = await verify_google_token(body.token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    user = await _get_or_create_user(session, info)

    access_token = create_access_token(subject=str(user.id))

    logger.info(
        "user_login user_id=%s email=%s ip=%s",
        user.id, user.email, request.client.host if request.client else "?",
    )

    return AuthResponse(
        access_token=access_token,
        user={
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
        },
    )


@router.post("/google/code", response_model=AuthResponse)
async def google_code_login(
    body: GoogleCodeExchangeRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """Exchange a Google authorization code (server-side PKCE flow) for a JWT.

    The browser never sees the client secret: we swap the short-lived
    authorization code + code_verifier for tokens on the server. This flow
    only needs the *Authorized redirect URIs* to be registered — it does not
    depend on Google Identity Services or the "Authorized JavaScript origins"
    field.
    """

    if not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GOOGLE_CLIENT_SECRET is not configured.",
        )

    parsed = urlparse(body.redirect_uri)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    if origin not in ALLOWED_REDIRECT_ORIGINS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unregistered redirect_uri.",
        )

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "code": body.code,
                    "redirect_uri": body.redirect_uri,
                    "code_verifier": body.code_verifier,
                },
            )
    except httpx.HTTPError as exc:
        logger.error("google_token_exchange_network_error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach Google's token endpoint.",
        ) from exc

    if resp.status_code != 200:
        logger.error(
            "google_token_exchange_failed status=%s body=%s",
            resp.status_code, resp.text,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google token exchange failed. Please sign in again.",
        )

    id_token_str = resp.json().get("id_token")
    if not id_token_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google did not return an id_token.",
        )

    try:
        info = await verify_google_token(id_token_str)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    user = await _get_or_create_user(session, info)
    access_token = create_access_token(subject=str(user.id))

    logger.info(
        "user_login code_flow user_id=%s email=%s ip=%s",
        user.id, user.email, request.client.host if request.client else "?",
    )

    return AuthResponse(
        access_token=access_token,
        user={
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
        },
    )


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)) -> UserResponse:
    """Return the authenticated user's profile."""
    return UserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(user: User = Depends(get_current_user)) -> MessageResponse:
    """Log out.

    For now this is a no-op because we use self-contained JWTs.
    Future: add token to a Redis blacklist.
    """
    return MessageResponse(message="Logged out.")
