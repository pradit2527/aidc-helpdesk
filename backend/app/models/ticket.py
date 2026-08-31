"""Ticket แกนกลาง — 5 ตาราง

ตรงกับ docs/02-data-model.md v2.0 §2.2, §3, §5.1
คอลัมน์ของ ticket จัดกลุ่มตามหัวข้อในเอกสารเพื่อให้อ่านตามกันได้
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    CHAR,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.constants import (
    Channel,
    Impact,
    PendingReason,
    Priority,
    SlaExclusionCode,
    SourceDevice,
    TicketStatus,
    TicketType,
    Urgency,
    values,
)
from app.db.base import Base, SoftDeleteMixin, TimestampMixin


class TicketCategory(Base, TimestampMixin):
    __tablename__ = "ticket_category"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    # null = หมวดหมู่ใช้ร่วมทั้งกลุ่ม
    company_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("company.id"), index=True)
    parent_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("ticket_category.id"))
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name_th: Mapped[str] = mapped_column(String(150), nullable=False)

    # v1.0 เคยมี default_priority — ถูกแทนด้วยสองคอลัมน์นี้
    # เพราะระบบคำนวณ priority เอง การเก็บ default_priority ไว้จะขัดกันเอง (G-02)
    default_impact: Mapped[str] = mapped_column(
        String(20), default=Impact.INDIVIDUAL.value, nullable=False
    )
    default_urgency: Mapped[str] = mapped_column(
        String(20), default=Urgency.MEDIUM.value, nullable=False
    )
    default_assignee_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("app_user.id"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class TicketSequence(Base):
    """ออกเลข ticket แบบไม่ชนกัน (B-03)

    ใช้ SELECT ... FOR UPDATE ในทรานแซกชันเดียวกับการ insert ticket
    ห้ามใช้ COUNT(*)+1 เด็ดขาด — race condition ที่ 200 request พร้อมกันจะเลขซ้ำ
    """

    __tablename__ = "ticket_sequence"

    company_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("company.id"), primary_key=True
    )
    period: Mapped[str] = mapped_column(CHAR(6), primary_key=True)  # yyyymm
    last_no: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Ticket(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "ticket"
    __table_args__ = (
        CheckConstraint(f"ticket_type IN {tuple(values(TicketType))}", name="ticket_type_valid"),
        CheckConstraint(f"status IN {tuple(values(TicketStatus))}", name="status_valid"),
        CheckConstraint(f"priority IN {tuple(values(Priority))}", name="priority_valid"),
        CheckConstraint(f"impact IN {tuple(values(Impact))}", name="impact_valid"),
        CheckConstraint(f"urgency IN {tuple(values(Urgency))}", name="urgency_valid"),
        CheckConstraint(f"channel IN {tuple(values(Channel))}", name="channel_valid"),
        CheckConstraint(
            f"pending_reason IS NULL OR pending_reason IN {tuple(values(PendingReason))}",
            name="pending_reason_valid",
        ),
        CheckConstraint(
            f"sla_exclusion_code IS NULL OR sla_exclusion_code IN {tuple(values(SlaExclusionCode))}",
            name="sla_exclusion_valid",
        ),
        CheckConstraint("support_tier BETWEEN 1 AND 3", name="support_tier_range"),
        # บังคับที่ระดับฐานข้อมูล: อยู่ pending_user ต้องระบุเหตุผลเสมอ (G-06)
        CheckConstraint(
            "status <> 'pending_user' OR pending_reason IS NOT NULL",
            name="pending_needs_reason",
        ),
        # คำขอบริการต้องผูกกับรายการใน catalog เพื่อให้รู้เป้าหมายเวลา (G-14)
        CheckConstraint(
            "ticket_type <> 'service_request' OR catalog_item_id IS NOT NULL",
            name="service_request_needs_catalog",
        ),
        Index("ix_ticket_company_status", "company_id", "status", text("created_at DESC")),
        Index("ix_ticket_assignee_status", "assignee_id", "status"),
        Index("ix_ticket_requester", "requester_id", text("created_at DESC")),
        Index(
            "ix_ticket_due",
            "resolution_due_at",
            postgresql_where=text("status NOT IN ('resolved','closed','cancelled')"),
        ),
        Index(
            "ix_ticket_status_report",
            "next_status_report_due_at",
            postgresql_where=text("next_status_report_due_at IS NOT NULL"),
        ),
        Index(
            "ix_ticket_tier",
            "support_tier",
            "created_at",
            postgresql_where=text("status NOT IN ('resolved','closed','cancelled')"),
        ),
        Index("ix_ticket_problem", "problem_id", text("created_at DESC")),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ticket_no: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)

    # ── ข้อมูลพื้นฐาน ──
    ticket_type: Mapped[str] = mapped_column(
        String(20), default=TicketType.INCIDENT.value, nullable=False
    )
    company_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("company.id"), nullable=False)
    department_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("department.id"))
    category_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ticket_category.id"), nullable=False
    )
    catalog_item_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("service_catalog_item.id")
    )
    service_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("service.id"))
    problem_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("problem.id"))

    requester_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("app_user.id"), nullable=False)
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("app_user.id"), nullable=False)
    assignee_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("app_user.id"))

    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    # 4 ช่องทางตามเอกสารควบคุม — ไม่มี LINE (G-15)
    channel: Mapped[str] = mapped_column(
        String(20), default=Channel.PORTAL.value, nullable=False
    )
    # ข้อมูลเชิงเทคนิค แยกจากช่องทางตามเอกสาร
    source_device: Mapped[str | None] = mapped_column(String(20))
    # ใช้กับ channel='phone' เพื่อรายงานเป้า "รับสายภายใน 3 นาที"
    call_answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # สะพานชั่วคราวก่อนมี Asset module (นโยบาย 3.9)
    asset_tag: Mapped[str | None] = mapped_column(String(50))

    # ── ระดับความสำคัญ ──
    impact: Mapped[str] = mapped_column(
        String(20), default=Impact.INDIVIDUAL.value, nullable=False
    )
    urgency: Mapped[str] = mapped_column(
        String(20), default=Urgency.MEDIUM.value, nullable=False
    )
    # ระบบคำนวณจาก impact x urgency — ผู้แจ้งส่งมาโดยตรงไม่ได้ (SLA ข้อ 4)
    priority: Mapped[str] = mapped_column(
        String(10), default=Priority.P3.value, nullable=False
    )
    # จุดเริ่มนับ SLA ใหม่เมื่อมีการปรับระดับ — ไม่ใช่ created_at (G-08)
    priority_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    priority_review_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    priority_review_reason: Mapped[str | None] = mapped_column(String(500))

    # ── สถานะและการหยุดนับเวลา ──
    status: Mapped[str] = mapped_column(
        String(20), default=TicketStatus.NEW.value, nullable=False
    )
    pending_reason: Mapped[str | None] = mapped_column(String(20))
    pending_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # บังคับสำหรับ reason='vendor' — ต้องแจ้งผู้รับบริการก่อนจึงหยุดนับเวลาได้ (SLA 5.4)
    pending_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pending_duration_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ต้องส่งติดตามครบ 2 ครั้งก่อน จึงเริ่มนับ 3 วันทำการเพื่อปิดอัตโนมัติได้ (G-09)
    followup_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_followup_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    support_tier: Mapped[int] = mapped_column(SmallInteger, default=1, nullable=False)
    tier_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    vendor_ref: Mapped[str | None] = mapped_column(String(100))
    # counter สำหรับ KPI-3 (FCR) — นับจาก history ทุกครั้งช้าเกินไป
    assignee_change_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ── SLA ──
    sla_policy_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("sla_policy.id"))
    # จุดเริ่มนับจริง ต่างจาก created_at สำหรับคำขอที่ต้องอนุมัติก่อน (SLA 5.3)
    sla_clock_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    response_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # คอมเมนต์สาธารณะครั้งแรกจาก agent — การ assign ไม่นับ (SLA 5.1)
    first_response_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # ใช้กับคำขอเชิงวันที่ (onboarding / offboarding)
    target_date: Mapped[date | None] = mapped_column(Date)
    next_status_report_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # หยุดนับ resolution ของ incident ทันที และบังคับผูก problem (SLA 5.4)
    workaround_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    workaround_note: Mapped[str | None] = mapped_column(Text)

    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution_note: Mapped[str | None] = mapped_column(Text)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # null พร้อมกับ closed_at ไม่ null = ระบบปิดอัตโนมัติ
    closed_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("app_user.id"))

    is_response_breached: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_resolution_breached: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    escalation_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # ข้อยกเว้นตาม SLA ข้อ 9 — ตัดออกจากตัวหาร KPI และไม่ตั้งธง breach
    sla_exclusion_code: Mapped[str | None] = mapped_column(String(30))
    sla_exclusion_note: Mapped[str | None] = mapped_column(String(500))

    reopen_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # ticket <-> kb_article อ้างถึงกันสองทาง (ticket แก้ด้วยบทความใด / บทความมาจาก ticket ใด)
    # use_alter บอกให้สร้าง FK นี้หลังสร้างตารางครบแล้ว มิฉะนั้น CREATE TABLE จะวนไม่จบ
    resolved_by_kb_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("kb_article.id", use_alter=True, name="fk_ticket_resolved_by_kb")
    )

    # ── เหตุร้ายแรงและความปลอดภัย ──
    is_major_incident: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    incident_commander_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("app_user.id"))
    # ticket ที่ตั้งธงนี้ใช้ขอบเขตการมองเห็นแคบกว่าบริษัทปกติ (SOP-10 ข้อ 2)
    is_security_incident: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    personal_data_affected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    dpo_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # = เวลาที่ประเมินว่ากระทบข้อมูลส่วนบุคคล + 72 ชม. (PDPA)
    regulator_notify_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # offboarding กรณีเลิกจ้างฉับพลัน (SOP-05)
    is_immediate_suspend: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    restore_point_date: Mapped[date | None] = mapped_column(Date)

    # ── CSAT ──
    satisfaction_score: Mapped[int | None] = mapped_column(SmallInteger)
    # จำเป็นต่อการรายงาน Response Rate ที่ SLA ภาคผนวก ก.3 บังคับให้รายงานคู่กับ CSAT
    csat_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    csat_responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    comments: Mapped[list["TicketComment"]] = relationship(back_populates="ticket")
    history: Mapped[list["TicketStatusHistory"]] = relationship(back_populates="ticket")


class TicketStatusHistory(Base):
    """ทุกการเปลี่ยนสถานะและระดับต้องบันทึกที่นี่เสมอ — เป็นหลักฐานตาม SOP"""

    __tablename__ = "ticket_status_history"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ticket.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20), nullable=False)
    from_assignee_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("app_user.id"))
    to_assignee_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("app_user.id"))
    from_priority: Mapped[str | None] = mapped_column(String(10))
    to_priority: Mapped[str | None] = mapped_column(String(10))
    from_tier: Mapped[int | None] = mapped_column(SmallInteger)
    to_tier: Mapped[int | None] = mapped_column(SmallInteger)
    # บังคับกรณี cancel / reopen / เปลี่ยนระดับ / ยกระดับ tier
    reason: Mapped[str | None] = mapped_column(String(500))
    changed_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("app_user.id"))
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    ticket: Mapped[Ticket] = relationship(back_populates="history")


class TicketComment(Base, TimestampMixin):
    __tablename__ = "ticket_comment"
    __table_args__ = (Index("ix_comment_ticket_created", "ticket_id", "created_at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ticket.id", ondelete="CASCADE"), nullable=False
    )
    author_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("app_user.id"))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # true = เห็นเฉพาะ agent ขึ้นไป — ต้องไม่ถูกส่งใน API response ของผู้แจ้งตั้งแต่แรก
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    ticket: Mapped[Ticket] = relationship(back_populates="comments")
