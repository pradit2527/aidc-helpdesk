"""ไฟล์แนบ คลังความรู้ การแจ้งเตือน และร่องรอยการใช้งาน — 7 ตาราง

ตรงกับ docs/02-data-model.md v2.0 §2.5, §4.6, §4.7
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
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.constants import (
    KbStatus,
    KbVisibility,
    NotificationChannelCode,
    NotificationStatus,
    ScanStatus,
    values,
)
from app.db.base import Base, SoftDeleteMixin, TimestampMixin


class Attachment(Base, SoftDeleteMixin):
    __tablename__ = "attachment"
    __table_args__ = (
        CheckConstraint(f"scan_status IN {tuple(values(ScanStatus))}", name="scan_status_valid"),
        CheckConstraint("file_size <= 20971520", name="file_size_max_20mb"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    # ทั้งสามเป็น null ได้ชั่วคราว เพราะ POST /attachments อัปโหลด "ก่อน" สร้าง ticket (B-08)
    # งาน cleanup_orphan_attachments ลบไฟล์ที่ไม่ผูกกับอะไรเกิน 24 ชม.
    ticket_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("ticket.id"), index=True)
    comment_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("ticket_comment.id"))
    kb_article_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("kb_article.id"))

    # path สัมพัทธ์ {company_id}/{yyyy}/{mm}/{uuid}.{ext} — ระบบเป็นคนกำหนดทั้งหมด
    # ชื่อไฟล์ของผู้ใช้ไม่เคยถูกใช้ประกอบ path (กัน path traversal)
    storage_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # ตรวจจาก magic bytes จริง ไม่เชื่อ Content-Type ที่ client ส่งมา (NFR-15)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    uploaded_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("app_user.id"), nullable=False)
    # รองรับ virus scan ในเฟส 2 — เฟส 1 เป็น skipped ทั้งหมด (B-04)
    scan_status: Mapped[str] = mapped_column(
        String(20), default=ScanStatus.SKIPPED.value, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class KbCategory(Base):
    __tablename__ = "kb_category"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    parent_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("kb_category.id"))
    name_th: Mapped[str] = mapped_column(String(150), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class KbArticle(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "kb_article"
    __table_args__ = (
        CheckConstraint(f"visibility IN {tuple(values(KbVisibility))}", name="visibility_valid"),
        CheckConstraint(f"status IN {tuple(values(KbStatus))}", name="status_valid"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    kb_category_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("kb_category.id"), nullable=False
    )
    # null = ทุกบริษัทเห็น
    company_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("company.id"), index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str | None] = mapped_column(String(500))
    body_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    visibility: Mapped[str] = mapped_column(
        String(20), default=KbVisibility.PUBLIC.value, nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20), default=KbStatus.DRAFT.value, nullable=False
    )
    tags: Mapped[str | None] = mapped_column(String(255))
    author_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("app_user.id"), nullable=False)
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    helpful_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    not_helpful_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    source_ticket_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("ticket.id"))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class KbFeedback(Base):
    """กันโหวตซ้ำรายผู้ใช้ (B-05 / US-13 AC-3)"""

    __tablename__ = "kb_feedback"
    __table_args__ = (UniqueConstraint("kb_article_id", "user_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    kb_article_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("kb_article.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("app_user.id"), nullable=False)
    is_helpful: Mapped[bool] = mapped_column(Boolean, nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Notification(Base):
    """1 แถว = 1 ช่องทาง เพื่อให้ retry รายช่องทางแยกกันได้"""

    __tablename__ = "notification"
    __table_args__ = (
        CheckConstraint(
            f"channel IN {tuple(values(NotificationChannelCode))}", name="channel_valid"
        ),
        CheckConstraint(f"status IN {tuple(values(NotificationStatus))}", name="status_valid"),
        Index("ix_notification_unread", "user_id", "channel", "read_at"),
        # กัน Celery retry สร้างแถวซ้ำในวันเดียวกัน (S-04)
        Index(
            "uq_notification_dedup",
            "user_id",
            "ticket_id",
            "event_type",
            "channel",
            text("(created_at::date)"),
            unique=True,
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("app_user.id"), nullable=False)
    ticket_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("ticket.id"))
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    channel: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default=NotificationStatus.PENDING.value, nullable=False
    )
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[str | None] = mapped_column(String(500))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class NotificationChannel(Base, TimestampMixin):
    __tablename__ = "notification_channel"
    __table_args__ = (
        UniqueConstraint("user_id", "channel"),
        CheckConstraint(
            f"channel IN {tuple(values(NotificationChannelCode))}", name="channel_valid"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    channel: Mapped[str] = mapped_column(String(20), nullable=False)
    destination: Mapped[str | None] = mapped_column(String(255))
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # LINE ต้องผูกบัญชีสำเร็จก่อนจึงส่งได้
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class AuditLog(Base):
    """append-only — ห้าม UPDATE/DELETE จากชั้น application

    เก็บอย่างน้อย 1 ปี และห้าม purge ก่อน 90 วัน (NFR-18 / นโยบาย 3.3)
    """

    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_created", text("created_at DESC")),
        Index("ix_audit_actor", "actor_id", text("created_at DESC")),
        Index("ix_audit_entity", "entity_type", "entity_id"),
        Index("ix_audit_company", "company_id", text("created_at DESC")),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("app_user.id"))
    company_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("company.id"))
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[int | None] = mapped_column(BigInteger)
    # เฉพาะฟิลด์ที่เปลี่ยน — ห้ามเก็บ password / token (NFR-19)
    old_value: Mapped[dict | None] = mapped_column(JSONB)
    new_value: Mapped[dict | None] = mapped_column(JSONB)
    ip_address: Mapped[str | None] = mapped_column(String(45))  # รองรับ IPv6
    user_agent: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
