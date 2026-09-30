-- ── Magic-Budget — โมดูลที่ห้าของ Magic ────────────────────────────────────
--
-- หมวดย่อยของ Magic ตั้งชื่อตาม "โมดูล" ไม่ใช่ "อาการ" (ดูคอมเมนต์ใน data/catalog.ts)
-- ทั้งเหตุขัดข้องและคำขอบริการของโมดูลนี้จึงแจ้งเข้าช่องเดียวกัน = ขอบเขต both
-- เหมือนพี่น้องอีกสี่แถว
--
-- ⚠️ เติมของใหม่อย่างเดียว ไม่แตะแถวเดิมของกลุ่ม Magic สักแถว
--    migration 0013 จงใจไม่ยุ่งกับระบบงานของกลุ่ม (Magic · ILP · APS · CMS …)
--    ข้อนั้นคือ "ห้ามย้ายหรือแก้ของเดิม" ไม่ใช่ห้ามเพิ่มโมดูลใหม่ที่ธุรกิจขอมา

INSERT INTO "ticket_category"
  ("company_id", "parent_id", "code", "name_th", "default_impact", "default_urgency", "ticket_type_scope", "sort_order", "is_active")
SELECT NULL, p."id", v.code, v.name_th, v.impact, v.urgency, v.scope, v.sort_order, true
FROM (VALUES
  ('MAGIC', 'MAGIC_BUDGET', 'Magic-Budget', 'department', 'medium', 'both', 50)
) AS v(parent_code, code, name_th, impact, urgency, scope, sort_order)
JOIN "ticket_category" p ON p."company_id" IS NULL AND p."code" = v.parent_code
WHERE NOT EXISTS (
  SELECT 1 FROM "ticket_category" c WHERE c."company_id" IS NULL AND c."code" = v.code
);
