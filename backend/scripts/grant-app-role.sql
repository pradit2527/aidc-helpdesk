-- ============================================================================
-- ให้สิทธิ์บัญชีที่ตัวแอปใช้ — รันหลัง db:migrate ทุกครั้งที่มีตารางใหม่
--   psql -U postgres -d aidc_helpdesk -f scripts/grant-app-role.sql
--
-- ให้เฉพาะ DML ไม่ให้ DDL โดยตั้งใจ
-- แอปจึงลบ trigger audit_log append-only ทิ้งเองไม่ได้ (NFR-18)
-- ============================================================================

GRANT CONNECT ON DATABASE aidc_helpdesk TO aidc_app;
GRANT USAGE ON SCHEMA public TO aidc_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aidc_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aidc_app;

-- ตารางที่ migration รอบหน้าสร้าง จะได้สิทธิ์เองโดยไม่ต้องรันสคริปต์นี้ซ้ำ
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aidc_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO aidc_app;

-- แอปต้องไม่แตะตารางบันทึกสถานะ migration
REVOKE ALL ON TABLE drizzle.__drizzle_migrations FROM aidc_app;

-- audit_log: เขียนได้ อ่านได้ แต่แก้และลบไม่ได้
-- ซ้ำซ้อนกับ trigger โดยตั้งใจ ปิดทางทั้งระดับสิทธิ์และระดับ trigger
REVOKE UPDATE, DELETE ON TABLE audit_log FROM aidc_app;
