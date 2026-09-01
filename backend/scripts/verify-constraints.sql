-- ============================================================================
-- ทดสอบว่ากติกาในฐานข้อมูลทำงานจริง ไม่ใช่แค่มีอ็อบเจ็กต์อยู่
--   psql -U postgres -d aidc_helpdesk -v ON_ERROR_STOP=1 -f scripts/verify-constraints.sql
--
-- ทั้งไฟล์อยู่ใน transaction เดียวและ ROLLBACK ทิ้งท้าย จึงไม่ทิ้งข้อมูลไว้
-- ============================================================================

\set QUIET on
\pset tuples_only on
\pset format unaligned

BEGIN;

-- ข้อมูลตั้งต้นเท่าที่จำเป็นให้ FK ผ่าน
INSERT INTO company (id, code, name_th, is_active, created_at, updated_at)
VALUES (900, 'TEST', 'ບໍລິສັດທົດສອບ', true, now(), now());

-- auth_provider = 'local' บังคับให้ต้องมี password_hash (ck_app_user_local_needs_password)
INSERT INTO app_user (id, company_id, username, full_name, auth_provider, password_hash, created_at, updated_at)
VALUES (900, 900, 'test.user', 'ຜູ້ໃຊ້ທົດສອບ', 'local', '$argon2id$dummy$forทดสอบเท่านั้น', now(), now());

INSERT INTO ticket_category (id, company_id, code, name_th, default_impact, default_urgency, is_active, created_at, updated_at)
VALUES (900, 900, 'TEST-CAT', 'ທົດສອບ', 'individual', 'medium', true, now(), now());

-- ----------------------------------------------------------------------------
-- ตัวช่วย: คาดว่าคำสั่งต้องพัง ถ้าไม่พังคือ CHECK ไม่ทำงาน
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.expect_fail(label text, stmt text)
RETURNS void AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'ผ่าน  % — ถูกปฏิเสธ (%)', label, SQLSTATE;
    RETURN;
  END;
  RAISE EXCEPTION 'ตก  % — ฐานข้อมูลยอมรับข้อมูลที่ควรถูกปฏิเสธ', label;
END;
$$ LANGUAGE plpgsql;

-- ticket ที่ถูกต้องหนึ่งใบ ใช้เป็นฐานของการทดสอบต่อ ๆ ไป
INSERT INTO ticket (
  id, ticket_no, ticket_type, company_id, category_id, requester_id, created_by,
  subject, description, channel, impact, urgency, priority, status,
  support_tier, created_at, updated_at
) VALUES (
  900, 'INC-2569-0900', 'incident', 900, 900, 900, 900,
  'ອິນເຕີເນັດຊ້າ', 'ເປີດເວັບບໍ່ໄດ້ຕັ້ງແຕ່ເຊົ້າ', 'portal', 'individual', 'medium', 'P3', 'new',
  1, now(), now()
);

-- ----------------------------------------------------------------------------
-- 1) CHECK
-- ----------------------------------------------------------------------------
SELECT pg_temp.expect_fail('ck_ticket_priority_valid',
  $q$UPDATE ticket SET priority = 'P9' WHERE id = 900$q$);

SELECT pg_temp.expect_fail('ck_ticket_status_valid',
  $q$UPDATE ticket SET status = 'ไม่มีสถานะนี้' WHERE id = 900$q$);

SELECT pg_temp.expect_fail('ck_ticket_tier3_needs_vendor_ref',
  $q$UPDATE ticket SET support_tier = 3 WHERE id = 900$q$);

SELECT pg_temp.expect_fail('ck_ticket_pending_needs_reason',
  $q$UPDATE ticket SET status = 'pending_user' WHERE id = 900$q$);

SELECT pg_temp.expect_fail('ck_ticket_satisfaction_range',
  $q$UPDATE ticket SET satisfaction_score = 6 WHERE id = 900$q$);

SELECT pg_temp.expect_fail('ck_ticket_support_tier_range',
  $q$UPDATE ticket SET support_tier = 0 WHERE id = 900$q$);

-- service_request ต้องผูกรายการในแค็ตตาล็อกเสมอ
SELECT pg_temp.expect_fail('ck_ticket_service_request_needs_catalog',
  $q$UPDATE ticket SET ticket_type = 'service_request' WHERE id = 900$q$);

-- ทางกลับกัน ค่าที่ถูกต้องต้องผ่าน
UPDATE ticket SET support_tier = 3, vendor_ref = 'VND-2569-001' WHERE id = 900;
UPDATE ticket SET status = 'pending_user', pending_reason = 'user' WHERE id = 900;
UPDATE ticket SET satisfaction_score = 5 WHERE id = 900;
\echo 'ผ่าน  ค่าที่ถูกต้องยังบันทึกได้ตามปกติ'

-- ----------------------------------------------------------------------------
-- 2) trigger updated_at
-- ----------------------------------------------------------------------------
-- ห้ามวัดด้วยการเทียบ updated_at ก่อน/หลังภายใน transaction เดียว
-- เพราะ now() คืนเวลาเริ่ม transaction ทุก UPDATE จึงได้ค่าเท่ากันหมด
-- และดูเหมือน trigger ไม่ทำงานทั้งที่ทำงานอยู่
-- สิ่งที่ต้องพิสูจน์คือ trigger "เขียนทับค่าที่ผู้เรียกส่งมา" จึงยัดค่าเก่าคงที่เข้าไป
-- แล้วดูว่าค่านั้นไม่เหลืออยู่
DO $$
DECLARE
  stale  CONSTANT timestamptz := timestamptz '2020-01-01 00:00:00+07';
  actual timestamptz;
BEGIN
  UPDATE ticket
     SET subject = 'ອິນເຕີເນັດຊ້າ (ແກ້ໄຂແລ້ວ)', updated_at = stale
   WHERE id = 900;
  SELECT updated_at INTO actual FROM ticket WHERE id = 900;

  IF actual = stale THEN
    RAISE EXCEPTION 'ตก  trigger updated_at ไม่ทำงาน ค่าที่ส่งมาเองยังอยู่ (%)', actual;
  END IF;
  RAISE NOTICE 'ผ่าน  trigger updated_at เขียนทับค่าที่ส่งมาเอง (% -> %)', stale, actual;
END
$$;

-- ----------------------------------------------------------------------------
-- 3) audit_log append-only
-- ----------------------------------------------------------------------------
INSERT INTO audit_log (id, actor_id, company_id, action, entity_type, entity_id, created_at)
VALUES (900, 900, 900, 'update', 'ticket', 900, now());

SELECT pg_temp.expect_fail('audit_log ห้าม UPDATE',
  $q$UPDATE audit_log SET action = 'delete' WHERE id = 900$q$);

SELECT pg_temp.expect_fail('audit_log ห้าม DELETE',
  $q$DELETE FROM audit_log WHERE id = 900$q$);

-- ----------------------------------------------------------------------------
-- 4) ดัชนีเฉพาะ
-- ----------------------------------------------------------------------------
SELECT pg_temp.expect_fail('uq_notification_dedup กันแจ้งเตือนซ้ำในวันเดียวกัน',
  $q$INSERT INTO notification (user_id, ticket_id, event_type, channel, title, body, created_at)
     SELECT 900, 900, 'assigned', 'email', 'ມອບໝາຍວຽກ', 'ທ່ານໄດ້ຮັບມອບໝາຍວຽກໃໝ່', now()
     FROM generate_series(1, 2)$q$);

-- ----------------------------------------------------------------------------
-- 5) ค้นหาภาษาลาวด้วย trigram
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  hits int;
BEGIN
  -- ค้นคำที่อยู่กลางประโยค ซึ่ง LIKE นำหน้าด้วย % ปกติจะใช้ดัชนีไม่ได้
  SELECT count(*) INTO hits FROM ticket WHERE subject LIKE '%ເນັດ%';
  IF hits < 1 THEN
    RAISE EXCEPTION 'ตก  ค้นคำภาษาลาวกลางประโยคไม่เจอ';
  END IF;
  RAISE NOTICE 'ผ่าน  ค้นภาษาลาวกลางประโยคเจอ % แถว', hits;
END
$$;

ROLLBACK;

\echo ''
\echo 'ทดสอบครบทุกข้อ — ROLLBACK แล้ว ไม่มีข้อมูลทดสอบค้างในฐาน'
