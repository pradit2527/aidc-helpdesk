"""องค์กร ผู้ใช้ สิทธิ์ และผู้รับการยกระดับ — 9 ตาราง

ตรงกับ docs/02-data-model.md v2.0 §2.1, §3, §4.1, §4.2, §5.3
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
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.constants import AuthProvider, ContactKey, values
from app.db.base import Base, SoftDeleteMixin, TimestampMixin


class Company(Base, TimestampMixin):
    __tablename__ = "company"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name_th: Mapped[str] = mapped_column(String(150), nullable=False)
    name_en: Mapped[str | None] = mapped_column(String(150))
    logo_path: Mapped[str | None] = mapped_column(String(255))
    contact_email: Mapped[str | None] = mapped_column(String(150))
    # ห้ามลบบริษัท ใช้ is_active = false เท่านั้น (02-data-model.md §9.3)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    departments: Mapped[list["Department"]] = relationship(back_populates="company")


class Department(Base, TimestampMixin):
    __tablename__ = "department"
    __table_args__ = (UniqueConstraint("company_id", "name"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("company.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    company: Mapped[Company] = relationship(back_populates="departments")


class AppUser(Base, TimestampMixin, SoftDeleteMixin):
    """ใช้ชื่อ app_user เพราะ user เป็นคำสงวนของ PostgreSQL"""

    __tablename__ = "app_user"
    __table_args__ = (
        UniqueConstraint("auth_provider", "external_subject"),
        CheckConstraint(
            f"auth_provider IN {tuple(values(AuthProvider))}", name="auth_provider_valid"
        ),
        # ผู้ใช้ local ต้องมีรหัสผ่าน · ผู้ใช้ SSO ไม่ต้องมี (B-01)
        CheckConstraint(
            "auth_provider <> 'local' OR password_hash IS NOT NULL",
            name="local_user_needs_password",
        ),
        Index("ix_app_user_company_active", "company_id", "is_active"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("company.id"), nullable=False
    )
    department_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("department.id")
    )
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(150))
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    employee_code: Mapped[str | None] = mapped_column(String(50))
    phone: Mapped[str | None] = mapped_column(String(30))
    job_title: Mapped[str | None] = mapped_column(String(100))

    # ── การยืนยันตัวตน ──
    # nullable เพราะผู้ใช้ SSO ในเฟส 2 จะไม่มีรหัสผ่าน — เตรียมไว้ตั้งแต่แรก
    # จะได้ไม่ต้องทำ migration ที่กระทบทุกแถวภายหลัง (B-01)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    auth_provider: Mapped[str] = mapped_column(
        String(20), default=AuthProvider.LOCAL.value, nullable=False
    )
    external_subject: Mapped[str | None] = mapped_column(String(255))
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # ── การล็อกบัญชี ──
    # นโยบาย 3.2: "การปลดล็อกต้องยืนยันตัวตนกับ Service Desk"
    # จึงใช้ธง is_locked ไม่ใช่ locked_until — ปลดเองตามเวลาไม่ได้
    failed_login_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    unlocked_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("app_user.id"))

    # เพิ่มค่านี้แล้ว token เก่าทั้งหมดของบัญชีเป็นโมฆะทันที
    # ใช้ตอนปิดบัญชีหรือเปลี่ยน role โดยไม่ต้องรอ access token หมดอายุ 30 นาที (B-02)
    token_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # บัญชีผู้ดูแลต้องแยกจากบัญชีใช้งานประจำวัน + เปลี่ยนรหัสทุก 90 วัน (นโยบาย 3.2)
    is_admin_account: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # ใช้ส่งการแจ้งเตือนขาออกเท่านั้น ไม่ใช่ช่องทางรับแจ้ง (SLA 3.2)
    line_user_id: Mapped[str | None] = mapped_column(String(100))

    # ระบุ foreign_keys ชัดเจนเพราะ user_role มี FK มาที่ app_user สองเส้น
    # (user_id = เจ้าของสิทธิ์ · granted_by = คนมอบสิทธิ์)
    user_roles: Mapped[list["UserRole"]] = relationship(
        back_populates="user", foreign_keys="UserRole.user_id"
    )


class PasswordHistory(Base):
    """ห้ามใช้รหัสผ่านซ้ำ (นโยบาย 3.2) — เก็บกี่ชุดกำหนดที่ PASSWORD_HISTORY_SIZE"""

    __tablename__ = "password_history"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class Role(Base):
    __tablename__ = "role"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name_th: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    is_system: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    permissions: Mapped[list["Permission"]] = relationship(
        secondary="role_permission", back_populates="roles"
    )


class Permission(Base):
    __tablename__ = "permission"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    code: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    group_name: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))

    roles: Mapped[list[Role]] = relationship(
        secondary="role_permission", back_populates="permissions"
    )


class RolePermission(Base):
    __tablename__ = "role_permission"

    role_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("role.id", ondelete="CASCADE"), primary_key=True
    )
    permission_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("permission.id", ondelete="CASCADE"), primary_key=True
    )


class UserRole(Base):
    __tablename__ = "user_role"
    __table_args__ = (UniqueConstraint("user_id", "role_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("role.id"), nullable=False)
    granted_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("app_user.id"))
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # สิทธิ์ชั่วคราวต้องมีกำหนดสิ้นสุด (นโยบาย 3.3 / SOP-03 ข้อ 6)
    # เฟส 1 ใช้รายงานเตือน · เฟส 2 เพิกถอนอัตโนมัติ
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)

    user: Mapped[AppUser] = relationship(back_populates="user_roles", foreign_keys=[user_id])
    role: Mapped[Role] = relationship()
    scopes: Mapped[list["UserRoleScope"]] = relationship(
        back_populates="user_role", cascade="all, delete-orphan"
    )


class UserRoleScope(Base):
    """ขอบเขตบริษัทของ role นั้น

    ถ้าไม่มีแถวเลย -> ขอบเขตเป็นบริษัทต้นสังกัดของผู้ใช้
    super_admin ไม่ต้องมี scope (เห็นทุกบริษัทเสมอ)
    """

    __tablename__ = "user_role_scope"
    __table_args__ = (UniqueConstraint("user_role_id", "company_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_role_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("user_role.id", ondelete="CASCADE"), nullable=False, index=True
    )
    company_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("company.id"), nullable=False
    )

    user_role: Mapped[UserRole] = relationship(back_populates="scopes")


class EscalationContact(Base, TimestampMixin):
    """ผูกตำแหน่งในองค์กรกับบัญชีผู้ใช้จริง

    Head of IT / CEO / DPO เป็นตำแหน่ง ไม่ใช่ชุดสิทธิ์ — การเพิ่มเป็น role
    จะทำให้ permission matrix บวมโดยไม่ได้ประโยชน์ (05-… §5.1)
    """

    __tablename__ = "escalation_contact"
    __table_args__ = (
        UniqueConstraint("company_id", "contact_key", "user_id"),
        CheckConstraint(
            f"contact_key IN {tuple(values(ContactKey))}", name="contact_key_valid"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    # null = ระดับกลุ่ม ใช้เป็น fallback เมื่อบริษัทนั้นไม่ได้กำหนดคนของตัวเอง
    company_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("company.id"))
    contact_key: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("app_user.id"), nullable=False
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
