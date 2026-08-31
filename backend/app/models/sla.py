"""SLA ปฏิทิน escalation ทะเบียนระบบงาน และ Problem — 10 ตาราง

ตรงกับ docs/02-data-model.md v2.0 §2.3, §4.3, §5.3–5.9
"""

from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.constants import (
    ClockMode,
    Priority,
    ProblemStatus,
    ServiceGroup,
    ServiceTier,
    values,
)
from app.db.base import Base, TimestampMixin


class SlaPolicy(Base, TimestampMixin):
    """ผูกกับเอกสารควบคุมเสมอ

    SLA ทบทวนทุก 12 เดือน — เมื่อขึ้นเวอร์ชันใหม่ **ห้าม UPDATE แถวเดิม**
    ให้ตั้ง effective_to ของแถวเดิมแล้ว INSERT แถวใหม่
    ticket.sla_policy_id เป็นสแนปช็อตอยู่แล้ว จึงไม่กระทบ ticket เก่า (US-11 AC-1)
    """

    __tablename__ = "sla_policy"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("company.id"), index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # ตรวจย้อนกลับได้ว่าค่าชุดนี้มาจากเอกสารฉบับใด (Document Control)
    doc_ref: Mapped[str | None] = mapped_column(String(40))
    doc_version: Mapped[str | None] = mapped_column(String(10))
    effective_from: Mapped[date | None] = mapped_column(Date)
    effective_to: Mapped[date | None] = mapped_column(Date)  # null = ยังบังคับใช้อยู่

    targets: Mapped[list["SlaTarget"]] = relationship(
        back_populates="policy", cascade="all, delete-orphan"
    )


class SlaTarget(Base):
    __tablename__ = "sla_target"
    __table_args__ = (
        UniqueConstraint("sla_policy_id", "priority"),
        CheckConstraint(f"priority IN {tuple(values(Priority))}", name="priority_valid"),
        CheckConstraint(f"clock_mode IN {tuple(values(ClockMode))}", name="clock_mode_valid"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    sla_policy_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sla_policy.id", ondelete="CASCADE"), nullable=False
    )
    priority: Mapped[str] = mapped_column(String(10), nullable=False)
    response_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    resolution_minutes: Mapped[int] = mapped_column(Integer, nullable=False)

    # P1 = calendar_24x7 (มีทีม On-call) · P2-P4 = business_hours (SLA 5.4)
    clock_mode: Mapped[str] = mapped_column(
        String(20), default=ClockMode.BUSINESS_HOURS.value, nullable=False
    )
    # รอบรายงานสถานะ — null = รายงานเมื่อสถานะเปลี่ยนเท่านั้น (SLA 5.1)
    status_report_interval_minutes: Mapped[int | None] = mapped_column(Integer)
    # กลไกเตือนล่วงหน้าของทีมเอง ไม่ได้มาจากเอกสารควบคุม
    escalation_percent: Mapped[int] = mapped_column(Integer, default=75, nullable=False)

    policy: Mapped[SlaPolicy] = relationship(back_populates="targets")


class BusinessHours(Base):
    """ค่าเริ่มต้น จ.-ศ. 08:30-17:30 · เสาร์และอาทิตย์ is_working_day = false (G-01)"""

    __tablename__ = "business_hours"
    __table_args__ = (
        UniqueConstraint("company_id", "day_of_week"),
        CheckConstraint("day_of_week BETWEEN 0 AND 6", name="dow_range"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("company.id"), index=True)
    day_of_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 0=อาทิตย์
    start_time: Mapped[time] = mapped_column(Time, default=time(8, 30), nullable=False)
    end_time: Mapped[time] = mapped_column(Time, default=time(17, 30), nullable=False)
    is_working_day: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Holiday(Base):
    __tablename__ = "holiday"
    __table_args__ = (UniqueConstraint("company_id", "holiday_date"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("company.id"), index=True)
    holiday_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)


class SlaEscalationRule(Base, TimestampMixin):
    """กฎ ES-01..ES-12 เก็บในตารางไม่ hard-code

    จำเป็นเพราะเอกสาร SLA ทบทวนทุก 12 เดือน — ถ้า hard-code
    ต้อง deploy ใหม่ทุกครั้งที่เกณฑ์เปลี่ยน (05-… §5.2)
    """

    __tablename__ = "sla_escalation_rule"
    __table_args__ = (UniqueConstraint("company_id", "code"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("company.id"))
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    trigger_type: Mapped[str] = mapped_column(String(30), nullable=False)
    priority: Mapped[str | None] = mapped_column(String(10))
    threshold_minutes: Mapped[int | None] = mapped_column(Integer)
    threshold_clock_mode: Mapped[str] = mapped_column(
        String(20), default=ClockMode.BUSINESS_HOURS.value, nullable=False
    )
    notify_contact_keys: Mapped[str] = mapped_column(String(200), nullable=False)
    notify_roles: Mapped[str | None] = mapped_column(String(200))
    repeat_interval_minutes: Mapped[int | None] = mapped_column(Integer)
    # true เฉพาะ ES-01 / ES-02 / ES-03 — สอดคล้อง SLA 3.1 ที่ On-call ครอบคลุมเฉพาะ P1
    notify_outside_business_hours: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Service(Base, TimestampMixin):
    """ทะเบียนระบบงาน (SLA ข้อ 2) — จำเป็นต่อ KPI-6 Uptime และ SOP-03 ขั้นอนุมัติที่ 2"""

    __tablename__ = "service"
    __table_args__ = (
        UniqueConstraint("company_id", "code"),
        CheckConstraint(f"service_tier IN {tuple(values(ServiceTier))}", name="tier_valid"),
        CheckConstraint(f"service_group IN {tuple(values(ServiceGroup))}", name="group_valid"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("company.id"), index=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name_th: Mapped[str] = mapped_column(String(150), nullable=False)
    service_group: Mapped[str] = mapped_column(String(30), nullable=False)
    service_tier: Mapped[str] = mapped_column(
        String(20), default=ServiceTier.STANDARD.value, nullable=False
    )
    # System Owner — ใช้เป็นผู้อนุมัติขั้นที่ 2 ของ SOP-03
    owner_user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("app_user.id"))
    # true = ตัวหารของ Uptime คือ 43,200 นาที/เดือน
    is_24x7: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ServiceTierTarget(Base):
    __tablename__ = "service_tier_target"

    tier_code: Mapped[str] = mapped_column(String(20), primary_key=True)
    uptime_percent: Mapped[float] = mapped_column(Numeric(5, 3), nullable=False)
    max_downtime_minutes_month: Mapped[int] = mapped_column(Integer, nullable=False)


class ServiceOutage(Base, TimestampMixin):
    """ตัวตั้งของสูตร Uptime — เฟส 1 บันทึกด้วยมือ เฟส 2 ค่อยเชื่อม Monitoring"""

    __tablename__ = "service_outage"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    service_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("service.id"), nullable=False, index=True)
    ticket_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("ticket.id"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # true = อยู่ในหน้าต่างบำรุงรักษา จึงไม่นับเป็น Downtime (SLA 5.2, ข้อ 9)
    is_planned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    maintenance_window_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("maintenance_window.id")
    )
    cause: Mapped[str | None] = mapped_column(String(500))
    recorded_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("app_user.id"))


class MaintenanceWindow(Base, TimestampMixin):
    __tablename__ = "maintenance_window"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("company.id"))
    service_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("service.id"))
    planned_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    planned_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # ระบบบล็อกการยืนยันถ้าแจ้งล่วงหน้า < notice_lead_business_days (SLA 3.1)
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notice_lead_business_days: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("app_user.id"), nullable=False)


class Problem(Base, TimestampMixin):
    """จำเป็นต่อ KPI-7 Repeat Incident · กฎ workaround · และ RCA (SLA 7.2, 7.3)"""

    __tablename__ = "problem"
    __table_args__ = (
        CheckConstraint(f"status IN {tuple(values(ProblemStatus))}", name="status_valid"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("company.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    service_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("service.id"))
    # ใช้จับ "P1 จากสาเหตุเดิมซ้ำภายใน 90 วัน" (ES-11)
    root_cause_code: Mapped[str | None] = mapped_column(String(40), index=True)
    root_cause_note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        String(20), default=ProblemStatus.OPEN.value, nullable=False
    )
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # = opened_at + 5 วันทำการ สำหรับเหตุ P1 (SLA 7.2)
    rca_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    rca_submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    owner_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("app_user.id"))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
