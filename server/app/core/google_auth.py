from app.core.config import settings


async def verify_google_token(token: str) -> dict:
    """Verify a Google OAuth credential token and return user info.

    Returns a dict with keys: sub, email, name, picture.

    Raises ValueError if:
      - Google OAuth is not configured (no GOOGLE_CLIENT_ID).
      - The token is invalid or expired.
    """
    if not settings.google_auth_configured:
        raise ValueError(
            "Google OAuth is not configured. "
            "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env"
        )

    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token

        info = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            settings.google_client_id,
            clock_skew_in_seconds=10,
        )

        if info.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}:
            raise ValueError("Invalid token issuer.")

        return {
            "sub": info["sub"],
            "email": info.get("email", ""),
            "name": info.get("name", ""),
            "picture": info.get("picture", ""),
        }
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Google token verification failed: {exc}") from exc
