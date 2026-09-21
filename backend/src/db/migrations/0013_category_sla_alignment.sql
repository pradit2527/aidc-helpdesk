-- ============================================================================
-- 0013_category_sla_alignment — จัดหมวดหมู่ของ incident / service_request ให้ตรงเอกสารควบคุม
--
-- แหล่งอ้างอิง
--   AIDC-IT-SLA-001        ข้อ 2 · 5.2 · 5.3 · 6.2 (กลุ่มบริการ, ตัวอย่าง P1–P4, แค็ตตาล็อกคำขอบริการ)
--   AIDC-IT-SOP-001        SOP-01 ถึง SOP-10 และนโยบายข้อ 3.x
--   SOP-6-2025             Security Incident Management (SOP-09/2025-ATECH) — ชนิดเหตุความปลอดภัย
--
-- หลักการ
--   incident        จัดตามกลุ่มบริการ (SLA 6.2): infrastructure · communication · file_storage ·
--                   endpoint · ความปลอดภัย — ค่าตั้งต้น impact × urgency ตรงตัวอย่างใน SLA 5.2
--   service_request จัดตามแค็ตตาล็อก SLA 5.3 / SOP-03…07 — ทุกรายการใน catalog ผูกกับหมวดย่อยใบเดียว
--
-- ⚠️ ไม่ลบแถวใดเลย — ticket เก่าผูกกับ id ของหมวดย่อย ย้ายหมวดย่อยข้ามหมวดหลักได้โดยประวัติไม่เปลี่ยน
--    หมวดหลักเดิมที่ว่างแล้ว (EMAIL PRINTER CCTV MOBILE AI_TOOLS) ปิดใช้งานแทนการลบ
-- ⚠️ ไม่แตะระบบงานของกลุ่ม: SUPER_WORK · ILP · I_OFFICE_PLUS · APS · CMS · CMS_PLUS · MAGIC · OTHER · ERP
--    ทุกคำสั่งรันซ้ำได้ (idempotent)
-- ============================================================================

-- ── 1. หมวดหลักใหม่ ─────────────────────────────────────────────────────
INSERT INTO "ticket_category"
  ("company_id", "code", "name_th", "default_impact", "default_urgency", "ticket_type_scope", "sort_order", "is_active")
SELECT NULL, v.code, v.name_th, v.impact, v.urgency, v.scope, v.sort_order, true
FROM (VALUES
  ('COMMUNICATION', 'ລະບົບສື່ສານອົງກອນ (ອີເມວ · ປະຊຸມອອນລາຍ · Wi-Fi · VPN)', 'department', 'medium', 'incident', 20),
  ('FILE_STORAGE', 'ພື້ນທີ່ເກັບໄຟລ໌ສ່ວນກາງ (File Server · Cloud Storage)', 'department', 'high', 'incident', 30),
  ('LIFECYCLE', 'ພະນັກງານເຂົ້າ – ອອກ (Onboarding / Offboarding)', 'individual', 'medium', 'service_request', 80),
  ('SR_SOFTWARE', 'ຊອບແວ ແລະ ເຄື່ອງມື AI', 'individual', 'medium', 'service_request', 85),
  ('SR_EQUIPMENT', 'ອຸປະກອນ ແລະ ການຕິດຕັ້ງ', 'individual', 'low', 'service_request', 90),
  ('SR_DATA', 'ຂໍ້ມູນ ແລະ ນະໂຍບາຍ (Backup · Policy Exception)', 'individual', 'low', 'service_request', 95),
  ('SR_ADVISORY', 'ຄຳປຶກສາ / ສອບຖາມການໃຊ້ງານ', 'individual', 'low', 'service_request', 100)
) AS v(code, name_th, impact, urgency, scope, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM "ticket_category" c WHERE c."company_id" IS NULL AND c."code" = v.code
);
--> statement-breakpoint

-- ── 2. หมวดหมู่ย่อยใหม่ ──────────────────────────────────────────────────
INSERT INTO "ticket_category"
  ("company_id", "parent_id", "code", "name_th", "default_impact", "default_urgency", "ticket_type_scope", "sort_order", "is_active")
SELECT NULL, p."id", v.code, v.name_th, v.impact, v.urgency, v.scope, v.sort_order, true
FROM (VALUES
  ('NETWORK', 'NETWORK_AUTH', 'ລະບົບຢືນຢັນຕົວຕົນກາງ (AD / SSO) ໃຊ້ບໍ່ໄດ້', 'org_wide', 'high', 'incident', 15),
  ('COMMUNICATION', 'EMAIL_DEPT_DOWN', 'ອີເມວທັງພະແນກ ຫຼື ທັງອົງກອນໃຊ້ບໍ່ໄດ້', 'department', 'high', 'incident', 10),
  ('COMMUNICATION', 'MEETING_CHAT', 'ປະຊຸມອອນລາຍ / ແຊັດອົງກອນໃຊ້ບໍ່ໄດ້', 'department', 'medium', 'incident', 50),
  ('FILE_STORAGE', 'FILE_SERVER_DOWN', 'ເຂົ້າ File Server / Cloud Storage ບໍ່ໄດ້ທັງພະແນກ', 'department', 'high', 'incident', 10),
  ('FILE_STORAGE', 'FILE_OPEN_FAIL', 'ເປີດ ຫຼື ບັນທຶກໄຟລ໌ໃນ File Server ບໍ່ໄດ້ (ສະເພາະຂ້ອຍ)', 'individual', 'medium', 'incident', 20),
  ('SECURITY', 'SECURITY_ATTACK', 'ຖືກໂຈມຕີທາງໄຊເບີ / ປະຕິເສດການບໍລິການ (DoS)', 'org_wide', 'high', 'incident', 25),
  ('SECURITY', 'SECURITY_PROBE', 'ພົບການສະແກນ ຫຼື ສືບຫາຊ່ອງໂຫວ່ຂອງລະບົບໂດຍບໍ່ໄດ້ຮັບອະນຸຍາດ', 'department', 'medium', 'incident', 30),
  ('SECURITY', 'SECURITY_PHYSICAL', 'ມີຄົນເຂົ້າພື້ນທີ່ / ຫ້ອງເຊີເວີໂດຍບໍ່ໄດ້ຮັບອະນຸຍາດ', 'department', 'high', 'incident', 50),
  ('SECURITY', 'SECURITY_DEVICE_LOST', 'ອຸປະກອນ ຫຼື ຊັບສິນໄອທີສູນຫາຍ / ຖືກລັກ (ແຈ້ງພາຍໃນ 24 ຊົ່ວໂມງ)', 'individual', 'high', 'incident', 60),
  ('SECURITY', 'SECURITY_POLICY_BREACH', 'ລະເມີດ ຫຼື ບໍ່ປະຕິບັດຕາມນະໂຍບາຍຄວາມປອດໄພ', 'individual', 'medium', 'incident', 70),
  ('ACCESS', 'ACCESS_UNLOCK', 'ຂໍປົດລັອກບັນຊີ (ໃສ່ລະຫັດຜິດເກີນກຳນົດ)', 'individual', 'high', 'service_request', 20),
  ('ACCESS', 'ACCESS_VPN', 'ຂໍໃຊ້ງານ VPN', 'individual', 'low', 'service_request', 80),
  ('LIFECYCLE', 'LIFECYCLE_ONBOARD', 'ຕຽມລະບົບໃຫ້ພະນັກງານໃໝ່', 'individual', 'medium', 'service_request', 10),
  ('LIFECYCLE', 'LIFECYCLE_OFFBOARD', 'ປິດສິດພະນັກງານລາອອກ', 'individual', 'high', 'service_request', 20),
  ('SR_SOFTWARE', 'SOFTWARE_NONSTD', 'ຂໍຊອບແວນອກບັນຊີມາດຕະຖານ', 'individual', 'low', 'service_request', 20),
  ('SR_DATA', 'DATA_RESTORE', 'ຂໍກູ້ຄືນຂໍ້ມູນຈາກ Backup', 'individual', 'low', 'service_request', 10),
  ('SR_DATA', 'POLICY_EXCEPTION', 'ຂໍຍົກເວັ້ນນະໂຍບາຍໄອທີ (Policy Exception)', 'individual', 'low', 'service_request', 20),
  ('SR_ADVISORY', 'ADVISORY_HOWTO', 'ສອບຖາມວິທີໃຊ້ງານ / ຂໍຄຳປຶກສາ', 'individual', 'low', 'service_request', 10)
) AS v(parent_code, code, name_th, impact, urgency, scope, sort_order)
JOIN "ticket_category" p ON p."company_id" IS NULL AND p."code" = v.parent_code
WHERE NOT EXISTS (
  SELECT 1 FROM "ticket_category" c WHERE c."company_id" IS NULL AND c."code" = v.code
);
--> statement-breakpoint

-- ── 3. ย้าย/ปรับชื่อ/ค่าตั้งต้นของหมวดหลักเดิมที่ยังใช้อยู่ ───────────────────
UPDATE "ticket_category" c
SET "name_th" = v.name_th, "default_impact" = v.impact, "default_urgency" = v.urgency,
    "sort_order" = v.sort_order, "updated_at" = now()
FROM (VALUES
  ('NETWORK', 'ໂຄງສ້າງພື້ນຖານ (ເຄືອຂ່າຍ · ອິນເຕີເນັດ · ການຢືນຢັນຕົວຕົນ)', 'department', 'high', 10),
  ('HARDWARE', 'ອຸປະກອນຜູ້ໃຊ້ (ຄອມພິວເຕີ · ເຄື່ອງພິມ · ອຸປະກອນຕໍ່ພ່ວງ)', 'individual', 'medium', 40),
  ('SOFTWARE', 'ຊອບແວ ແລະ ແອັບພລິເຄຊັນ', 'individual', 'medium', 50),
  ('SECURITY', 'ເຫດການຄວາມປອດໄພຂໍ້ມູນ (Security Incident)', 'org_wide', 'high', 60),
  ('ACCESS', 'ບັນຊີ ແລະ ສິດເຂົ້າເຖິງ', 'individual', 'medium', 70)
) AS v(code, name_th, impact, urgency, sort_order)
WHERE c."company_id" IS NULL AND c."code" = v.code;
--> statement-breakpoint

-- ── 4. จัดหมวดย่อยทั้งหมดเข้าหมวดหลักตามเอกสาร (รวมการย้ายข้ามหมวดหลัก) ────────
UPDATE "ticket_category" c
SET "parent_id" = p."id", "name_th" = v.name_th, "default_impact" = v.impact,
    "default_urgency" = v.urgency, "sort_order" = v.sort_order, "updated_at" = now()
FROM (VALUES
  ('NETWORK', 'NETWORK_OUTAGE', 'ເຄືອຂ່າຍ ຫຼື ອິນເຕີເນັດໃຊ້ບໍ່ໄດ້ທັງຫ້ອງການ', 'org_wide', 'high', 10),
  ('NETWORK', 'NETWORK_AUTH', 'ລະບົບຢືນຢັນຕົວຕົນກາງ (AD / SSO) ໃຊ້ບໍ່ໄດ້', 'org_wide', 'high', 15),
  ('NETWORK', 'NETWORK_SLOW', 'ອິນເຕີເນັດຊ້າ', 'department', 'medium', 20),
  ('NETWORK', 'NETWORK_LAN', 'ສາຍ LAN / ປລັກເຄືອຂ່າຍ', 'individual', 'medium', 30),
  ('COMMUNICATION', 'EMAIL_DEPT_DOWN', 'ອີເມວທັງພະແນກ ຫຼື ທັງອົງກອນໃຊ້ບໍ່ໄດ້', 'department', 'high', 10),
  ('COMMUNICATION', 'EMAIL_SEND_RECEIVE', 'ສົ່ງ ຫຼື ຮັບອີເມວບໍ່ໄດ້', 'individual', 'high', 20),
  ('COMMUNICATION', 'EMAIL_MAILBOX_FULL', 'ກ່ອງຈົດໝາຍເຕັມ', 'individual', 'medium', 30),
  ('COMMUNICATION', 'EMAIL_ACCOUNT_LOCKED', 'ບັນຊີຖືກລັອກຍ້ອນລະບົບຜິດພາດ', 'individual', 'high', 40),
  ('COMMUNICATION', 'MEETING_CHAT', 'ປະຊຸມອອນລາຍ / ແຊັດອົງກອນໃຊ້ບໍ່ໄດ້', 'department', 'medium', 50),
  ('COMMUNICATION', 'NETWORK_WIFI', 'Wi-Fi ເຊື່ອມຕໍ່ບໍ່ໄດ້ ຫຼື ຫຼຸດບ່ອຍ', 'individual', 'medium', 60),
  ('COMMUNICATION', 'NETWORK_VPN', 'VPN ເຂົ້າຈາກນອກຫ້ອງການບໍ່ໄດ້', 'individual', 'medium', 70),
  ('FILE_STORAGE', 'FILE_SERVER_DOWN', 'ເຂົ້າ File Server / Cloud Storage ບໍ່ໄດ້ທັງພະແນກ', 'department', 'high', 10),
  ('FILE_STORAGE', 'FILE_OPEN_FAIL', 'ເປີດ ຫຼື ບັນທຶກໄຟລ໌ໃນ File Server ບໍ່ໄດ້ (ສະເພາະຂ້ອຍ)', 'individual', 'medium', 20),
  ('HARDWARE', 'HARDWARE_NO_POWER', 'ເປີດເຄື່ອງບໍ່ຕິດ / ຈໍຟ້າ', 'individual', 'high', 10),
  ('HARDWARE', 'HARDWARE_SLOW', 'ເຄື່ອງຊ້າ ຫຼື ຄ້າງ', 'individual', 'medium', 20),
  ('HARDWARE', 'HARDWARE_MONITOR', 'ຈໍພາບ', 'individual', 'medium', 30),
  ('HARDWARE', 'HARDWARE_PERIPHERAL', 'ເມົ້າ ຄີບອດ ແລະ ອຸປະກອນຕໍ່ພ່ວງ', 'individual', 'low', 40),
  ('HARDWARE', 'PRINTER_NOT_PRINTING', 'ພິມບໍ່ອອກ', 'department', 'medium', 50),
  ('HARDWARE', 'PRINTER_QUALITY', 'ເຈ້ຍຕິດ ຫຼື ພິມບໍ່ຊັດ', 'individual', 'low', 60),
  ('HARDWARE', 'PRINTER_SCAN', 'ສະແກນບໍ່ໄດ້', 'individual', 'low', 70),
  ('HARDWARE', 'MOBILE_BROKEN', 'ມືຖື ຫຼື ແທັບເລັດບໍລິສັດເສຍ', 'individual', 'medium', 80),
  ('HARDWARE', 'CCTV_NO_SIGNAL', 'ກ້ອງວົງຈອນປິດບໍ່ມີພາບ / ອອບລາຍ', 'individual', 'medium', 90),
  ('SOFTWARE', 'SOFTWARE_ERROR', 'ໂປຣແກຣມຂຶ້ນຂໍ້ຜິດພາດ ຫຼື ປິດເອງ', 'individual', 'medium', 10),
  ('SOFTWARE', 'SOFTWARE_OFFICE', 'Microsoft Office', 'individual', 'medium', 30),
  ('SOFTWARE', 'SOFTWARE_LICENSE', 'License ໝົດອາຍຸ', 'individual', 'medium', 40),
  ('SOFTWARE', 'AI_TOOLS_PROBLEM', 'ໃຊ້ງານເຄື່ອງມື AI ບໍ່ໄດ້', 'individual', 'medium', 50),
  ('SECURITY', 'SECURITY_PHISHING', 'ອີເມວຫຼອກລວງ (Phishing)', 'individual', 'high', 10),
  ('SECURITY', 'SECURITY_MALWARE', 'ໄວຣັສ / ມັລແວ / Ransomware', 'org_wide', 'high', 20),
  ('SECURITY', 'SECURITY_ATTACK', 'ຖືກໂຈມຕີທາງໄຊເບີ / ປະຕິເສດການບໍລິການ (DoS)', 'org_wide', 'high', 25),
  ('SECURITY', 'SECURITY_PROBE', 'ພົບການສະແກນ ຫຼື ສືບຫາຊ່ອງໂຫວ່ຂອງລະບົບໂດຍບໍ່ໄດ້ຮັບອະນຸຍາດ', 'department', 'medium', 30),
  ('SECURITY', 'SECURITY_ACCOUNT', 'ບັນຊີຖືກໃຊ້ງານຜິດປົກກະຕິ ຫຼື ມີຄົນພະຍາຍາມເຂົ້າໂດຍບໍ່ໄດ້ຮັບອະນຸຍາດ', 'individual', 'high', 35),
  ('SECURITY', 'SECURITY_DATA_LEAK', 'ຂໍ້ມູນຮົ່ວໄຫຼ ຫຼື ຖືກແກ້ໄຂ / ທຳລາຍໂດຍບໍ່ໄດ້ຮັບອະນຸຍາດ', 'org_wide', 'high', 40),
  ('SECURITY', 'SECURITY_PHYSICAL', 'ມີຄົນເຂົ້າພື້ນທີ່ / ຫ້ອງເຊີເວີໂດຍບໍ່ໄດ້ຮັບອະນຸຍາດ', 'department', 'high', 50),
  ('SECURITY', 'SECURITY_DEVICE_LOST', 'ອຸປະກອນ ຫຼື ຊັບສິນໄອທີສູນຫາຍ / ຖືກລັກ (ແຈ້ງພາຍໃນ 24 ຊົ່ວໂມງ)', 'individual', 'high', 60),
  ('SECURITY', 'SECURITY_POLICY_BREACH', 'ລະເມີດ ຫຼື ບໍ່ປະຕິບັດຕາມນະໂຍບາຍຄວາມປອດໄພ', 'individual', 'medium', 70),
  ('ACCESS', 'EMAIL_PASSWORD', 'ລືມລະຫັດຜ່ານ / ຂໍຣີເຊັດລະຫັດຜ່ານ', 'individual', 'high', 10),
  ('ACCESS', 'ACCESS_UNLOCK', 'ຂໍປົດລັອກບັນຊີ (ໃສ່ລະຫັດຜິດເກີນກຳນົດ)', 'individual', 'high', 20),
  ('ACCESS', 'ACCESS_NEW', 'ຂໍສິດເຂົ້າລະບົບໃໝ່', 'individual', 'low', 30),
  ('ACCESS', 'ACCESS_CHANGE', 'ປ່ຽນ ຫຼື ເພີ່ມສິດ', 'individual', 'low', 40),
  ('ACCESS', 'ACCESS_SHARED_FOLDER', 'ສິດໂຟນເດີແບ່ງປັນ', 'individual', 'low', 50),
  ('ACCESS', 'ACCESS_REVOKE', 'ຍົກເລີກສິດ (ຍ້າຍພະແນກ / ປ່ຽນໜ້າທີ່)', 'individual', 'medium', 60),
  ('ACCESS', 'EMAIL_NEW_ACCOUNT', 'ຂໍບັນຊີອີເມວໃໝ່', 'individual', 'low', 70),
  ('ACCESS', 'ACCESS_VPN', 'ຂໍໃຊ້ງານ VPN', 'individual', 'low', 80),
  ('LIFECYCLE', 'LIFECYCLE_ONBOARD', 'ຕຽມລະບົບໃຫ້ພະນັກງານໃໝ່', 'individual', 'medium', 10),
  ('LIFECYCLE', 'LIFECYCLE_OFFBOARD', 'ປິດສິດພະນັກງານລາອອກ', 'individual', 'high', 20),
  ('SR_SOFTWARE', 'SOFTWARE_INSTALL', 'ຕິດຕັ້ງຊອບແວໃນບັນຊີມາດຕະຖານ (Approved Software List)', 'individual', 'low', 10),
  ('SR_SOFTWARE', 'SOFTWARE_NONSTD', 'ຂໍຊອບແວນອກບັນຊີມາດຕະຖານ', 'individual', 'low', 20),
  ('SR_SOFTWARE', 'AI_TOOLS_CHAT', 'ຂໍບັນຊີ AI ແຊັດ (ChatGPT · Claude · Gemini)', 'individual', 'medium', 30),
  ('SR_SOFTWARE', 'AI_TOOLS_COPILOT', 'Microsoft Copilot', 'individual', 'medium', 40),
  ('SR_SOFTWARE', 'AI_TOOLS_OTHER', 'ເຄື່ອງມື AI ອື່ນ ໆ', 'individual', 'low', 50),
  ('SR_EQUIPMENT', 'HARDWARE_REQUEST', 'ຂໍອຸປະກອນໃໝ່ / ປ່ຽນເຄື່ອງ', 'individual', 'low', 10),
  ('SR_EQUIPMENT', 'PRINTER_SETUP', 'ຕິດຕັ້ງເຄື່ອງພິມໃສ່ຄອມພິວເຕີ', 'individual', 'low', 20),
  ('SR_EQUIPMENT', 'PRINTER_TONER', 'ໝຶກໝົດ / ປ່ຽນຕະລັບໝຶກ', 'individual', 'low', 30),
  ('SR_EQUIPMENT', 'MOBILE_SETUP', 'ຕັ້ງຄ່າອີເມວ / ແອັບບໍລິສັດໃນມືຖື', 'individual', 'low', 40),
  ('SR_EQUIPMENT', 'MOBILE_SIM', 'ຊິມ / ແພັກເກັດອິນເຕີເນັດ', 'individual', 'low', 50),
  ('SR_EQUIPMENT', 'CCTV_PLAYBACK', 'ຂໍເບິ່ງພາບກ້ອງວົງຈອນປິດຍ້ອນຫຼັງ', 'individual', 'low', 60),
  ('SR_EQUIPMENT', 'CCTV_INSTALL', 'ຂໍຕິດຕັ້ງ ຫຼື ຍ້າຍກ້ອງ', 'individual', 'low', 70),
  ('SR_DATA', 'DATA_RESTORE', 'ຂໍກູ້ຄືນຂໍ້ມູນຈາກ Backup', 'individual', 'low', 10),
  ('SR_DATA', 'POLICY_EXCEPTION', 'ຂໍຍົກເວັ້ນນະໂຍບາຍໄອທີ (Policy Exception)', 'individual', 'low', 20),
  ('SR_ADVISORY', 'ADVISORY_HOWTO', 'ສອບຖາມວິທີໃຊ້ງານ / ຂໍຄຳປຶກສາ', 'individual', 'low', 10)
) AS v(parent_code, code, name_th, impact, urgency, sort_order)
JOIN "ticket_category" p ON p."company_id" IS NULL AND p."code" = v.parent_code
WHERE c."company_id" IS NULL AND c."code" = v.code;
--> statement-breakpoint

-- ── 5. ขอบเขตชนิดเรื่อง ───────────────────────────────────────────────────
UPDATE "ticket_category" SET "ticket_type_scope" = 'incident' WHERE "code" IN (
  'NETWORK',
  'COMMUNICATION',
  'FILE_STORAGE',
  'HARDWARE',
  'SOFTWARE',
  'SECURITY',
  'NETWORK_OUTAGE',
  'NETWORK_AUTH',
  'NETWORK_SLOW',
  'NETWORK_LAN',
  'EMAIL_DEPT_DOWN',
  'EMAIL_SEND_RECEIVE',
  'EMAIL_MAILBOX_FULL',
  'EMAIL_ACCOUNT_LOCKED',
  'MEETING_CHAT',
  'NETWORK_WIFI',
  'NETWORK_VPN',
  'FILE_SERVER_DOWN',
  'FILE_OPEN_FAIL',
  'HARDWARE_NO_POWER',
  'HARDWARE_SLOW',
  'HARDWARE_MONITOR',
  'HARDWARE_PERIPHERAL',
  'PRINTER_NOT_PRINTING',
  'PRINTER_QUALITY',
  'PRINTER_SCAN',
  'MOBILE_BROKEN',
  'CCTV_NO_SIGNAL',
  'SOFTWARE_ERROR',
  'SOFTWARE_OFFICE',
  'SOFTWARE_LICENSE',
  'AI_TOOLS_PROBLEM',
  'SECURITY_PHISHING',
  'SECURITY_MALWARE',
  'SECURITY_ATTACK',
  'SECURITY_PROBE',
  'SECURITY_ACCOUNT',
  'SECURITY_DATA_LEAK',
  'SECURITY_PHYSICAL',
  'SECURITY_DEVICE_LOST',
  'SECURITY_POLICY_BREACH'
);
--> statement-breakpoint
UPDATE "ticket_category" SET "ticket_type_scope" = 'service_request' WHERE "code" IN (
  'ACCESS',
  'LIFECYCLE',
  'SR_SOFTWARE',
  'SR_EQUIPMENT',
  'SR_DATA',
  'SR_ADVISORY',
  'EMAIL_PASSWORD',
  'ACCESS_UNLOCK',
  'ACCESS_NEW',
  'ACCESS_CHANGE',
  'ACCESS_SHARED_FOLDER',
  'ACCESS_REVOKE',
  'EMAIL_NEW_ACCOUNT',
  'ACCESS_VPN',
  'LIFECYCLE_ONBOARD',
  'LIFECYCLE_OFFBOARD',
  'SOFTWARE_INSTALL',
  'SOFTWARE_NONSTD',
  'AI_TOOLS_CHAT',
  'AI_TOOLS_COPILOT',
  'AI_TOOLS_OTHER',
  'HARDWARE_REQUEST',
  'PRINTER_SETUP',
  'PRINTER_TONER',
  'MOBILE_SETUP',
  'MOBILE_SIM',
  'CCTV_PLAYBACK',
  'CCTV_INSTALL',
  'DATA_RESTORE',
  'POLICY_EXCEPTION',
  'ADVISORY_HOWTO'
);
--> statement-breakpoint

-- ── 6. ปิดหมวดหลักเดิมที่ว่างแล้ว ─────────────────────────────────────────
UPDATE "ticket_category" SET "is_active" = false, "updated_at" = now()
WHERE "company_id" IS NULL AND "code" IN ('EMAIL', 'PRINTER', 'CCTV', 'MOBILE', 'AI_TOOLS');
--> statement-breakpoint

-- ── 7. แค็ตตาล็อกคำขอบริการ ───────────────────────────────────────────────
-- 7.1 แก้สายอนุมัติ: 'department_head' ไม่ใช่ค่า approver_type ที่ระบบรู้จัก (ต้องเป็น line_manager)
--     seed ถูกแก้ไปแล้วแต่ฐานข้อมูลที่ seed ไปก่อนหน้ายังเป็นค่าเดิม — คำขอที่ต้องอนุมัติจะสร้างขั้นอนุมัติไม่ได้
UPDATE "service_catalog_item"
SET "approval_chain" = replace("approval_chain", 'department_head', 'line_manager'), "updated_at" = now()
WHERE "approval_chain" LIKE '%department_head%';
--> statement-breakpoint

-- 7.2 ติดตั้งซอฟต์แวร์ในบัญชีมาตรฐาน: SLA 5.3 / SOP-06 = 2 วันทำการ นับตั้งแต่รับคำขอ ไม่ต้องอนุมัติ
--     (ถ้าไม่อยู่ในบัญชีมาตรฐาน ใช้รายการ SR-SW-NONSTD ที่ต้อง Tier 2 ประเมินและ Head of IT อนุมัติ)
UPDATE "service_catalog_item"
SET "requires_approval" = false, "approval_chain" = NULL, "clock_start_event" = 'on_create',
    "target_minutes" = 1080, "updated_at" = now()
WHERE "company_id" IS NULL AND "code" = 'SR-SOFTWARE-INSTALL';
--> statement-breakpoint

-- 7.3 ขอคำปรึกษา: SLA 2.1 / 4 กำหนดตาม P4 = 5 วันทำการ (2,700 นาที)
UPDATE "service_catalog_item"
SET "target_minutes" = 2700, "updated_at" = now()
WHERE "company_id" IS NULL AND "code" = 'SR-CONSULT';
--> statement-breakpoint

-- 7.4 รายการที่ SLA / SOP กำหนดไว้แต่ยังไม่มีในระบบ
INSERT INTO "service_catalog_item"
  ("company_id", "code", "name_th", "category_id", "default_impact", "default_urgency", "default_priority",
   "target_mode", "target_minutes", "clock_start_event", "requires_approval", "approval_chain", "is_active")
SELECT NULL, v.code, v.name_th, c."id", v.impact, v.urgency, v.priority,
       'duration', v.minutes, v.clock, v.approval, v.chain, true
FROM (VALUES
  ('SR-SW-NONSTD', 'ຂໍຊອບແວນອກບັນຊີມາດຕະຖານ', 'SOFTWARE_NONSTD', 'individual', 'low', 'P4', 2700, 'after_approval', true, 'tier2_review,head_of_it'),
  ('SR-RESTORE', 'ຂໍກູ້ຄືນຂໍ້ມູນຈາກ Backup', 'DATA_RESTORE', 'individual', 'low', 'P4', 2700, 'after_approval', true, 'line_manager'),
  ('SR-POLICY-EXC', 'ຂໍຍົກເວັ້ນນະໂຍບາຍໄອທີ', 'POLICY_EXCEPTION', 'individual', 'low', 'P4', 2700, 'after_approval', true, 'head_of_it')
) AS v(code, name_th, cat_code, impact, urgency, priority, minutes, clock, approval, chain)
JOIN "ticket_category" c ON c."company_id" IS NULL AND c."code" = v.cat_code
WHERE NOT EXISTS (
  SELECT 1 FROM "service_catalog_item" i WHERE i."company_id" IS NULL AND i."code" = v.code
);
--> statement-breakpoint

-- 7.5 ผูกทุกรายการกับหมวดย่อยใบเดียว — เลือกรายการแล้วฟอร์มเติมหมวดหลัก/หมวดย่อยให้ครบเอง
UPDATE "service_catalog_item" i
SET "category_id" = c."id", "updated_at" = now()
FROM (VALUES
  ('SR-PASSWORD-RESET', 'EMAIL_PASSWORD'),
  ('SR-UNLOCK-ACCOUNT', 'ACCESS_UNLOCK'),
  ('SR-ACCESS', 'ACCESS_NEW'),
  ('SR-EMAIL-ACCOUNT', 'EMAIL_NEW_ACCOUNT'),
  ('SR-VPN', 'ACCESS_VPN'),
  ('SR-SOFTWARE-INSTALL', 'SOFTWARE_INSTALL'),
  ('SR-SW-NONSTD', 'SOFTWARE_NONSTD'),
  ('SR-EQUIPMENT', 'HARDWARE_REQUEST'),
  ('SR-ONBOARDING', 'LIFECYCLE_ONBOARD'),
  ('SR-OFFBOARDING', 'LIFECYCLE_OFFBOARD'),
  ('SR-RESTORE', 'DATA_RESTORE'),
  ('SR-POLICY-EXC', 'POLICY_EXCEPTION'),
  ('SR-CONSULT', 'ADVISORY_HOWTO')
) AS v(item_code, cat_code)
JOIN "ticket_category" c ON c."company_id" IS NULL AND c."code" = v.cat_code
WHERE i."company_id" IS NULL AND i."code" = v.item_code;
--> statement-breakpoint

-- ── 8. ทะเบียนบริการตาม SLA 6.2 (เพิ่มเฉพาะที่ยังไม่มี ไม่เขียนทับของที่ผู้ดูแลแก้แล้ว) ──
INSERT INTO "service"
  ("company_id", "code", "name_th", "service_group", "service_tier", "is_24x7", "is_active")
SELECT NULL, v.code, v.name_th, v.grp, v.tier, v.is_24x7, true
FROM (VALUES
  ('LAN', 'ເຄືອຂ່າຍສຳນັກງານ (LAN)', 'infrastructure', 'critical', true),
  ('INTERNET', 'ອິນເຕີເນັດອົງກອນ', 'infrastructure', 'critical', true),
  ('AUTH', 'ລະບົບຢືນຢັນຕົວຕົນ (AD / SSO)', 'infrastructure', 'critical', true),
  ('EMAIL', 'ອີເມວອົງກອນ', 'communication', 'high', false),
  ('MEETING', 'ປະຊຸມອອນລາຍ', 'communication', 'high', false),
  ('CHAT', 'ແຊັດອົງກອນ', 'communication', 'high', false),
  ('WIFI', 'Wi-Fi ສຳນັກງານ', 'communication', 'high', false),
  ('VPN', 'VPN', 'communication', 'high', false),
  ('FILE_SERVER', 'File Server / Cloud Storage', 'file_storage', 'high', false),
  ('ENDPOINT_PC', 'ຄອມພິວເຕີ / ໂນດບຸກ', 'endpoint', 'standard', false),
  ('ENDPOINT_PRINTER', 'ເຄື່ອງພິມ ແລະ ອຸປະກອນຕໍ່ພ່ວງ', 'endpoint', 'standard', false)
) AS v(code, name_th, grp, tier, is_24x7)
WHERE NOT EXISTS (
  SELECT 1 FROM "service" s WHERE s."company_id" IS NULL AND s."code" = v.code
);

-- ── ย้อนกลับ (ทำมือ ถ้าจำเป็น) ───────────────────────────────────────────
-- ไม่มีคำสั่งย้อนอัตโนมัติ: การย้ายหมวดย่อยไม่ทำลายข้อมูล ถ้าต้องการคืนโครงเดิม ให้รัน seed
-- (npx tsx src/db/seed/ticket-categories-cli.ts) ด้วยไฟล์ data/catalog.ts ของ commit ก่อนหน้า
