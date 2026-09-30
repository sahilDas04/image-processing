"""make jobs.image_id and variants.image_id nullable

Revision ID: a2c4f7d8e901
Revises: 1eafb0ebc32e
Create Date: 2026-09-30 12:00:00.000000

Job/Variant rows may be created for live processing (process/to-pdf) where
there is no persistent Image row yet, so the FK must be optional.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a2c4f7d8e901'
down_revision: Union[str, None] = '1eafb0ebc32e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('jobs', 'image_id', existing_type=sa.UUID(), nullable=True)
    op.alter_column('variants', 'image_id', existing_type=sa.UUID(), nullable=True)


def downgrade() -> None:
    op.alter_column('variants', 'image_id', existing_type=sa.UUID(), nullable=False)
    op.alter_column('jobs', 'image_id', existing_type=sa.UUID(), nullable=False)