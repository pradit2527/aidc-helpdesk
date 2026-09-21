-- ============================================================================
-- 0011_unlisted_request_catalog_item — รายการ "อื่น ๆ (ລະບຸເອງ)" ของคำขอบริการ
--
-- แยกจาก 0010 เพราะ 0010 ถูกใช้ไปแล้วบนฐานข้อมูล dev — แก้ไฟล์เดิมหลังถูกใช้แล้ว
-- ทำให้ hash ไม่ตรง แล้ว migrator จะพยายามรันซ้ำทั้งไฟล์
--
-- ── ทำไมเป็น migration ไม่ใช่แค่ seed ──
--
-- ปกติ master data เป็นหน้าที่ของ db/seed ซึ่งรันบนฐานข้อมูลใหม่เท่านั้น
-- แต่แถวนี้เป็น **ของที่โค้ดต้องใช้เพื่อทำงานได้** ไม่ใช่ข้อมูลตัวอย่าง
--
--   CHECK ck_ticket_service_request_needs_catalog (G-14) บังคับว่าคำขอบริการ
--   ทุกใบต้องผูกกับรายการใน catalog ส่วนกฎ "เหตุขัดข้องเป็นของพนักงานเท่านั้น"
--   ทำให้เรื่องจากผู้เข้าชมภายนอกถูกดัดเป็นคำขอบริการโดยที่ไม่มีใครเลือกรายการให้
--   ระบบจึงต้องมีรายการปลายทางไว้เติมให้ ถ้าไม่มี ช่องทาง Support Hub
--   จะสร้างเรื่องไม่ได้เลยและตอบ 422 ทุกครั้ง (ดู CreateTicketUseCase)
--
-- ⚠️ ห้ามลบแถวนี้ทิ้งเมื่อเลิกใช้ — ให้ตั้ง is_active = false แทน
--    ticket เก่าอ้าง catalog_item_id ของมันอยู่
-- ============================================================================

INSERT INTO "service_catalog_item" (
  "company_id", "code", "name_th", "category_id",
  "default_impact", "default_urgency", "default_priority",
  "target_mode", "target_minutes", "clock_start_event",
  "requires_approval", "approval_chain", "is_active"
)
SELECT
  -- ระดับกลุ่ม: ใช้ได้ทุกบริษัทในเครือ ไม่ต้องสร้างซ้ำ 7 แถว
  -- และบริษัทที่เพิ่มเข้ามาใหม่ได้ช่องนี้ทันทีโดยไม่ต้องทำอะไรเพิ่ม
  NULL,
  'SR-OTHER',
  'ອື່ນ ໆ (ລະບຸເອງ)',
  cat."id",
  'individual',
  'low',
  'P4',
  'duration',
  -- 3 วันทำการ — กว้างกว่ารายการมาตรฐานเพราะยังไม่รู้ว่าต้องทำอะไร
  1620,
  -- "ไม่รู้ว่าคืออะไร" = ยังไม่มีใครประเมินว่าทำได้ไหมและใครควรทำ
  -- เวลาที่รอหัวหน้าไอทีอ่านจึงต้องไม่ถูกนับเป็นเวลาของทีม
  'after_approval',
  true,
  'head_of_it',
  true
FROM "ticket_category" cat
WHERE cat."code" = 'OTHER' AND cat."company_id" IS NULL
ON CONFLICT DO NOTHING;

-- ============================================================================
-- down — รันมือเมื่อต้องถอย (NFR-24)
--
-- ⚠️ ถอยได้เฉพาะตอนที่ยังไม่มี ticket ใบไหนอ้างถึงมัน
--    ถ้ามีแล้ว ให้ตั้ง is_active = false แทนการลบ
-- ============================================================================
-- DELETE FROM service_catalog_item
--  WHERE code = 'SR-OTHER' AND company_id IS NULL
--    AND NOT EXISTS (SELECT 1 FROM ticket t WHERE t.catalog_item_id = service_catalog_item.id);
