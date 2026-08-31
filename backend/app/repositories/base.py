"""ชั้นเดียวในระบบที่ประกอบ query — และเป็นชั้นเดียวที่บังคับ scope

เหตุผลที่ ScopedRepository ไม่มี constructor ที่ไม่รับ AccessScope:
การ "ลืมใส่ scope" จะกลายเป็น TypeError ตั้งแต่ตอนเขียนโค้ด
ไม่ใช่ช่องโหว่ที่ค้นพบตอน production (TR-01)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Select

from app.core.scope import AccessScope

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


class ScopedRepository:
    """repository ทุกตัวที่แตะตารางซึ่งมี company_id ต้องสืบทอดคลาสนี้"""

    def __init__(self, db: "AsyncSession", scope: AccessScope) -> None:
        self.db = db
        self.scope = scope

    def _apply_scope(self, stmt: Select) -> Select:  # pragma: no cover - abstract
        raise NotImplementedError(
            f"{type(self).__name__} ต้อง implement _apply_scope() "
            "มิฉะนั้น query จะไม่ถูกจำกัดขอบเขต"
        )
