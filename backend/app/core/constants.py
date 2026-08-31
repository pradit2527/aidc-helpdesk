"""ค่า enum ทั้งระบบ — แหล่งความจริงเดียวที่ทั้ง model, schema และ service ใช้ร่วมกัน

ตรงกับ docs/03-api-spec.md v2.0 §1.6
ใช้ VARCHAR + CHECK constraint ไม่ใช่ PostgreSQL ENUM type
เพราะการเพิ่มค่าใน ENUM type ต้องทำ migration ที่ล็อกตาราง (02-data-model.md §1)
"""

from __future__ import annotations

from enum import StrEnum


class TicketType(StrEnum):
    INCIDENT = "incident"
    SERVICE_REQUEST = "service_request"


class Impact(StrEnum):
    ORG_WIDE = "org_wide"
    DEPARTMENT = "department"
    INDIVIDUAL = "individual"


class Urgency(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class Priority(StrEnum):
    """ระบบคำนวณจาก impact x urgency — ผู้แจ้งส่งมาโดยตรงไม่ได้ (SLA ข้อ 4)"""

    P1 = "P1"
    P2 = "P2"
    P3 = "P3"
    P4 = "P4"


class TicketStatus(StrEnum):
    NEW = "new"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    PENDING_USER = "pending_user"
    RESOLVED = "resolved"
    CLOSED = "closed"
    CANCELLED = "cancelled"


class PendingReason(StrEnum):
    """แยก 3 แบบตาม SLA 5.4 — vendor ต้องแจ้งผู้รับบริการก่อนจึงหยุดนับเวลาได้"""

    USER = "user"
    VENDOR = "vendor"
    APPROVAL = "approval"


class Channel(StrEnum):
    """4 ช่องทางตาม SLA 3.2 / SOP 2.3 — ไม่มี LINE (LINE ใช้แจ้งเตือนขาออกเท่านั้น)"""

    PORTAL = "portal"
    EMAIL = "email"
    PHONE = "phone"
    WALK_IN = "walk_in"


class SourceDevice(StrEnum):
    WEB = "web"
    MOBILE_WEB = "mobile_web"


class SlaStatus(StrEnum):
    """คำนวณตอนอ่าน ไม่เก็บในฐานข้อมูล"""

    ON_TRACK = "on_track"
    AT_RISK = "at_risk"
    BREACHED = "breached"
    PAUSED = "paused"


class ClockMode(StrEnum):
    BUSINESS_HOURS = "business_hours"
    CALENDAR_24X7 = "calendar_24x7"


class SlaExclusionCode(StrEnum):
    """ข้อยกเว้นตาม SLA ข้อ 9 — ตัดออกจากตัวหารของ KPI และไม่ตั้งธง breach"""

    PLANNED_MAINTENANCE = "planned_maintenance"
    FORCE_MAJEURE = "force_majeure"
    VENDOR_DELAY = "vendor_delay"
    USER_INSTALLED = "user_installed"
    WAITING_REQUESTER = "waiting_requester"
    AGREED_SPECIAL_TERMS = "agreed_special_terms"


class ServiceTier(StrEnum):
    CRITICAL = "critical"   # >= 99.9%
    HIGH = "high"           # >= 99.5%
    STANDARD = "standard"   # >= 99.0%


class ServiceGroup(StrEnum):
    CORE_BUSINESS = "core_business"
    INFRASTRUCTURE = "infrastructure"
    COMMUNICATION = "communication"
    FILE_STORAGE = "file_storage"
    ENDPOINT = "endpoint"
    SERVICE_REQUEST = "service_request"


class ApprovalStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    SKIPPED = "skipped"


class ApproverType(StrEnum):
    LINE_MANAGER = "line_manager"
    SYSTEM_OWNER = "system_owner"
    HEAD_OF_IT = "head_of_it"
    BUDGET_OWNER = "budget_owner"
    TIER2_REVIEW = "tier2_review"
    CAB = "cab"


class ClockStartEvent(StrEnum):
    """จุดเริ่มนับเวลาของคำขอบริการ (SLA 5.3)"""

    ON_CREATE = "on_create"
    AFTER_IDENTITY_VERIFIED = "after_identity_verified"
    AFTER_APPROVAL = "after_approval"
    AFTER_BUDGET_APPROVAL = "after_budget_approval"


class TargetMode(StrEnum):
    DURATION = "duration"
    BEFORE_DATE = "before_date"
    BY_DATE = "by_date"


class ProblemStatus(StrEnum):
    OPEN = "open"
    RCA_PENDING = "rca_pending"
    FIXED = "fixed"
    CLOSED = "closed"


class KbVisibility(StrEnum):
    PUBLIC = "public"
    COMPANY = "company"
    AGENT_ONLY = "agent_only"


class KbStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class NotificationChannelCode(StrEnum):
    IN_APP = "in_app"
    EMAIL = "email"
    TEAMS = "teams"
    LINE = "line"
    WEBPUSH = "webpush"


class NotificationStatus(StrEnum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    SKIPPED = "skipped"


class EventType(StrEnum):
    TICKET_CREATED = "ticket_created"
    TICKET_ASSIGNED = "ticket_assigned"
    COMMENT_ADDED = "comment_added"
    STATUS_CHANGED = "status_changed"
    SLA_WARNING = "sla_warning"
    SLA_BREACHED = "sla_breached"
    TICKET_RESOLVED = "ticket_resolved"
    TICKET_CLOSED = "ticket_closed"
    MAJOR_INCIDENT = "major_incident"
    SECURITY_INCIDENT = "security_incident"
    APPROVAL_REQUESTED = "approval_requested"
    APPROVAL_DECIDED = "approval_decided"
    STATUS_REPORT_DUE = "status_report_due"
    FOLLOWUP = "followup"
    RCA_DUE = "rca_due"


class AuditAction(StrEnum):
    LOGIN = "login"
    LOGOUT = "logout"
    LOGIN_FAILED = "login_failed"
    READ = "read"
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    ASSIGN = "assign"
    STATUS_CHANGE = "status_change"
    PERMISSION_CHANGE = "permission_change"
    APPROVAL_DECIDE = "approval_decide"
    EXPORT = "export"
    DOWNLOAD = "download"
    UNLOCK = "unlock"


class RoleCode(StrEnum):
    END_USER = "end_user"
    AGENT = "agent"
    COMPANY_ADMIN = "company_admin"
    MANAGER_VIEWER = "manager_viewer"
    SUPER_ADMIN = "super_admin"


class ContactKey(StrEnum):
    """ตำแหน่งในองค์กร — ไม่ใช่ role ของระบบ (05-… §5.1)"""

    HEAD_OF_IT = "head_of_it"
    CEO = "ceo"
    DPO = "dpo"
    INCIDENT_MANAGER = "incident_manager"
    TIER2_GROUP = "tier2_group"
    TIER3_GROUP = "tier3_group"


class AuthProvider(StrEnum):
    LOCAL = "local"
    LDAP = "ldap"
    OIDC = "oidc"


class ScanStatus(StrEnum):
    PENDING = "pending"
    CLEAN = "clean"
    INFECTED = "infected"
    SKIPPED = "skipped"


def values(enum_cls: type[StrEnum]) -> list[str]:
    """คืนรายการค่าสำหรับใช้สร้าง CHECK constraint"""
    return [e.value for e in enum_cls]
