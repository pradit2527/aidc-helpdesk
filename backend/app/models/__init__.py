"""รวม model ทุกตัวไว้ที่เดียว

จำเป็นสองเหตุผล:
1. Alembic autogenerate เห็นตารางครบ 38 ตารางจาก Base.metadata
2. SQLAlchemy resolve FK ที่อ้างข้ามไฟล์ด้วยชื่อตาราง (string) ได้ครบตอน configure mappers
"""

from app.db.base import Base

from app.models.organization import (
    AppUser,
    Company,
    Department,
    EscalationContact,
    PasswordHistory,
    Permission,
    Role,
    RolePermission,
    UserRole,
    UserRoleScope,
)
from app.models.ticket import (
    Ticket,
    TicketCategory,
    TicketComment,
    TicketSequence,
    TicketStatusHistory,
)
from app.models.sla import (
    BusinessHours,
    Holiday,
    MaintenanceWindow,
    Problem,
    Service,
    ServiceOutage,
    ServiceTierTarget,
    SlaEscalationRule,
    SlaPolicy,
    SlaTarget,
)
from app.models.process import (
    ApprovalRequest,
    ApprovedSoftware,
    ChecklistItem,
    ChecklistTemplate,
    ServiceCatalogItem,
    TicketChecklist,
    TicketChecklistItem,
)
from app.models.content import (
    Attachment,
    AuditLog,
    KbArticle,
    KbCategory,
    KbFeedback,
    Notification,
    NotificationChannel,
)

__all__ = [
    "Base",
    # องค์กรและสิทธิ์ (10)
    "Company", "Department", "AppUser", "PasswordHistory", "Role", "Permission",
    "RolePermission", "UserRole", "UserRoleScope", "EscalationContact",
    # ticket (5)
    "TicketCategory", "TicketSequence", "Ticket", "TicketStatusHistory", "TicketComment",
    # sla / service / problem (10)
    "SlaPolicy", "SlaTarget", "BusinessHours", "Holiday", "SlaEscalationRule",
    "Service", "ServiceTierTarget", "ServiceOutage", "MaintenanceWindow", "Problem",
    # กระบวนการตาม SOP (7)
    "ServiceCatalogItem", "ApprovalRequest", "ChecklistTemplate", "ChecklistItem",
    "TicketChecklist", "TicketChecklistItem", "ApprovedSoftware",
    # เนื้อหาและร่องรอย (7)
    "Attachment", "KbCategory", "KbArticle", "KbFeedback",
    "Notification", "NotificationChannel", "AuditLog",
]
