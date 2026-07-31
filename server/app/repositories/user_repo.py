from sqlalchemy import select

from app.db.models.user import User
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    """Repository for user CRUD + auth-specific lookups."""

    def __init__(self, session: object) -> None:
        super().__init__(session, User)

    async def get_by_google_sub(self, google_sub: str) -> User | None:
        stmt = select(User).where(User.google_sub == google_sub)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        stmt = select(User).where(User.email == email)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_from_google(
        self,
        *,
        google_sub: str,
        email: str,
        name: str,
        avatar_url: str,
    ) -> User:
        return await self.create(
            google_sub=google_sub,
            email=email,
            name=name,
            avatar_url=avatar_url,
        )
