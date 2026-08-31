"""Business-time engine สำหรับคำนวณ SLA ของ AIDC Helpdesk.

กติกาที่ยึดตาม AIDC-IT-SLA-001 v1.1 (ผ่าน docs/04-rbac-sla.md v2.0 และ docs/11-sla-engine.md v2.0):

- P2-P4 นับเฉพาะ "นาทีทำการ" ในเขตเวลา Asia/Bangkok
- P1 นับต่อเนื่อง 24x7 (มีทีม On-call)
- ค่าเริ่มต้น จ.-ศ. 08:30-17:30 = 540 นาที/วัน  เสาร์-อาทิตย์และวันหยุดไม่นับ
- เวลาใน DB เก็บเป็น UTC เสมอ ฟังก์ชันทั้งหมดรับ/คืน datetime ที่มี tzinfo

โมดูลนี้ไม่ import SQLAlchemy / FastAPI / Redis โดยเจตนา ทดสอบได้เร็วโดยไม่ต้องมี DB
ชั้น calendar_loader.py เป็นผู้แปลงแถวจาก business_hours + holiday เป็น BusinessCalendar
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from enum import Enum
from typing import Dict, FrozenSet, Optional, Tuple
from zoneinfo import ZoneInfo

BKK = ZoneInfo("Asia/Bangkok")
UTC = ZoneInfo("UTC")

# กันลูปไม่รู้จบกรณีปฏิทินไม่มีวันทำการเลย (เช่น config ผิด)
_MAX_DAYS_SCAN = 3650

#: 1 วันทำการ = 540 นาทีทำการ (ปิดประเด็น S-02 — ยืนยันโดย SLA 1.4 + 3.1)
BUSINESS_DAY_MINUTES = 540


class ClockMode(str, Enum):
    """โหมดนาฬิกาตาม sla_target.clock_mode (SLA 5.4)"""

    BUSINESS_HOURS = "business_hours"  # P2-P4
    CALENDAR_24X7 = "calendar_24x7"  # P1 — มีทีม On-call


class CalendarError(RuntimeError):
    """ปฏิทินทำงานผิดปกติ เช่น ไม่มีวันทำการเลยในช่วง 10 ปี"""


@dataclass(frozen=True)
class WorkingWindow:
    """ช่วงเวลาทำการของหนึ่งวัน (เวลาท้องถิ่น)"""

    start: time
    end: time

    def __post_init__(self) -> None:
        if self.start >= self.end:
            raise ValueError("start_time ต้องน้อยกว่า end_time")

    @property
    def minutes(self) -> int:
        """จำนวนนาทีทำการทั้งวัน"""
        return (self.end.hour * 60 + self.end.minute) - (
            self.start.hour * 60 + self.start.minute
        )


@dataclass(frozen=True)
class BusinessCalendar:
    """ปฏิทินเวลาทำการของบริษัทหนึ่ง

    Attributes:
        windows: key = day_of_week ตามรูปแบบตาราง ``business_hours``
                 (0=อาทิตย์ ... 6=เสาร์) วันที่ไม่มี key = ไม่ใช่วันทำการ
        holidays: เซตของวันหยุด (เวลาท้องถิ่น) รวมวันหยุดกลาง + ของบริษัท
        tz: เขตเวลาที่ใช้ตีความเวลาทำการ (ระบบนี้ใช้ Asia/Bangkok เท่านั้น)
    """

    windows: Dict[int, WorkingWindow]
    holidays: FrozenSet[date] = field(default_factory=frozenset)
    tz: ZoneInfo = BKK

    @staticmethod
    def _dow(d: date) -> int:
        """แปลง date เป็น day_of_week แบบ DB (0=อาทิตย์ ... 6=เสาร์)"""
        return d.isoweekday() % 7

    def window_of(self, d: date) -> Optional[Tuple[datetime, datetime]]:
        """ช่วงเวลาทำการของวันนั้นเป็น aware datetime หรือ None ถ้าไม่ใช่วันทำการ"""
        if d in self.holidays:
            return None
        w = self.windows.get(self._dow(d))
        if w is None:
            return None
        return (
            datetime.combine(d, w.start, tzinfo=self.tz),
            datetime.combine(d, w.end, tzinfo=self.tz),
        )

    def is_working_time(self, dt: datetime) -> bool:
        local = _to_local(dt, self.tz)
        win = self.window_of(local.date())
        return win is not None and win[0] <= local < win[1]

    def day_minutes(self, d: date) -> int:
        win = self.window_of(d)
        if win is None:
            return 0
        return int((win[1] - win[0]).total_seconds() // 60)


# ---------- ปฏิทินเริ่มต้น (docs/02-data-model.md v2.0 §8.4) ----------
# จ.-ศ. 08:30-17:30 = 540 นาที/วัน   เสาร์และอาทิตย์ไม่ใช่วันทำการ
# หมายเหตุ: v1.0 เคยมี key 6 (เสาร์) ด้วย — ถูกลบออกตาม G-01
_STD = WorkingWindow(time(8, 30), time(17, 30))
DEFAULT_WINDOWS: Dict[int, WorkingWindow] = {
    1: _STD,  # จันทร์
    2: _STD,  # อังคาร
    3: _STD,  # พุธ
    4: _STD,  # พฤหัสบดี
    5: _STD,  # ศุกร์
}


def default_calendar(holidays: Optional[FrozenSet[date]] = None) -> BusinessCalendar:
    """ปฏิทินกลางของกลุ่ม AIDC: จ.-ศ. 08:30-17:30"""
    return BusinessCalendar(
        windows=dict(DEFAULT_WINDOWS),
        holidays=holidays or frozenset(),
    )


def _to_local(dt: datetime, tz: ZoneInfo) -> datetime:
    """แปลงเป็นเวลาท้องถิ่น; ปฏิเสธ datetime ที่ไม่มี tzinfo เพื่อกันบั๊กเงียบ"""
    if dt.tzinfo is None:
        raise ValueError("ต้องส่ง datetime ที่มี tzinfo เสมอ (naive datetime ไม่รับ)")
    return dt.astimezone(tz)


# ============================================================
# ฟังก์ชันหลัก — นาทีทำการ
# ============================================================


def next_working_instant(start: datetime, cal: BusinessCalendar) -> datetime:
    """หาช่วงเวลาทำการแรกที่ >= start

    ถ้า start อยู่ในเวลาทำการอยู่แล้วจะคืน start เดิม
    ถ้าอยู่นอกเวลาทำการจะคืนเวลาเปิดทำการถัดไป
    """
    cursor = _to_local(start, cal.tz)
    for _ in range(_MAX_DAYS_SCAN):
        win = cal.window_of(cursor.date())
        if win is not None:
            win_start, win_end = win
            if cursor < win_start:
                return win_start
            if cursor < win_end:
                return cursor
        cursor = datetime.combine(
            cursor.date() + timedelta(days=1), time(0, 0), tzinfo=cal.tz
        )
    raise CalendarError("ไม่พบวันทำการภายใน 10 ปี - ตรวจสอบ business_hours/holiday")


def add_business_minutes(
    start: datetime, minutes: int, cal: BusinessCalendar
) -> datetime:
    """บวก "นาทีทำการ" เข้ากับเวลาเริ่ม แล้วคืนเวลาสิ้นสุด

    กติกา:
    - ถ้า ``start`` อยู่นอกเวลาทำการ จะเลื่อนไปเริ่มนับที่เวลาเปิดทำการถัดไปก่อน
    - ข้ามเสาร์ อาทิตย์ และวันหยุดตามปฏิทินอัตโนมัติ
    - ถ้านาทีที่เหลือพอดีกับเวลาที่เหลือของวัน ผลลัพธ์จะเป็นเวลาปิดทำการของวันนั้น
      (เช่น 17:30) ไม่ใช่ 08:30 ของวันถัดไป

    Raises:
        ValueError: เมื่อ minutes ติดลบ หรือ start เป็น naive datetime
    """
    if minutes < 0:
        raise ValueError("minutes ต้องไม่ติดลบ")

    cursor = next_working_instant(start, cal)
    remaining = int(minutes)
    if remaining == 0:
        return cursor

    for _ in range(_MAX_DAYS_SCAN):
        win = cal.window_of(cursor.date())
        if win is not None:
            win_start, win_end = win
            seg_start = max(cursor, win_start)
            if seg_start < win_end:
                avail = int((win_end - seg_start).total_seconds() // 60)
                if remaining <= avail:
                    return seg_start + timedelta(minutes=remaining)
                remaining -= avail
        cursor = datetime.combine(
            cursor.date() + timedelta(days=1), time(0, 0), tzinfo=cal.tz
        )
    raise CalendarError("คำนวณไม่จบภายใน 10 ปี - ตรวจสอบ business_hours/holiday")


def business_minutes_between(
    start: datetime, end: datetime, cal: BusinessCalendar
) -> int:
    """นับจำนวนนาทีทำการในช่วง [start, end)

    ใช้สำหรับ: เวลาที่ใช้ไปจริง, เวลาที่หยุดนับตอน pending_user,
    และค่าเฉลี่ยเวลาแก้ไขในรายงาน  คืน 0 ถ้า end <= start
    """
    s = _to_local(start, cal.tz)
    e = _to_local(end, cal.tz)
    if e <= s:
        return 0

    total = 0
    cursor_date = s.date()
    last_date = e.date()
    guard = 0
    while cursor_date <= last_date:
        guard += 1
        if guard > _MAX_DAYS_SCAN:
            raise CalendarError("ช่วงเวลาที่ขอกว้างเกิน 10 ปี")
        win = cal.window_of(cursor_date)
        if win is not None:
            win_start, win_end = win
            seg_start = max(s, win_start)
            seg_end = min(e, win_end)
            if seg_end > seg_start:
                total += int((seg_end - seg_start).total_seconds() // 60)
        cursor_date += timedelta(days=1)
    return total


# ============================================================
# ตัวรวม 2 โหมดนาฬิกา
# ============================================================


def add_minutes(
    start: datetime, minutes: int, cal: BusinessCalendar, mode: ClockMode
) -> datetime:
    """บวกเวลาตามโหมดนาฬิกาที่กำหนด

    - ``CALENDAR_24X7`` (P1): บวกเป็นนาทีปฏิทินตรง ๆ ไม่สนใจเวลาทำการหรือวันหยุด
    - ``BUSINESS_HOURS`` (P2-P4): บวกเป็นนาทีทำการ
    """
    if mode is ClockMode.CALENDAR_24X7:
        return start + timedelta(minutes=max(0, minutes))
    return add_business_minutes(start, minutes, cal)


def minutes_between(
    start: datetime, end: datetime, cal: BusinessCalendar, mode: ClockMode
) -> int:
    """นับเวลาที่ผ่านไปตามโหมดนาฬิกา"""
    if mode is ClockMode.CALENDAR_24X7:
        return max(0, int((end - start).total_seconds() // 60))
    return business_minutes_between(start, end, cal)


def compute_due_at(
    clock_start: datetime,
    response_minutes: int,
    resolution_minutes: int,
    cal: BusinessCalendar,
    mode: ClockMode = ClockMode.BUSINESS_HOURS,
    paused_minutes: int = 0,
) -> Tuple[datetime, datetime]:
    """คำนวณกำหนดตอบรับและกำหนดแก้ไขเสร็จของ ticket

    Args:
        clock_start: จุดเริ่มนับจริง — ลำดับความสำคัญคือ
            ``priority_changed_at`` > ``sla_clock_started_at`` > ``created_at``
        mode: โหมดนาฬิกาจาก ``sla_target.clock_mode``
        paused_minutes: ``ticket.pending_duration_minutes``
            บวกเข้าเฉพาะ resolution — response SLA ไม่หยุดนับ

    Returns:
        ``(response_due_at, resolution_due_at)``
    """
    response_due = add_minutes(clock_start, response_minutes, cal, mode)
    resolution_due = add_minutes(
        clock_start, resolution_minutes + max(0, paused_minutes), cal, mode
    )
    return response_due, resolution_due


def elapsed_minutes(
    clock_start: datetime,
    now: datetime,
    cal: BusinessCalendar,
    mode: ClockMode = ClockMode.BUSINESS_HOURS,
    paused_minutes: int = 0,
    pending_started_at: Optional[datetime] = None,
    workaround_at: Optional[datetime] = None,
) -> int:
    """เวลาที่ "เดินไปแล้ว" ของ ticket หนึ่งใบ (หักเวลาที่หยุดนับออก)

    Args:
        workaround_at: ถ้ามี นาฬิกา resolution หยุดที่จุดนี้ถาวร (SLA 5.4)
        pending_started_at: ถ้า ticket กำลังอยู่ ``pending_user``
            ให้ส่งค่ามาด้วย ระบบจะหักช่วงที่กำลังหยุดอยู่ออกให้
    """
    cutoff = min(now, workaround_at) if workaround_at is not None else now
    gross = minutes_between(clock_start, cutoff, cal, mode)
    paused = max(0, paused_minutes)
    if pending_started_at is not None and workaround_at is None:
        paused += minutes_between(pending_started_at, cutoff, cal, mode)
    return max(0, gross - paused)


def sla_status(
    *,
    status: str,
    clock_start: datetime,
    resolution_due_at: Optional[datetime],
    now: datetime,
    cal: BusinessCalendar,
    resolution_minutes: int,
    mode: ClockMode = ClockMode.BUSINESS_HOURS,
    paused_minutes: int = 0,
    pending_started_at: Optional[datetime] = None,
    workaround_at: Optional[datetime] = None,
    exclusion_code: Optional[str] = None,
) -> str:
    """สถานะ SLA ที่แสดงบน UI — ``on_track`` / ``at_risk`` / ``breached`` / ``paused``

    ไม่เก็บลงฐานข้อมูล คำนวณตอนอ่านข้อมูลเสมอ (docs/04-rbac-sla.md v2.0 §4.2)
    """
    if status == "pending_user":
        return "paused"
    if status in ("resolved", "closed", "cancelled") or resolution_due_at is None:
        return "on_track"
    if exclusion_code:
        # ข้อยกเว้นตาม SLA ข้อ 9 — ไม่ตั้งธง breach และไม่นับเข้า KPI
        return "on_track"
    if workaround_at is not None:
        # นาฬิกาหยุดที่ workaround แล้ว — วัดว่าทันหรือไม่ ณ จุดนั้น
        return "breached" if workaround_at > resolution_due_at else "on_track"
    if now > resolution_due_at:
        return "breached"

    used = elapsed_minutes(clock_start, now, cal, mode, paused_minutes, pending_started_at)
    budget = resolution_minutes + max(0, paused_minutes)
    if budget <= 0:
        return "on_track"
    remaining_ratio = 1.0 - (used / budget)
    return "at_risk" if remaining_ratio <= 0.20 else "on_track"


def resume_from_pending(
    *,
    pending_started_at: datetime,
    resumed_at: datetime,
    current_resolution_due_at: datetime,
    current_paused_minutes: int,
    cal: BusinessCalendar,
    mode: ClockMode = ClockMode.BUSINESS_HOURS,
) -> Tuple[int, datetime]:
    """คำนวณค่าใหม่เมื่อ ticket ออกจากสถานะ ``pending_user``

    ใช้กับ ``resolved -> in_progress`` ด้วย (ปิดประเด็น S-03 — สูตรเดียวทั้งระบบ)

    Returns:
        ``(pending_duration_minutes ใหม่, resolution_due_at ใหม่)``
    """
    paused = minutes_between(pending_started_at, resumed_at, cal, mode)
    return (
        current_paused_minutes + paused,
        add_minutes(current_resolution_due_at, paused, cal, mode),
    )


def next_status_report_due(
    last_public_comment_at: datetime,
    interval_minutes: Optional[int],
    cal: BusinessCalendar,
    mode: ClockMode = ClockMode.BUSINESS_HOURS,
) -> Optional[datetime]:
    """รอบรายงานสถานะถัดไป (SLA 5.1)

    ``None`` = รายงานเมื่อสถานะเปลี่ยนเท่านั้น (P3/P4)
    """
    if not interval_minutes:
        return None
    return add_minutes(last_public_comment_at, interval_minutes, cal, mode)


# ============================================================
# Priority matrix (SLA ข้อ 4) — ระบบคำนวณให้ ผู้แจ้งไม่ได้เลือกเอง
# ============================================================

#: impact x urgency -> priority   (docs/04-rbac-sla.md v2.0 §6.1)
PRIORITY_MATRIX: Dict[str, Dict[str, str]] = {
    "org_wide": {"high": "P1", "medium": "P2", "low": "P3"},
    "department": {"high": "P2", "medium": "P3", "low": "P3"},
    "individual": {"high": "P3", "medium": "P3", "low": "P4"},
}


def compute_priority(impact: str, urgency: str) -> str:
    """คำนวณระดับความสำคัญจากผลกระทบและความเร่งด่วน

    Raises:
        ValueError: เมื่อค่า impact หรือ urgency ไม่อยู่ในเมทริกซ์
    """
    try:
        return PRIORITY_MATRIX[impact][urgency]
    except KeyError as exc:
        raise ValueError(
            f"ค่าไม่ถูกต้อง: impact={impact!r} urgency={urgency!r}"
        ) from exc
