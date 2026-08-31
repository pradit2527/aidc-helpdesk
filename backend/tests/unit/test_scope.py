"""ทดสอบขอบเขตการมองเห็นข้อมูล — ส่วนที่สำคัญที่สุดของระบบ (TR-01)

ทดสอบสองระดับ:
1. ตรรกะของ AccessScope โดยตรง
2. **SQL ที่ TicketRepository สร้างจริง** — คอมไพล์เป็น PostgreSQL แล้วอ่าน WHERE
   วิธีนี้จับได้แม้กรณีที่ตรรกะถูกแต่ลืมใส่เงื่อนไขลงใน query

รันได้ 2 แบบ:
    pytest backend/tests/unit/test_scope.py -q
    python  backend/tests/unit/test_scope.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.dialects import postgresql  # noqa: E402

from app.core.errors import AppError  # noqa: E402
from app.core.scope import AccessScope  # noqa: E402
from app.models.ticket import Ticket  # noqa: E402
from app.repositories.ticket_repo import TicketRepository  # noqa: E402

COMPANY_A, COMPANY_B = 7, 2

AGENT_PERMS = frozenset({"ticket.read", "ticket.comment", "ticket.assign"})
END_USER_PERMS = frozenset({"ticket.create", "ticket.comment"})


def scope(
    *,
    user_id: int = 100,
    companies: set[int] | None = None,
    perms: frozenset[str] = END_USER_PERMS,
    super_admin: bool = False,
    contacts: set[str] | None = None,
) -> AccessScope:
    return AccessScope(
        user_id=user_id,
        home_company_id=COMPANY_A,
        company_ids=frozenset(companies or {COMPANY_A}),
        permissions=perms,
        is_super_admin=super_admin,
        contact_keys=frozenset(contacts or set()),
    )


def where_sql(s: AccessScope) -> str:
    """คอมไพล์ query ที่ repository สร้างจริงเป็น SQL ของ PostgreSQL"""
    repo = TicketRepository(db=None, scope=s)  # type: ignore[arg-type]
    stmt = repo._apply_scope(select(Ticket.id).where(Ticket.deleted_at.is_(None)))
    sql = str(stmt.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
    return " ".join(sql.split())


# ══════════════════════ ตรรกะของ AccessScope ══════════════════════


def test_end_user_has_no_ticket_read():
    """end_user ไม่มี ticket.read — จึงตกไปเส้นทาง "เฉพาะเรื่องของตน" """
    assert scope().has("ticket.read") is False


def test_require_raises_forbidden():
    """require() ที่ไม่ผ่านต้องโยน FORBIDDEN ไม่ใช่คืน False เงียบ ๆ"""
    try:
        scope().require("ticket.assign")
    except AppError as exc:
        assert exc.code == "FORBIDDEN" and exc.http_status == 403
        return
    raise AssertionError("ควรโยน AppError")


def test_super_admin_bypasses_permission_check():
    assert scope(super_admin=True, perms=frozenset()).has("อะไรก็ได้") is True


def test_out_of_scope_company_is_dropped_silently():
    """US-07 AC-2 — ขอบริษัทอื่นมา ต้องถูกตัดทิ้ง ไม่ใช่ตอบ error"""
    s = scope(companies={COMPANY_A}, perms=AGENT_PERMS)
    assert s.visible_company_ids([COMPANY_B]) == frozenset()
    assert s.visible_company_ids([COMPANY_A, COMPANY_B]) == frozenset({COMPANY_A})


def test_no_filter_returns_full_scope():
    s = scope(companies={COMPANY_A, COMPANY_B}, perms=AGENT_PERMS)
    assert s.visible_company_ids(None) == frozenset({COMPANY_A, COMPANY_B})


def test_super_admin_sees_requested_companies():
    s = scope(super_admin=True)
    assert s.visible_company_ids([COMPANY_B]) == frozenset({COMPANY_B})
    assert s.visible_company_ids(None) == frozenset()  # ว่าง = ไม่จำกัด


def test_in_scope():
    s = scope(companies={COMPANY_A}, perms=AGENT_PERMS)
    assert s.in_scope(COMPANY_A) is True
    assert s.in_scope(COMPANY_B) is False
    assert scope(super_admin=True).in_scope(999) is True


# ══════════════════════ เหตุความปลอดภัย (SOP-10 ข้อ 2) ══════════════════════


def test_security_incident_visible_to_requester_and_assignee():
    s = scope(user_id=100, perms=AGENT_PERMS)
    assert s.can_see_security_incident(
        requester_id=100, assignee_id=None, incident_commander_id=None
    )
    assert scope(user_id=200, perms=AGENT_PERMS).can_see_security_incident(
        requester_id=100, assignee_id=200, incident_commander_id=None
    )


def test_security_incident_hidden_from_other_agents_in_same_company():
    """company_admin และ agent คนอื่นในบริษัทเดียวกันต้องไม่เห็น"""
    other = scope(user_id=999, companies={COMPANY_A}, perms=AGENT_PERMS)
    assert (
        other.can_see_security_incident(
            requester_id=100, assignee_id=200, incident_commander_id=300
        )
        is False
    )


def test_security_incident_visible_to_head_of_it_ceo_dpo():
    for key in ("head_of_it", "ceo", "dpo"):
        s = scope(user_id=999, perms=AGENT_PERMS, contacts={key})
        assert s.can_see_security_incident(
            requester_id=100, assignee_id=200, incident_commander_id=None
        ), key


def test_incident_manager_alone_cannot_see_security_incident():
    """incident_manager ดูแลเหตุร้ายแรงทั่วไป แต่ไม่ใช่ผู้รับแจ้งของ SOP-10"""
    s = scope(user_id=999, perms=AGENT_PERMS, contacts={"incident_manager"})
    assert (
        s.can_see_security_incident(
            requester_id=100, assignee_id=200, incident_commander_id=None
        )
        is False
    )


# ══════════════════════ SQL ที่ repository สร้างจริง ══════════════════════


def test_sql_end_user_filters_by_own_tickets_only():
    sql = where_sql(scope(user_id=100))
    assert "ticket.requester_id = 100" in sql
    assert "ticket.created_by = 100" in sql
    assert "company_id IN" not in sql, "end_user ต้องไม่ถูกกรองด้วยบริษัท"


def test_sql_agent_filters_by_company():
    sql = where_sql(scope(user_id=100, companies={COMPANY_A, COMPANY_B}, perms=AGENT_PERMS))
    assert "ticket.company_id IN (2, 7)" in sql or "ticket.company_id IN (7, 2)" in sql
    assert "requester_id" in sql, "ยังต้องมีเงื่อนไขเหตุความปลอดภัย"


def test_sql_super_admin_has_no_extra_filter():
    sql = where_sql(scope(super_admin=True))
    assert "company_id" not in sql
    assert "is_security_incident" not in sql
    assert "deleted_at IS NULL" in sql


def test_sql_always_excludes_soft_deleted():
    """ทุก role ต้องมี deleted_at IS NULL เสมอ"""
    for s in (
        scope(),
        scope(perms=AGENT_PERMS),
        scope(super_admin=True),
        scope(perms=AGENT_PERMS, contacts={"head_of_it"}),
    ):
        assert "deleted_at IS NULL" in where_sql(s)


def test_sql_includes_security_incident_guard_for_normal_agent():
    sql = where_sql(scope(user_id=100, perms=AGENT_PERMS))
    assert "is_security_incident IS false" in sql or "is_security_incident = false" in sql


def test_sql_head_of_it_skips_security_guard():
    """ผู้ถือตำแหน่ง head_of_it เห็นได้ทุกใบในขอบเขต จึงไม่ต้องมีเงื่อนไขนี้"""
    sql = where_sql(scope(user_id=100, perms=AGENT_PERMS, contacts={"head_of_it"}))
    assert "is_security_incident" not in sql
    assert "ticket.company_id IN" in sql


def test_repository_without_scope_is_a_type_error():
    """ลืมใส่ scope ต้องพังตั้งแต่ตอนเขียนโค้ด ไม่ใช่ตอน production"""
    try:
        TicketRepository(db=None)  # type: ignore[call-arg]
    except TypeError:
        return
    raise AssertionError("ScopedRepository ต้องบังคับรับ AccessScope")


# ══════════════════════ runner ══════════════════════

if __name__ == "__main__":
    tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
    passed, failed = 0, []
    print(f"{'เคส':<58} {'ผล':<6} คำอธิบาย")
    print("-" * 112)
    for name, fn in tests:
        doc = (fn.__doc__ or "").strip().splitlines()[0] if fn.__doc__ else ""
        try:
            fn()
            passed += 1
            print(f"{name:<58} {'PASS':<6} {doc}")
        except Exception as exc:  # noqa: BLE001
            failed.append(name)
            print(f"{name:<58} {'FAIL':<6} {doc}  -> {exc}")
    print("-" * 112)
    print(f"รวม {len(tests)} เคส · ผ่าน {passed} · ล้มเหลว {len(failed)}")
    sys.exit(1 if failed else 0)
