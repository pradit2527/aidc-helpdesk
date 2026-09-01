-- ============================================================================
-- สร้างฐานข้อมูลและ role — รันด้วยบัญชี superuser ครั้งเดียวก่อน migrate
--   psql -U postgres -f scripts/bootstrap-db.sql
--
-- แยกสอง role โดยตั้งใจ
--   postgres  = เจ้าของ schema รัน migration และ CREATE EXTENSION
--   aidc_app  = บัญชีที่ตัวแอปใช้ ไม่มีสิทธิ์ DDL
-- แยกแบบนี้ทำให้ trigger audit_log append-only มีความหมายจริง เพราะ aidc_app
-- แก้ trigger ทิ้งเองไม่ได้ ต้องใช้เจ้าของ schema เท่านั้น (NFR-18)
-- ============================================================================

SELECT 'CREATE DATABASE aidc_helpdesk ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'aidc_helpdesk')\gexec

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aidc_app') THEN
    CREATE ROLE aidc_app LOGIN PASSWORD 'aidc_app_dev_2026';
  END IF;
END
$$;
