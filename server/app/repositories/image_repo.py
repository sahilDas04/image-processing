import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.image import Image
from app.repositories.base import BaseRepository


class ImageRepository(BaseRepository[Image]):
    """Repository for image CRUD, scoped to a single user where relevant."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, Image)

    async def get_for_user(self, user_id: uuid.UUID, image_id: uuid.UUID) -> Image | None:
        stmt = select(Image).where(
            Image.user_id == user_id,
            Image.id == image_id,
            Image.deleted_at.is_(None),
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_checksum(self, *, user_id: uuid.UUID, checksum: str) -> Image | None:
        stmt = select(Image).where(
            Image.user_id == user_id,
            Image.checksum == checksum,
            Image.deleted_at.is_(None),
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_for_user(
        self,
        *,
        user_id: uuid.UUID,
        skip: int = 0,
        limit: int = 100,
        search: str | None = None,
    ) -> tuple[list[Image], int]:
        conditions = [Image.user_id == user_id, Image.deleted_at.is_(None)]
        if search:
            conditions.append(Image.original_name.ilike(f"%{search}%"))

        count_stmt = select(func.count()).select_from(Image).where(*conditions)
        total = (await self._session.execute(count_stmt)).scalar_one()

        stmt = (
            select(Image)
            .where(*conditions)
            .order_by(Image.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        rows = (await self._session.execute(stmt)).scalars().all()
        return list(rows), total
