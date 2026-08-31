"""Query ของ ticket — ทุกเส้นทางผ่าน _apply_scope() เสมอ

กฎการมองเห็นตาม docs/02-data-model.md v2.0 §7
"""

from __future__ import annotations

from typing import Sequence

from sqlalchemy import Select, and_, or_, select

from app.core.constants import ContactKey
from app.models.ticket import Ticket
from app.repositories.base import ScopedRepository


class TicketRepository(ScopedRepository):
    def _apply_scope(self, stmt: Select) -> Select:
        """เติมเงื่อนไขขอบเขตให้ทุก query โดยอัตโนมัติ

        สองชั้น:
        1. ขอบเขตปกติ — end_user เห็นเฉพาะเรื่องของตน · role อื่นเห็นตามบริษัท
        2. เหตุความปลอดภัย — แคบกว่าชั้นแรก เห็นเฉพาะผู้เกี่ยวข้อง (SOP-10 ข้อ 2)
        """
        s = self.scope
        if s.is_super_admin:
            return stmt

        # ── ชั้นที่ 1: ขอบเขตปกติ ──
        if s.has("ticket.read"):
            # agent / company_admin / manager_viewer -> ตามขอบเขตบริษัท
            base = Ticket.company_id.in_(s.company_ids)
        else:
            # end_user -> เฉพาะเรื่องที่ตนแจ้งหรือถูกระบุเป็นผู้ร้องขอ
            base = or_(Ticket.requester_id == s.user_id, Ticket.created_by == s.user_id)

        # ── ชั้นที่ 2: เหตุความปลอดภัยจำกัดแคบกว่า ──
        # ผู้ที่ถือตำแหน่ง head_of_it / ceo / dpo เห็นได้ทุกใบในขอบเขตของตน
        privileged = bool(
            s.contact_keys
            & {ContactKey.HEAD_OF_IT.value, ContactKey.CEO.value, ContactKey.DPO.value}
        )
        if privileged:
            return stmt.where(base)

        security_ok = or_(
            Ticket.is_security_incident.is_(False),
            Ticket.requester_id == s.user_id,
            Ticket.assignee_id == s.user_id,
            Ticket.incident_commander_id == s.user_id,
        )
        return stmt.where(and_(base, security_ok))

    def _base_stmt(self) -> Select:
        return self._apply_scope(select(Ticket).where(Ticket.deleted_at.is_(None)))

    async def get(self, ticket_id: int) -> Ticket | None:
        """คืน None เมื่อไม่พบ **หรือ** อยู่นอกขอบเขต

        ชั้น service แปลงเป็น 404 เหมือนกันทั้งสองกรณี เพื่อไม่ยืนยันว่า id นี้มีอยู่จริง
        """
        stmt = self._base_stmt().where(Ticket.id == ticket_id)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def list(
        self,
        *,
        company_ids: Sequence[int] | None = None,
        statuses: Sequence[str] | None = None,
        priorities: Sequence[str] | None = None,
        ticket_types: Sequence[str] | None = None,
        assignee_id: int | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Sequence[Ticket]:
        stmt = self._base_stmt()

        # company_id ที่อยู่นอกขอบเขตถูกตัดทิ้งเงียบ ๆ ไม่ตอบ error (US-07 AC-2)
        allowed = self.scope.visible_company_ids(company_ids)
        if allowed:
            stmt = stmt.where(Ticket.company_id.in_(allowed))

        if statuses:
            stmt = stmt.where(Ticket.status.in_(statuses))
        if priorities:
            stmt = stmt.where(Ticket.priority.in_(priorities))
        if ticket_types:
            stmt = stmt.where(Ticket.ticket_type.in_(ticket_types))
        if assignee_id is not None:
            stmt = stmt.where(Ticket.assignee_id == assignee_id)

        stmt = stmt.order_by(Ticket.created_at.desc()).limit(limit).offset(offset)
        return (await self.db.execute(stmt)).scalars().all()
