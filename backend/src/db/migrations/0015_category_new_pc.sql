-- ── ຕຽມຄອມພິວເຕີໃຫ້ພະນັກງານໃໝ່ — หมวดย่อยใหม่ของคำขอบริการ ─────────────────
--
-- แยกจาก LIFECYCLE_ONBOARD ที่เป็นเรื่องบัญชีและสิทธิ์ เพราะงานสองอย่างนี้
-- คนละคนทำและคนละกำหนดเวลา เครื่องต้องเบิก ลงภาพระบบ ลงซอฟต์แวร์ แล้วเข้าทะเบียนทรัพย์สิน
-- ถ้ารวมอยู่หมวดเดียวจะวัดไม่ได้ว่าการรับพนักงานใหม่ช้าที่ขั้นไหน
--
-- ⚠️ ไฟล์นี้เติมของใหม่อย่างเดียว ไม่แตะแถวเดิมสักแถว
--    ฐานข้อมูลที่ seed ไปแล้วจะไม่ได้หมวดนี้จาก data/catalog.ts เพราะ seed ไม่เคยรันซ้ำ
--    บน production — ทั้งสองที่จึงต้องบอกเรื่องเดียวกัน (ดู data/catalog.spec.ts)

-- ── 1. เพิ่มหมวดย่อยใต้ LIFECYCLE ────────────────────────────────────────
INSERT INTO "ticket_category"
  ("company_id", "parent_id", "code", "name_th", "default_impact", "default_urgency", "ticket_type_scope", "sort_order", "is_active")
SELECT NULL, p."id", v.code, v.name_th, v.impact, v.urgency, v.scope, v.sort_order, true
FROM (VALUES
  ('LIFECYCLE', 'LIFECYCLE_NEW_PC', 'ຕຽມຄອມພິວເຕີໃຫ້ພະນັກງານໃໝ່', 'individual', 'medium', 'service_request', 15)
) AS v(parent_code, code, name_th, impact, urgency, scope, sort_order)
JOIN "ticket_category" p ON p."company_id" IS NULL AND p."code" = v.parent_code
WHERE NOT EXISTS (
  SELECT 1 FROM "ticket_category" c WHERE c."company_id" IS NULL AND c."code" = v.code
);
--> statement-breakpoint

-- ── 2. ขอบเขตชนิดของเรื่อง ───────────────────────────────────────────────
-- เผื่อฐานข้อมูลที่มีแถวนี้อยู่ก่อนแล้ว (ผู้ดูแลเพิ่มเองผ่านหน้าจอ) จะได้ไม่ค้างเป็น both
-- แล้วโผล่ในแบบฟอร์มฝั่งเหตุขัดข้องด้วย
UPDATE "ticket_category" SET "ticket_type_scope" = 'service_request' WHERE "code" IN ('LIFECYCLE_NEW_PC');
