import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.job import Job
from app.db.models.variant import Variant


class JobRepository:
    """Persistence for processing history (Job + Variant rows)."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_job(
        self,
        *,
        user_id: uuid.UUID,
        operation: str,
        params: dict | None = None,
        image_id: uuid.UUID | None = None,
    ) -> Job:
        job = Job(
            user_id=user_id,
            image_id=image_id,
            operation=operation,
            params=params,
            status="completed",
        )
        self._session.add(job)
        await self._session.flush()
        await self._session.refresh(job)
        return job

    async def add_variant(
        self,
        *,
        job_id: uuid.UUID,
        operation: str,
        params: dict | None = None,
        storage_key: str,
        mime_type: str,
        size_bytes: int,
        width: int | None = None,
        height: int | None = None,
    ) -> Variant:
        variant = Variant(
            job_id=job_id,
            image_id=None,
            operation=operation,
            params=params,
            storage_key=storage_key,
            mime_type=mime_type,
            size_bytes=size_bytes,
            width=width,
            height=height,
        )
        self._session.add(variant)
        await self._session.flush()
        await self._session.refresh(variant)
        return variant

    async def list_for_user(
        self,
        *,
        user_id: uuid.UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[list[Job], int]:
        total_stmt = (
            select(func.count(Job.id))
            .select_from(Job)
            .where(Job.user_id == user_id)
        )
        total = (await self._session.execute(total_stmt)).scalar_one()

        stmt = (
            select(Job)
            .where(Job.user_id == user_id)
            .options(selectinload(Job.variants))
            .order_by(Job.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        rows = list((await self._session.execute(stmt)).scalars().unique())
        return rows, total

    async def get_for_user(self, *, user_id: uuid.UUID, job_id: uuid.UUID) -> Job | None:
        stmt = (
            select(Job)
            .where(Job.user_id == user_id, Job.id == job_id)
            .options(selectinload(Job.variants))
        )
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def delete_for_user(self, *, user_id: uuid.UUID, job_id: uuid.UUID) -> list[str] | None:
        """Soft-delete no-op aside: hard-delete a job (and its variants).

        Returns the variant storage keys that were removed so the caller can
        purge the bytes from storage, or ``None`` if the job does not belong to
        the user.
        """
        job = await self.get_for_user(user_id=user_id, job_id=job_id)
        if job is None:
            return None

        storage_keys = [variant.storage_key for variant in job.variants]
        await self._session.delete(job)
        await self._session.commit()
        return storage_keys