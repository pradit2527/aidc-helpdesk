"""กระบวนการตาม SOP — catalog · การอนุมัติ · checklist · บัญชีซอฟต์แวร์ — 7 ตาราง

ตรงกับ docs/02-data-model.md v2.0 §2.4, §5.10–5.16
ทั้งหมดนี้ SOP-03/04/05/06 บังคับ ไม่ใช่ของที่เลือกทำได้
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.constants import (
    ApprovalStatus,
    ApproverType,
    ClockStartEvent,
    Priority,
    TargetMode,
    values,
)
from app.db.base import Base, TimestampMixin


class ServiceCatalogItem(Base, TimestampMixin):
    """เป้าหมายเวลารายรายการของคำขอบริการ (SLA 5.3)

    เหตุผลที่ต้องมีตารางนี้: รีเซ็ตรหัสผ่านมีเป้า 30 นาทีทำการ ขณะที่ P4 คือ
    5 วันทำการ — ต่างกัน 90 เท่า ใช้ sla_target ตาม priority อย่างเดียวแทนไม่ได้
    """

    __tablename__ = "service_catalog_item"
    __table_args__ = (
        UniqueConstraint("company_id", "code"),
        CheckConstraint(f"target_mode IN {tuple(values(TargetMode))}", name="target_mode_valid"),
        CheckConstraint(
            f"clock_start_event IN {tuple(values(ClockStartEvent))}", name="clock_start_valid"
        ),
        CheckConstraint(f"default_priority IN {tuple(values(Priority))}", name="priority_valid"),
        # target_mode = duration ต้องมีจำนวนนาที
        CheckConstraint(
            "target_mode <> 'duration' OR target_minutes IS NOT NULL",
            name="duration_needs_minutes",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("company.id"), index=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name_th: Mapped[str] = mapped_column(String(150), nullable=False)
    category_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("ticket_category.id"))
    default_impact: Mapped[str] = mapped_column(String(20), default="individual", nullable=False)
    default_urgency: Mapped[str] = mapped_column(String(20), default="low", nullable=False)
    default_priority: Mapped[str] = mapped_column(
        String(10), default=Priority.P4.value, nullable=False
    )

    target_mode: Mapped[str] = mapped_column(
        String(30), default=TargetMode.DURATION.value, nullable=False
    )
    target_minutes: Mapped[int | None] = mapped_column(Integer)  # นาทีทำการ
    # จุดเริ่มนับต่างกัน 4 แบบ — คำขอสิทธิ์เริ่มนับ "หลังการอนุมัติครบถ้วน" (SLA 5.3)
    clock_start_event: Mapped[str] = mapped_column(
        String(30), default=ClockStartEvent.ON_CREATE.value, nullable=False
    )
    lead_time_days: Mapped[int | None] = mapped_column(Integer)
    lead_time_unit: Mapped[str | None] = mapped_column(String(10))  # calendar / business

    requires_approval: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # ลำดับ approver_type คั่นด้วย , เช่น "line_manager,system_owner"
    approval_chain: Mapped[str | None] = mapped_column(String(200))
    checklist_template_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("checklist_template.id")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ApprovalRequest(Base):
    """การอนุมัติแบบเรียงลำดับ (SOP-03, SOP-06)

    ระหว่างมีขั้น pending ticket จะอยู่ pending_user + pending_reason='approval'
    ซึ่งหยุดนับ SLA ตาม SLA ข้อ 9
    """

    __tablename__ = "approval_request"
    __table_args__ = (
        UniqueConstraint("ticket_id", "seq"),
        CheckConstraint(f"status IN {tuple(values(ApprovalStatus))}", name="status_valid"),
        CheckConstraint(
            f"approver_type IN {tuple(values(ApproverType))}", name="approver_type_valid"
        ),
        # ปฏิเสธต้องมีเหตุผลเสมอ — บังคับที่ระดับฐานข้อมูล
        CheckConstraint(
            "status <> 'rejected' OR comment IS NOT NULL", name="reject_needs_comment"
        ),
        Index("ix_approval_approver_status", "approver_id", "status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ticket.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # ขั้น n+1 เปิดใช้ได้เมื่อขั้น n เป็น approved
    seq: Mapped[int] = mapped_column(SmallInteger, default=1, nullable=False)
    approver_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # null = ยังหาผู้อนุมัติไม่ได้ ต้องแจ้ง company_admin ให้กำหนดคน
    approver_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("app_user.id"))
    status: Mapped[str] = mapped_column(
        String(20), default=ApprovalStatus.PENDING.value, nullable=False
    )
    decided_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("app_user.id"))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    comment: Mapped[str | None] = mapped_column(String(500))
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # หลักฐานการอนุมัติ (SOP-03 ข้อ 4)
    attachment_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("attachment.id"))
    # สิทธิ์ชั่วคราวต้องมีกำหนดสิ้นสุด (SOP-03 ข้อ 6)
    access_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ChecklistTemplate(Base, TimestampMixin):
    __tablename__ = "checklist_template"
    __table_args__ = (UniqueConstraint("company_id", "code"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("company.id"))
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name_th: Mapped[str] = mapped_column(String(150), nullable=False)
    doc_ref: Mapped[str | None] = mapped_column(String(40))  # เช่น AIDC-IT-SOP-001 ก.1
    # เพิ่มทีละ 1 เมื่อแก้รายการ — ticket เก่าอ้างเวอร์ชันเดิมผ่านสแนปช็อต
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    items: Mapped[list["ChecklistItem"]] = relationship(
        back_populates="template", cascade="all, delete-orphan"
    )


class ChecklistItem(Base):
    __tablename__ = "checklist_item"
    __table_args__ = (UniqueConstraint("template_id", "sort_order"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    template_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("checklist_template.id", ondelete="CASCADE"), nullable=False
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    title_th: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    # true = บล็อกการเปลี่ยนสถานะเป็น resolved (SOP-04 ข้อ 6 / SOP-05 ข้อ 6)
    is_required: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # true = ต้องแนบไฟล์หลักฐานก่อนติ๊กว่าเสร็จ
    evidence_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    default_role_code: Mapped[str | None] = mapped_column(String(30))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    template: Mapped[ChecklistTemplate] = relationship(back_populates="items")


class TicketChecklist(Base):
    __tablename__ = "ticket_checklist"
    __table_args__ = (UniqueConstraint("ticket_id", "template_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ticket.id", ondelete="CASCADE"), nullable=False, index=True
    )
    template_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("checklist_template.id"), nullable=False
    )
    # สแนปช็อตเวอร์ชัน — แก้ template ภายหลังไม่กระทบ ticket เก่า
    # หลักเดียวกับ ticket.sla_policy_id
    template_version: Mapped[int] = mapped_column(Integer, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    items: Mapped[list["TicketChecklistItem"]] = relationship(
        back_populates="checklist", cascade="all, delete-orphan"
    )


class TicketChecklistItem(Base):
    __tablename__ = "ticket_checklist_item"
    __table_args__ = (
        # ข้อที่ต้องมีหลักฐาน ติ๊กเสร็จไม่ได้ถ้ายังไม่แนบไฟล์
        CheckConstraint(
            "NOT (is_done AND evidence_required AND attachment_id IS NULL)",
            name="evidence_required_when_done",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ticket_checklist_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ticket_checklist.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # null ได้ถ้าต้นทางถูกลบ — ข้อความยังอยู่ใน title_snapshot
    checklist_item_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("checklist_item.id"))
    title_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    is_required: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    evidence_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_done: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    done_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("app_user.id"))
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(String(500))
    attachment_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("attachment.id"))

    checklist: Mapped[TicketChecklist] = relationship(back_populates="items")


class ApprovedSoftware(Base, TimestampMixin):
    """บัญชีซอฟต์แวร์อนุมัติ (SOP-06 ข้อ 2 / นโยบาย 3.5)

    เฟส 1 เป็น master data อ่านอย่างเดียว — ให้ระบบเช็กได้ว่าคำขอติดตั้ง
    เข้าข่าย SR-SW-INSTALL (2 วันทำการ) หรือ SR-SW-NONSTD (ต้องอนุมัติ)
    """

    __tablename__ = "approved_software"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("company.id"), index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    version: Mapped[str | None] = mapped_column(String(50))
    license_type: Mapped[str | None] = mapped_column(String(50))
    note: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
