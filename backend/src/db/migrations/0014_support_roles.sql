
-- ============================================================================
-- 0014_support_roles — แบ่งบทบาทเป็นสองฝั่ง: ผู้ใช้งาน / Helpdesk support
--
--   ฝั่งผู้ใช้งาน   end_user                        (ไม่เปลี่ยน)
--   ฝั่ง Helpdesk   support_lead   หัวหน้าทีม   รับงานเองได้ + มอบหมายให้คนในทีมตนได้
--                   support_agent  ทีม support   รับงานจาก ticket/แชทได้ แต่มอบหมายให้ใครไม่ได้
--   ผู้บริหารระบบ   company_admin · manager_viewer · super_admin  (ไม่เปลี่ยน)
--
-- ทำไมเป็น migration ไม่ใช่แค่ seed
--   production รัน migration ตอนบูตอัตโนมัติ แต่ไม่ได้รัน seed (docs/30-deploy-production.md)
--   และ seed ทำได้แค่ "เพิ่ม/แก้ตามรหัส" — ถ้าปล่อยให้ seed สร้าง support_agent ใหม่ แถว agent เดิม
--   จะค้างอยู่พร้อมผู้ใช้ทุกคนที่ถือมัน แล้วบัญชีเหล่านั้นจะไม่ได้บทบาทใหม่เลย
--
-- เปลี่ยนชื่อแถวเดิม (UPDATE) ไม่ใช่ลบแล้วสร้างใหม่ — user_role อ้าง role.id ผู้ใช้ทุกคนที่ถือ agent
-- จึงกลายเป็น support_agent เองโดยไม่ต้องมอบบทบาทใหม่ และประวัติ/สิทธิ์ที่จำกัดบริษัทคงเดิม
--
-- ไม่ลบแถว role ใด ๆ และไม่ลบ user_role ใด ๆ
-- ============================================================================

-- 1) agent → support_agent (แถวเดิม id เดิม)
UPDATE "role"
SET "code" = 'support_agent',
    "name_th" = 'ທີມ Helpdesk Support',
    "description" = 'ຝັ່ງ Helpdesk — ຮັບວຽກຈາກ ticket ແລະ ແຊັດໄດ້ ແຕ່ມອບໝາຍໃຫ້ຄົນອື່ນບໍ່ໄດ້'
WHERE "code" = 'agent'
  AND NOT EXISTS (SELECT 1 FROM "role" WHERE "code" = 'support_agent');
--> statement-breakpoint

-- 2) บทบาทหัวหน้าทีม
INSERT INTO "role" ("code", "name_th", "description", "is_system")
VALUES (
  'support_lead',
  'ຫົວໜ້າທີມ Helpdesk',
  'ຝັ່ງ Helpdesk — ຮັບວຽກເອງ ແລະ ມອບໝາຍວຽກໃຫ້ຄົນໃນທີມທີ່ຕົນເປັນຫົວໜ້າ',
  true
)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint

-- 3) ทีม support มอบหมายงานให้คนอื่นไม่ได้ — ถอน ticket.assign (ยังเหลือ ticket.assign_self)
DELETE FROM "role_permission"
WHERE "role_id" IN (SELECT "id" FROM "role" WHERE "code" = 'support_agent')
  AND "permission_id" IN (SELECT "id" FROM "permission" WHERE "code" = 'ticket.assign');
--> statement-breakpoint

-- 4) หัวหน้าทีม = สิทธิ์ของทีม support ทุกตัว + ticket.assign
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT lead."id", rp."permission_id"
FROM "role" lead
JOIN "role" agent ON agent."code" = 'support_agent'
JOIN "role_permission" rp ON rp."role_id" = agent."id"
WHERE lead."code" = 'support_lead'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
--> statement-breakpoint

INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT lead."id", p."id"
FROM "role" lead
JOIN "permission" p ON p."code" = 'ticket.assign'
WHERE lead."code" = 'support_lead'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
--> statement-breakpoint

-- 5) คนที่เป็นหัวหน้าของทีมที่เปิดใช้งานอยู่ และถือ support_agent → ยกเป็น support_lead
--    (เปลี่ยน role_id ของแถวเดิม จึงคงวันหมดอายุและขอบเขตบริษัทที่ผูกกับแถวนั้นไว้ครบ)
--    คนที่ถือบทบาทอื่นอยู่ด้วย (เช่น super_admin) ไม่ถูกแตะ
UPDATE "user_role" ur
SET "role_id" = lead."id"
FROM "role" lead, "role" agent
WHERE lead."code" = 'support_lead'
  AND agent."code" = 'support_agent'
  AND ur."role_id" = agent."id"
  AND EXISTS (
    SELECT 1
    FROM "support_team_member" m
    JOIN "support_team" t ON t."id" = m."team_id"
    WHERE m."user_id" = ur."user_id" AND m."is_lead" = true AND t."is_active" = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM "user_role" x WHERE x."user_id" = ur."user_id" AND x."role_id" = lead."id"
  );
--> statement-breakpoint

-- 6) ข้อมูลที่เก็บรหัสบทบาทเป็นข้อความ (ไม่มี foreign key) — ต้องตามไปเปลี่ยนเอง
UPDATE "checklist_item"
SET "default_role_code" = 'support_agent'
WHERE "default_role_code" = 'agent';
--> statement-breakpoint

UPDATE "sla_escalation_rule"
SET "notify_roles" = array_to_string(
  ARRAY(
    SELECT CASE WHEN btrim(u.t) = 'agent' THEN 'support_agent' ELSE btrim(u.t) END
    FROM unnest(string_to_array("notify_roles", ',')) WITH ORDINALITY AS u(t, n)
    ORDER BY u.n
  ),
  ','
)
WHERE "notify_roles" ~ '(^|,)[[:space:]]*agent[[:space:]]*(,|$)';
