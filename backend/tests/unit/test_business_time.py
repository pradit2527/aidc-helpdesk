"""ชุดทดสอบ SLA engine — ตรงกับตารางใน docs/11-sla-engine.md v2.0 §5

รันได้ 2 แบบ:
    pytest backend/tests/unit/test_business_time.py -q
    python  backend/tests/unit/test_business_time.py      (มี runner ในไฟล์)

วันอ้างอิง: 2026-08-31 = จันทร์ · 2026-09-04 = ศุกร์ · 2026-09-05 = เสาร์
           2026-09-06 = อาทิตย์ · 2026-08-11 = อังคาร · 2026-08-28 = ศุกร์
"""

from __future__ import annotations

import sys
from datetime import date, datetime, time
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.services.sla.business_time import (  # noqa: E402
    BUSINESS_DAY_MINUTES,
    BusinessCalendar,
    ClockMode,
    WorkingWindow,
    add_business_minutes,
    add_minutes,
    business_minutes_between,
    compute_due_at,
    compute_priority,
    default_calendar,
    elapsed_minutes,
    next_status_report_due,
    next_working_instant,
    resume_from_pending,
    sla_status,
)

BKK = ZoneInfo("Asia/Bangkok")
CAL = default_calendar()


def dt(y: int, m: int, d: int, hh: int = 0, mm: int = 0) -> datetime:
    return datetime(y, m, d, hh, mm, tzinfo=BKK)


def iso(x: datetime) -> str:
    return x.astimezone(BKK).strftime("%Y-%m-%d %H:%M")


# ══════════════════════ เคสที่ยกมาจาก v1.0 (ค่าคาดหวังใหม่) ══════════════════════


def test_t01_p1_calendar_same_day():
    """T-01 P1 นับต่อเนื่องในวันเดียว"""
    got = add_minutes(dt(2026, 8, 31, 9, 0), 240, CAL, ClockMode.CALENDAR_24X7)
    assert iso(got) == "2026-08-31 13:00"


def test_t02_p2_crosses_weekend():
    """T-02 P2 ศุกร์ 16:00 + 480 นาทีทำการ -> จันทร์ 15:00 (ศ. 90 + จ. 390)"""
    got = add_business_minutes(dt(2026, 9, 4, 16, 0), 480, CAL)
    assert iso(got) == "2026-09-07 15:00"


def test_t03_start_on_saturday():
    """T-03 เสาร์ไม่ใช่วันทำการแล้ว -> เลื่อนไปเริ่มจันทร์ 08:30"""
    got = add_business_minutes(dt(2026, 9, 5, 16, 30), 480, CAL)
    assert iso(got) == "2026-09-07 16:30"


def test_t04_start_on_sunday():
    """T-04 อาทิตย์ + 1080 (P3) -> อังคาร 17:30"""
    got = add_business_minutes(dt(2026, 9, 6, 10, 0), 1080, CAL)
    assert iso(got) == "2026-09-08 17:30"


def test_t05_before_opening():
    """T-05 จันทร์ 07:00 + 2700 (P4 = 5 วันทำการ) -> ศุกร์ 17:30"""
    got = add_business_minutes(dt(2026, 8, 31, 7, 0), 2700, CAL)
    assert iso(got) == "2026-09-04 17:30"


def test_t06_after_closing():
    """T-06 จันทร์ 19:00 + 240 -> อังคาร 12:30"""
    got = add_business_minutes(dt(2026, 8, 31, 19, 0), 240, CAL)
    assert iso(got) == "2026-09-01 12:30"


def test_t07_skips_two_holidays():
    """T-07 อังคาร 16:00 + 120 โดยหยุด 12-13 ส.ค. -> ศุกร์ 14 ส.ค. 09:00"""
    cal = default_calendar(frozenset({date(2026, 8, 12), date(2026, 8, 13)}))
    got = add_business_minutes(dt(2026, 8, 11, 16, 0), 120, cal)
    assert iso(got) == "2026-08-14 09:00"


def test_t08_exact_fit_returns_closing_time():
    """T-08 08:30 + 540 -> 17:30 ของวันเดียวกัน ไม่ใช่ 08:30 วันถัดไป"""
    got = add_business_minutes(dt(2026, 8, 31, 8, 30), BUSINESS_DAY_MINUTES, CAL)
    assert iso(got) == "2026-08-31 17:30"


def test_t09_add_zero_outside_hours():
    """T-09 บวก 0 นาทีนอกเวลาทำการ = จุดเริ่มนับจริง"""
    got = add_business_minutes(dt(2026, 9, 6, 10, 0), 0, CAL)
    assert iso(got) == "2026-09-07 08:30"


def test_t10_between_clamps_to_window():
    """T-10 07:00 -> 18:00 ในวันทำการ = 540 นาที"""
    assert business_minutes_between(dt(2026, 8, 31, 7, 0), dt(2026, 8, 31, 18, 0), CAL) == 540


def test_t11_between_across_weekend():
    """T-11 ศุกร์ 17:00 -> จันทร์ 09:00 = 30 + 30 = 60"""
    assert business_minutes_between(dt(2026, 9, 4, 17, 0), dt(2026, 9, 7, 9, 0), CAL) == 60


def test_t12_end_before_start():
    """T-12 ช่วงย้อนหลังคืน 0 ไม่ติดลบ"""
    assert business_minutes_between(dt(2026, 8, 31, 9, 0), dt(2026, 8, 29, 9, 0), CAL) == 0


def test_t13_add_and_between_are_inverse():
    """T-13 add แล้ว between กลับต้องได้เท่าเดิม"""
    start = dt(2026, 8, 28, 16, 45)
    due = add_business_minutes(start, 1000, CAL)
    assert iso(due) == "2026-09-01 15:25"
    assert business_minutes_between(start, due, CAL) == 1000


def test_t14_compute_due_p2():
    """T-14 P2 (30 / 480) สร้างจันทร์ 09:15"""
    resp, reso = compute_due_at(dt(2026, 8, 31, 9, 15), 30, 480, CAL)
    assert iso(resp) == "2026-08-31 09:45"
    assert iso(reso) == "2026-08-31 17:15"


def test_t15_pause_shifts_resolution_only():
    """T-15 pause 540 เลื่อนเฉพาะ resolution — response ไม่ขยับ"""
    resp, reso = compute_due_at(dt(2026, 8, 31, 9, 0), 120, 1080, CAL, paused_minutes=540)
    assert iso(resp) == "2026-08-31 11:00"
    assert iso(reso) == "2026-09-03 09:00"


def test_t16_pause_resume_two_rounds():
    """T-16 หยุด 2 รอบ รวม 1080 นาทีทำการ"""
    base_due = add_business_minutes(dt(2026, 8, 31, 9, 0), 1080, CAL)
    assert iso(base_due) == "2026-09-02 09:00"

    paused1, due1 = resume_from_pending(
        pending_started_at=dt(2026, 9, 1, 9, 0),
        resumed_at=dt(2026, 9, 2, 9, 0),
        current_resolution_due_at=base_due,
        current_paused_minutes=0,
        cal=CAL,
    )
    assert paused1 == 540
    assert iso(due1) == "2026-09-03 09:00"

    paused2, due2 = resume_from_pending(
        pending_started_at=dt(2026, 9, 3, 9, 0),
        resumed_at=dt(2026, 9, 4, 9, 0),
        current_resolution_due_at=due1,
        current_paused_minutes=paused1,
        cal=CAL,
    )
    assert paused2 == 1080
    assert iso(due2) == "2026-09-04 09:00"


def test_t16e_incremental_equals_recompute():
    """T-16e เลื่อนทีละรอบ == คำนวณใหม่ทั้งก้อน (คุณสมบัติ associative)"""
    start = dt(2026, 8, 31, 9, 0)
    incremental = add_business_minutes(add_business_minutes(start, 1080, CAL), 540, CAL)
    whole = add_business_minutes(start, 1080 + 540, CAL)
    assert incremental == whole


def test_t17_change_priority_counts_from_change_time():
    """T-17 เปลี่ยนระดับ -> นับใหม่จากเวลาที่ปรับ ไม่ใช่จาก created_at (G-08)"""
    changed_at = dt(2026, 9, 1, 10, 0)
    resp, reso = compute_due_at(changed_at, 30, 480, CAL)
    assert iso(resp) == "2026-09-01 10:30"
    assert iso(reso) == "2026-09-02 09:00"


def test_t18_elapsed_minus_pause():
    """T-18 elapsed ดิบ 1080 หัก pause 540 เหลือ 540"""
    start, now = dt(2026, 8, 31, 9, 0), dt(2026, 9, 2, 9, 0)
    assert business_minutes_between(start, now, CAL) == 1080
    assert elapsed_minutes(start, now, CAL, paused_minutes=540) == 540


def test_t19_elapsed_while_pending():
    """T-19 กำลัง pending อยู่ ต้องหักช่วงที่หยุดออกด้วย"""
    got = elapsed_minutes(
        dt(2026, 8, 31, 9, 0),
        dt(2026, 9, 1, 9, 0),
        CAL,
        pending_started_at=dt(2026, 8, 31, 15, 0),
    )
    assert got == 360


def test_t20_sla_status_four_values():
    """T-20 สถานะ SLA ครบ 4 ค่า"""
    start = dt(2026, 8, 31, 9, 0)
    due = add_business_minutes(start, 480, CAL)  # จ. 17:00

    common = dict(clock_start=start, resolution_due_at=due, cal=CAL, resolution_minutes=480)

    assert sla_status(status="in_progress", now=dt(2026, 8, 31, 10, 0), **common) == "on_track"
    assert sla_status(status="in_progress", now=dt(2026, 8, 31, 16, 30), **common) == "at_risk"
    assert sla_status(status="in_progress", now=dt(2026, 9, 1, 9, 0), **common) == "breached"
    assert sla_status(status="pending_user", now=dt(2026, 8, 31, 10, 0), **common) == "paused"


def test_t21_accepts_utc_input():
    """T-21 รับ UTC แล้วคำนวณในโซนไทยได้ถูก"""
    utc_in = datetime(2026, 8, 31, 2, 0, tzinfo=ZoneInfo("UTC"))
    got = add_minutes(utc_in, 240, CAL, ClockMode.CALENDAR_24X7)
    assert iso(got) == "2026-08-31 13:00"


def test_t22_company_specific_calendar():
    """T-22 ปฏิทินเฉพาะบริษัท จ.-ศ. 09:00-18:00"""
    win = WorkingWindow(time(9, 0), time(18, 0))
    cal = BusinessCalendar(windows={i: win for i in range(1, 6)})
    got = add_business_minutes(dt(2026, 9, 4, 17, 0), 120, cal)
    assert iso(got) == "2026-09-07 10:00"


def test_t23_rejects_naive_datetime():
    """T-23 naive datetime ต้องโยน ValueError"""
    try:
        add_business_minutes(datetime(2026, 8, 31, 9, 0), 60, CAL)
    except ValueError:
        return
    raise AssertionError("ควรโยน ValueError เมื่อได้รับ naive datetime")


# ══════════════════════ เคสใหม่ของ v2.0 ══════════════════════


def test_t24_p1_calendar_crosses_weekend():
    """T-24 P1 เสาร์ 22:00 + 240 ปฏิทิน -> อาทิตย์ 02:00"""
    got = add_minutes(dt(2026, 9, 5, 22, 0), 240, CAL, ClockMode.CALENDAR_24X7)
    assert iso(got) == "2026-09-06 02:00"


def test_t25_p1_vs_p2_same_start():
    """T-25 เวลาเริ่มเดียวกัน แต่คนละโหมดนาฬิกา ได้กำหนดต่างกันมาก"""
    start = dt(2026, 9, 4, 16, 0)
    p1 = add_minutes(start, 240, CAL, ClockMode.CALENDAR_24X7)
    p2 = add_minutes(start, 480, CAL, ClockMode.BUSINESS_HOURS)
    assert iso(p1) == "2026-09-04 20:00"
    assert iso(p2) == "2026-09-07 15:00"


def test_t26_workaround_stops_clock():
    """T-26 บันทึก workaround ก่อนครบกำหนด -> ไม่ breach แม้เวลาผ่านไปแล้ว"""
    start = dt(2026, 8, 31, 9, 0)
    due = dt(2026, 8, 31, 13, 0)
    got = sla_status(
        status="in_progress", clock_start=start, resolution_due_at=due,
        now=dt(2026, 8, 31, 16, 0), cal=CAL, resolution_minutes=240,
        workaround_at=dt(2026, 8, 31, 12, 0),
    )
    assert got == "on_track"


def test_t27_workaround_after_due_is_breached():
    """T-27 workaround หลังเลยกำหนดแล้ว ยังนับเป็น breach"""
    got = sla_status(
        status="in_progress", clock_start=dt(2026, 8, 31, 9, 0),
        resolution_due_at=dt(2026, 8, 31, 13, 0), now=dt(2026, 8, 31, 16, 0),
        cal=CAL, resolution_minutes=240, workaround_at=dt(2026, 8, 31, 14, 0),
    )
    assert got == "breached"


def test_t28_exclusion_skips_evaluation():
    """T-28 ticket ที่มีข้อยกเว้นตาม SLA ข้อ 9 ไม่ถูกตั้งธง breach"""
    got = sla_status(
        status="in_progress", clock_start=dt(2026, 8, 31, 9, 0),
        resolution_due_at=dt(2026, 8, 31, 13, 0), now=dt(2026, 9, 3, 9, 0),
        cal=CAL, resolution_minutes=240, exclusion_code="vendor_delay",
    )
    assert got == "on_track"


def test_t29_clock_starts_after_approval():
    """T-29 SR-ACCESS 540 นาทีทำการ เริ่มนับหลังอนุมัติครบ พุธ 14:00"""
    got = add_business_minutes(dt(2026, 9, 2, 14, 0), 540, CAL)
    assert iso(got) == "2026-09-03 14:00"


def test_t30_saturday_is_not_working_day_regression():
    """T-30 regression ของ G-01 — เสาร์ต้องถูกข้าม"""
    got = add_business_minutes(dt(2026, 9, 5, 10, 0), 60, CAL)
    assert iso(got) == "2026-09-07 09:30"
    assert CAL.day_minutes(date(2026, 9, 5)) == 0
    assert CAL.day_minutes(date(2026, 9, 7)) == BUSINESS_DAY_MINUTES


def test_t31_resolved_to_in_progress_uses_pause_formula():
    """T-31 กลับจาก resolved ใช้สูตรเดียวกับ pause (ปิด S-03)"""
    paused, due = resume_from_pending(
        pending_started_at=dt(2026, 8, 31, 10, 0),
        resumed_at=dt(2026, 9, 1, 10, 0),
        current_resolution_due_at=dt(2026, 9, 2, 9, 0),
        current_paused_minutes=0,
        cal=CAL,
    )
    assert paused == 540
    assert iso(due) == "2026-09-03 09:00"


def test_t32_status_report_p1():
    """T-32 รอบรายงาน P1 ทุก 1 ชั่วโมง (ปฏิทิน)"""
    got = next_status_report_due(dt(2026, 8, 31, 9, 0), 60, CAL, ClockMode.CALENDAR_24X7)
    assert got is not None and iso(got) == "2026-08-31 10:00"


def test_t33_status_report_p2():
    """T-33 รอบรายงาน P2 ทุก 4 ชั่วโมงทำการ — ข้ามคืนไปวันถัดไป"""
    # จันทร์ 15:00 -> 17:30 = 150 นาที · เหลือ 90 · อังคาร 08:30 + 90 = 10:00
    got = next_status_report_due(dt(2026, 8, 31, 15, 0), 240, CAL)
    assert got is not None and iso(got) == "2026-09-01 10:00"


def test_t34_status_report_none_for_p3_p4():
    """T-33b P3/P4 ไม่มีรอบรายงาน — รายงานเมื่อสถานะเปลี่ยนเท่านั้น"""
    assert next_status_report_due(dt(2026, 8, 31, 15, 0), None, CAL) is None


def test_t37_one_business_day_is_540():
    """T-37 1 วันทำการ = 540 นาทีทำการ (ปิด S-02)"""
    assert BUSINESS_DAY_MINUTES == 540
    got = add_business_minutes(dt(2026, 8, 31, 8, 30), BUSINESS_DAY_MINUTES, CAL)
    assert iso(got) == "2026-08-31 17:30"


def test_t38_priority_matrix_all_nine_cells():
    """T-38 เมทริกซ์ผลกระทบ x ความเร่งด่วน ครบ 9 ช่อง (SLA ข้อ 4)"""
    expected = {
        ("org_wide", "high"): "P1",
        ("org_wide", "medium"): "P2",
        ("org_wide", "low"): "P3",
        ("department", "high"): "P2",
        ("department", "medium"): "P3",
        ("department", "low"): "P3",
        ("individual", "high"): "P3",
        ("individual", "medium"): "P3",
        ("individual", "low"): "P4",
    }
    for (impact, urgency), want in expected.items():
        assert compute_priority(impact, urgency) == want, f"{impact} x {urgency}"

    try:
        compute_priority("whole_planet", "high")
    except ValueError:
        return
    raise AssertionError("ควรโยน ValueError เมื่อค่าไม่อยู่ในเมทริกซ์")


def test_next_working_instant_inside_window_returns_same():
    """เวลาที่อยู่ในเวลาทำการอยู่แล้วต้องคืนค่าเดิม"""
    x = dt(2026, 8, 31, 10, 0)
    assert next_working_instant(x, CAL) == x


# ══════════════════════ runner สำหรับรันตรงโดยไม่ต้องมี pytest ══════════════════════

if __name__ == "__main__":
    tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
    passed, failed = 0, []
    print(f"{'เคส':<52} {'ผล':<6} คำอธิบาย")
    print("-" * 110)
    for name, fn in tests:
        doc = (fn.__doc__ or "").strip().splitlines()[0] if fn.__doc__ else ""
        try:
            fn()
            passed += 1
            print(f"{name:<52} {'PASS':<6} {doc}")
        except Exception as exc:  # noqa: BLE001
            failed.append((name, exc))
            print(f"{name:<52} {'FAIL':<6} {doc}  -> {exc}")
    print("-" * 110)
    print(f"รวม {len(tests)} เคส · ผ่าน {passed} · ล้มเหลว {len(failed)}")
    sys.exit(1 if failed else 0)
