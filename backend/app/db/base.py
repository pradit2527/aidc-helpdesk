"""ฐานของ ORM ทั้งหมด — naming convention + mixin ที่ใช้ซ้ำ

naming convention สำคัญกว่าที่คิด: ถ้าไม่ตั้ง Alembic จะสร้างชื่อ constraint
แบบสุ่มตามฐานข้อมูล ทำให้ autogenerate diff มั่วและ downgrade เขียนไม่ได้ (NFR-25)
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, MetaData, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def pk() -> Mapped[int]:
    """Primary key มาตรฐาน — BIGSERIAL ทุกตาราง (02-data-model.md §1)"""
    return mapped_column(BigInteger, primary_key=True, autoincrement=True)


def fk_col(target: str, *, nullable: bool = True, ondelete: str | None = None) -> Mapped[int | None]:
    return mapped_column(
        BigInteger, ForeignKey(target, ondelete=ondelete), nullable=nullable, index=True
    )


class TimestampMixin:
    """created_at / updated_at มีทุกตารางตามหลักการออกแบบ"""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SoftDeleteMixin:
    """ใช้เฉพาะ ticket · kb_article · app_user · attachment (FR-73)"""

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
