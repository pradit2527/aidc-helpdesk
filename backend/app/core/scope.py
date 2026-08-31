"""ขอบเขตการมองเห็นข้อมูลของผู้เรียก 1 request

นี่คือหัวใจความปลอดภัยของระบบทั้งหมด — TR-01 จัด "ข้อมูลรั่วข้ามบริษัท"
เป็นความเสี่ยงสูงสุดที่ย้อนกลับไม่ได้

หลักการ: ทำให้ "การเขียน query ที่ลืมใส่ scope" เป็นเรื่องที่ทำได้ยากในเชิงโครงสร้าง
ไม่ใช่เรื่องที่ต้องอาศัยวินัยของคนเขียน (docs/10-backend-architecture.md §6)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from app.core.constants import ContactKey
from app.core.errors import err


@dataclass(frozen=True)
class AccessScope:
    """immutable โดยเจตนา — ไม่มีใครแก้ขอบเขตกลางทางได้"""

    user_id: int
    home_company_id: int
    #: ผลรวมของ user_role_scope ทุก role ที่ยังไม่หมดอายุ · ว่าง = {home_company_id}
    company_ids: frozenset[int]
    permissions: frozenset[str]
    is_super_admin: bool
    #: ตำแหน่งในองค์กรที่ผู้ใช้คนนี้ถืออยู่ (head_of_it / ceo / dpo / ...)
    contact_keys: frozenset[str] = frozenset()

    # ── permission ──

    def has(self, *codes: str) -> bool:
        return self.is_super_admin or any(c in self.permissions for c in codes)

    def require(self, *codes: str) -> None:
        if not self.has(*codes):
            raise err("FORBIDDEN")

    # ── ขอบเขตบริษัท ──

    def in_scope(self, company_id: int) -> bool:
        return self.is_super_admin or company_id in self.company_ids

    def visible_company_ids(self, requested: Sequence[int] | None) -> frozenset[int]:
        """ตัด company_id ที่อยู่นอกขอบเขตทิ้งเงียบ ๆ

        ตอบ 200 พร้อมผลลัพธ์ว่าง ไม่ใช่ 403 — เพื่อไม่ให้ผู้เรียกเดาได้ว่า
        บริษัทนั้นมีอยู่จริงหรือมีข้อมูลเท่าไร (US-07 AC-2)
        """
        if self.is_super_admin:
            return frozenset(requested) if requested else frozenset()
        if not requested:
            return self.company_ids
        return self.company_ids & frozenset(requested)

    # ── เหตุความปลอดภัย: ข้อยกเว้นเดียวที่แคบกว่าขอบเขตบริษัท ──

    def can_see_security_incident(
        self,
        *,
        requester_id: int,
        assignee_id: int | None,
        incident_commander_id: int | None,
    ) -> bool:
        """SOP-10 ข้อ 2 บังคับให้จำกัดการมองเห็นเฉพาะผู้เกี่ยวข้อง

        company_admin และ agent คนอื่นในบริษัทเดียวกัน **ไม่เห็น**
        เป็นข้อยกเว้นเดียวในระบบที่แคบกว่าขอบเขตบริษัท
        """
        if self.is_super_admin:
            return True
        if self.user_id in {requester_id, assignee_id, incident_commander_id}:
            return True
        return bool(
            self.contact_keys
            & {ContactKey.HEAD_OF_IT.value, ContactKey.CEO.value, ContactKey.DPO.value}
        )
