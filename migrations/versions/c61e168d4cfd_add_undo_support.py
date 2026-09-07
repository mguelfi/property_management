"""add undo support

Revision ID: c61e168d4cfd
Revises: 5498c2f83b05
Create Date: 2026-09-07 00:00:00.000000
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'c61e168d4cfd'
down_revision: str | None = '5498c2f83b05'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('audit_events', sa.Column('undone_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('audit_events', sa.Column('undone_by_actor_id', sa.Integer(), nullable=True))

    op.add_column(
        'res_reservation_rooms',
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
    )
    op.add_column(
        'res_reservation_rooms',
        sa.Column(
            'updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
    )
    op.add_column(
        'fd_room_assignment_log',
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
    )
    op.add_column(
        'fd_room_assignment_log',
        sa.Column(
            'updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
    )
    op.alter_column('res_reservation_rooms', 'created_at', server_default=None)
    op.alter_column('res_reservation_rooms', 'updated_at', server_default=None)
    op.alter_column('fd_room_assignment_log', 'created_at', server_default=None)
    op.alter_column('fd_room_assignment_log', 'updated_at', server_default=None)


def downgrade() -> None:
    op.drop_column('fd_room_assignment_log', 'updated_at')
    op.drop_column('fd_room_assignment_log', 'created_at')
    op.drop_column('res_reservation_rooms', 'updated_at')
    op.drop_column('res_reservation_rooms', 'created_at')
    op.drop_column('audit_events', 'undone_by_actor_id')
    op.drop_column('audit_events', 'undone_at')
