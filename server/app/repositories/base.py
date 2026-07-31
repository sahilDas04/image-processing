import uuid
from typing import Any, Generic, TypeVar

from sqlalchemy import select, update as sa_update, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import Base

T = TypeVar("T", bound=Base)


class BaseRepository(Generic[T]):
    """Generic async CRUD repository."""

    def __init__(self, session: AsyncSession, model: type[T]) -> None:
        self._session = session
        self._model = model

    async def create(self, **kwargs: Any) -> T:
        instance = self._model(**kwargs)
        self._session.add(instance)
        await self._session.flush()
        await self._session.refresh(instance)
        return instance

    async def get(self, id: uuid.UUID) -> T | None:
        return await self._session.get(self._model, id)

    async def update(self, id: uuid.UUID, **kwargs: Any) -> T | None:
        stmt = (
            sa_update(self._model)
            .where(self._model.id == id)
            .values(**kwargs)
            .returning(self._model)
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def delete(self, id: uuid.UUID) -> bool:
        stmt = sa_delete(self._model).where(self._model.id == id)
        result = await self._session.execute(stmt)
        return result.rowcount > 0

    async def list(
        self,
        *,
        skip: int = 0,
        limit: int = 100,
        order_by: Any | None = None,
        **filters: Any,
    ) -> list[T]:
        stmt = select(self._model)
        for attr, value in filters.items():
            column = getattr(self._model, attr, None)
            if column is not None:
                stmt = stmt.where(column == value)
        if order_by is not None:
            stmt = stmt.order_by(order_by)
        stmt = stmt.offset(skip).limit(limit)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())
