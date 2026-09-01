-- ============================================================================
-- 0001_search_extensions
--
-- สิ่งที่ drizzle-kit generate สร้างให้ไม่ได้ ต้องเขียนมือ 3 กลุ่ม
--   1) extension สำหรับค้นหาภาษาลาว/ไทย
--   2) trigger รักษา updated_at และบังคับ audit_log เป็น append-only
--   3) ดัชนีที่ต้องใช้นิพจน์ (expression index)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Extension
--
-- ภาษาลาวและไทยเขียนติดกันไม่มีช่องว่างคั่นคำ tsvector ของ Postgres
-- จึงตัดคำไม่ได้ (ไม่มี text search configuration สำหรับสองภาษานี้)
-- ทางออกที่ใช้จริงคือ trigram — เทียบความคล้ายระดับ 3 ตัวอักษร
-- ซึ่งไม่สนใจขอบเขตคำ จึงใช้ได้กับทั้งลาว ไทย และอังกฤษพร้อมกัน
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint

-- unaccent ใช้ตัดวรรณยุกต์ก่อนเทียบ เพื่อให้พิมพ์ผิดวรรณยุกต์ยังหาเจอ
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 2) Trigger
-- ----------------------------------------------------------------------------

-- updated_at: .defaultNow() ของ Drizzle ทำงานตอน INSERT เท่านั้น
-- ถ้าปล่อยให้ชั้น application เป็นคนเซ็ต ค่าจะเพี้ยนทันทีที่มีคนแก้ผ่าน SQL ตรง ๆ
-- (สคริปต์ seed, งานแก้ข้อมูลด่วน, migration ในอนาคต)
-- จึงบังคับที่ฐานข้อมูลให้ครอบคลุมทุกทางเข้า
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'app_user', 'approved_software', 'checklist_template', 'company',
    'department', 'escalation_contact', 'kb_article', 'maintenance_window',
    'notification_channel', 'problem', 'service', 'service_catalog_item',
    'service_outage', 'sla_escalation_rule', 'sla_policy', 'ticket',
    'ticket_category', 'ticket_comment'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_at
         BEFORE UPDATE ON %1$I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t
    );
  END LOOP;
END;
$$;--> statement-breakpoint

-- audit_log ต้องเป็น append-only ตาม NFR-18 และนโยบาย 3.3
-- ห้ามเฉพาะที่ชั้น application ไม่พอ เพราะบัญชีที่ต่อฐานข้อมูลได้ก็ลบได้
-- ผู้ใช้ที่แอปใช้เชื่อมต่อจะถูกบล็อกที่นี่ ส่วนการ purge เกิน 1 ปีต้องทำด้วย
-- บทบาทที่มีสิทธิ์สูงกว่า ซึ่งข้าม trigger นี้ด้วย ALTER TABLE ... DISABLE TRIGGER
CREATE OR REPLACE FUNCTION audit_log_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log เป็น append-only ห้าม % (NFR-18)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER trg_audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();--> statement-breakpoint

CREATE TRIGGER trg_audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 3) ดัชนีค้นหา
--
-- GIN + gin_trgm_ops รองรับทั้ง LIKE '%...%' และ similarity()
-- ซึ่งเป็นสองรูปแบบที่ GET /tickets?q= และ GET /kb/articles?q= ใช้
-- ----------------------------------------------------------------------------
CREATE INDEX ix_ticket_subject_trgm
  ON ticket USING gin (subject gin_trgm_ops);--> statement-breakpoint

CREATE INDEX ix_ticket_description_trgm
  ON ticket USING gin (description gin_trgm_ops);--> statement-breakpoint

-- ค้นด้วยเลข ticket แบบบางส่วน เช่น "0042" ต้องเจอ INC-2569-0042
CREATE INDEX ix_ticket_no_trgm
  ON ticket USING gin (ticket_no gin_trgm_ops);--> statement-breakpoint

CREATE INDEX ix_kb_article_title_trgm
  ON kb_article USING gin (title gin_trgm_ops);--> statement-breakpoint

CREATE INDEX ix_kb_article_body_trgm
  ON kb_article USING gin (body_markdown gin_trgm_ops);--> statement-breakpoint

-- ช่องเลือกผู้รับผิดชอบ/ผู้แจ้ง ค้นจากชื่อเต็ม
CREATE INDEX ix_app_user_full_name_trgm
  ON app_user USING gin (full_name gin_trgm_ops);--> statement-breakpoint

CREATE INDEX ix_catalog_item_name_trgm
  ON service_catalog_item USING gin (name_th gin_trgm_ops);--> statement-breakpoint

-- คิวงานเปิดคือหน้าที่ถูกเปิดบ่อยที่สุด และมองเฉพาะงานที่ยังไม่ปิด
-- ดัชนีบางส่วนจึงเล็กกว่าดัชนีเต็มมาก และไม่โตตามงานที่ปิดไปแล้ว
-- เรียงตาม resolution_due_at เพราะคิวเริ่มต้นจัดลำดับด้วยกำหนดปิดงาน
CREATE INDEX ix_ticket_open_queue
  ON ticket (company_id, priority, resolution_due_at)
  WHERE status NOT IN ('resolved', 'closed', 'cancelled')
    AND deleted_at IS NULL;--> statement-breakpoint

-- งานที่เกิน SLA ใช้ในแดชบอร์ดและงานยกระดับที่รันทุก 5 นาที
-- แยกสองดัชนีเพราะ response กับ resolution เกินคนละเวลาและถูกถามแยกกัน
CREATE INDEX ix_ticket_response_breached
  ON ticket (response_due_at)
  WHERE is_response_breached = true
    AND status NOT IN ('resolved', 'closed', 'cancelled')
    AND deleted_at IS NULL;--> statement-breakpoint

CREATE INDEX ix_ticket_resolution_breached
  ON ticket (resolution_due_at)
  WHERE is_resolution_breached = true
    AND status NOT IN ('resolved', 'closed', 'cancelled')
    AND deleted_at IS NULL;--> statement-breakpoint

-- งานที่ "ใกล้" เกิน SLA ยังไม่เกิน — งานยกระดับ ES-01…ES-04 สแกนช่วงนี้ทุก 5 นาที
-- ไม่ใส่ WHERE เทียบกับ now() เพราะนิพจน์ต้อง IMMUTABLE ดัชนีจึงคุมแค่งานที่ยังไม่เกิน
CREATE INDEX ix_ticket_due_watch
  ON ticket (resolution_due_at, priority)
  WHERE is_resolution_breached = false
    AND resolved_at IS NULL
    AND status NOT IN ('resolved', 'closed', 'cancelled')
    AND deleted_at IS NULL;
