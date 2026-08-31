"""ข้อผิดพลาดเชิงธุรกิจ — รูปแบบเดียวทั้งระบบ

service โยน AppError เท่านั้น ห้ามโยน HTTPException
handler กลางตัวเดียวเป็นผู้ประกอบ response body ตาม docs/03-api-spec.md v2.0 §1.3
"""

from __future__ import annotations

from dataclasses import dataclass, field

#: (http_status, ข้อความภาษาไทยที่แสดงผู้ใช้ได้ทันที)
ERRORS: dict[str, tuple[int, str]] = {
    # 400
    "INVALID_PARAMETER": (400, "พารามิเตอร์ไม่ถูกต้อง"),
    "BAD_REQUEST": (400, "คำขอไม่ถูกต้อง"),
    # 401
    "UNAUTHENTICATED": (401, "กรุณาเข้าสู่ระบบใหม่"),
    "INVALID_CREDENTIALS": (401, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"),
    "TOKEN_EXPIRED": (401, "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่"),
    "INVALID_TOKEN": (401, "โทเคนไม่ถูกต้อง"),
    # 403
    "FORBIDDEN": (403, "คุณไม่มีสิทธิ์ดำเนินการนี้"),
    "OUT_OF_SCOPE": (403, "ข้อมูลนี้อยู่นอกขอบเขตสิทธิ์ของคุณ"),
    "PASSWORD_CHANGE_REQUIRED": (403, "กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน"),
    "CSRF_FAILED": (403, "คำขอไม่ผ่านการตรวจสอบความปลอดภัย กรุณารีเฟรชหน้าแล้วลองใหม่"),
    # 404
    "NOT_FOUND": (404, "ไม่พบข้อมูลที่ต้องการ"),
    # 409
    "CONFLICT": (409, "ข้อมูลขัดแย้งกับสถานะปัจจุบัน"),
    "DUPLICATE_ENTRY": (409, "ข้อมูลนี้มีอยู่แล้วในระบบ"),
    "INVALID_STATE_TRANSITION": (409, "ไม่สามารถเปลี่ยนสถานะได้"),
    "ALREADY_ASSIGNED": (409, "มีผู้รับผิดชอบเรื่องนี้แล้ว"),
    "EDIT_WINDOW_EXPIRED": (409, "หมดเวลาแก้ไขข้อความแล้ว"),
    "RESOURCE_IN_USE": (409, "ไม่สามารถลบได้เพราะมีการใช้งานอยู่"),
    "CHECKLIST_INCOMPLETE": (409, "ยังปิดงานไม่ได้ — มีรายการที่ต้องทำให้ครบก่อน"),
    "APPROVAL_PENDING": (409, "คำขอนี้ยังรอการอนุมัติอยู่"),
    "WORKAROUND_REQUIRES_PROBLEM": (
        409,
        "ต้องเปิดรายการปัญหา (Problem) เพื่อติดตามการแก้ถาวรก่อน",
    ),
    "NOTICE_PERIOD_TOO_SHORT": (409, "ต้องแจ้งล่วงหน้าอย่างน้อย 3 วันทำการ"),
    # 413 / 415
    "FILE_TOO_LARGE": (413, "ไฟล์ใหญ่เกิน 20 MB"),
    "UNSUPPORTED_FILE_TYPE": (415, "ไม่รองรับไฟล์ประเภทนี้"),
    "FILE_INFECTED": (415, "ไฟล์นี้ถูกตรวจพบว่าไม่ปลอดภัย"),
    # 422
    "VALIDATION_ERROR": (422, "ข้อมูลไม่ถูกต้อง"),
    "SELF_APPROVAL_FORBIDDEN": (422, "ไม่สามารถอนุมัติคำขอของตนเองได้"),
    "EVIDENCE_REQUIRED": (422, "รายการนี้ต้องแนบหลักฐานก่อนติ๊กว่าเสร็จ"),
    # 423
    "ACCOUNT_LOCKED": (
        423,
        "บัญชีถูกล็อกจากการกรอกรหัสผ่านผิดเกินกำหนด กรุณาติดต่อ Service Desk เพื่อยืนยันตัวตนและปลดล็อก",
    ),
    "ACCOUNT_DISABLED": (423, "บัญชีนี้ถูกปิดใช้งาน"),
    # 429 / 5xx
    "RATE_LIMITED": (429, "มีคำขอมากเกินไป กรุณารอสักครู่"),
    "INTERNAL_ERROR": (500, "ระบบขัดข้อง กรุณาแจ้งผู้ดูแลระบบ"),
    "SERVICE_UNAVAILABLE": (503, "ระบบอยู่ระหว่างปรับปรุง"),
}


@dataclass
class AppError(Exception):
    """ข้อผิดพลาดเชิงธุรกิจ — service โยนตัวนี้เท่านั้น"""

    code: str
    message: str
    http_status: int = 400
    details: list[dict] = field(default_factory=list)

    def __str__(self) -> str:  # pragma: no cover - เพื่อการดีบัก
        return f"{self.code}: {self.message}"


def err(
    code: str, message: str | None = None, details: list[dict] | None = None
) -> AppError:
    """สร้าง AppError จากรหัสในตาราง ERRORS

    Raises:
        KeyError: เมื่อใช้รหัสที่ไม่ได้ประกาศไว้ — บังคับให้ทุกรหัสอยู่ในสัญญา API
    """
    status, default_msg = ERRORS[code]
    return AppError(code, message or default_msg, status, details or [])
