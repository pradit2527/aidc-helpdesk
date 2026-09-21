-- ============================================================================
-- 0012_category_scope_sa_ruling — ปรับขอบเขตหมวดหมู่ตามที่ SA ตัดสินใจ (2026-09-18)
--
-- 0010 ปล่อย SOFTWARE_OFFICE และ SOFTWARE_LICENSE ไว้เป็น 'both' รอ SA ชี้ขาด
-- (ดูคอมเมนต์ในไฟล์นั้น) ตอนนี้ SA ตัดสินแล้วว่าทั้งคู่เป็น incident — เหตุผล
-- เต็มอยู่ในคอมเมนต์ข้าง SOFTWARE_OFFICE / SOFTWARE_LICENSE ที่
-- src/db/seed/data/catalog.ts
--
-- แยกเป็นไฟล์ใหม่แทนแก้ 0010 ตรง ๆ เพราะ 0010 ถูก apply ไปแล้วบน dev และมี
-- ALTER TABLE ... ADD CONSTRAINT หลายจุดที่ไม่มี IF NOT EXISTS (Postgres ไม่รองรับ
-- สำหรับ constraint) — แก้เนื้อไฟล์ 0010 จะเปลี่ยน hash แล้วทำให้ migrate()
-- พยายามรันทั้งไฟล์ซ้ำ ซึ่งจะพังตรง ADD CONSTRAINT ที่มีอยู่แล้ว
--
-- UPDATE เดียว ไม่มี DDL จึงไม่ต้องมี snapshot ใหม่ที่ต่างจาก 0011
-- ============================================================================

UPDATE "ticket_category" SET "ticket_type_scope" = 'incident' WHERE "code" IN (
  'SOFTWARE_OFFICE',
  'SOFTWARE_LICENSE'
);
