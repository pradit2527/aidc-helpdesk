# API Specification — AIDC Helpdesk

| หัวข้อ | รายละเอียด |
|---|---|
| รหัสเอกสาร | API-001 |
| เวอร์ชัน | 1.0 |
| Base path | `/api/v1` |
| รูปแบบข้อมูล | `application/json; charset=utf-8` (ยกเว้นอัปโหลดไฟล์ใช้ `multipart/form-data`) |
| แหล่งความจริง | OpenAPI 3.1 ที่ FastAPI สร้างอัตโนมัติ (`/api/v1/openapi.json`) — เอกสารนี้คือข้อตกลงที่ต้องตรงกับ schema เสมอ |
| เอกสารอ้างอิง | `02-data-model.md`, `04-rbac-sla.md` |

---

## 1. หลักการทั่วไป

### 1.1 การยืนยันตัวตน
- ทุก endpoint ยกเว้น `/auth/login`, `/auth/refresh`, `/health` ต้องส่ง header `Authorization: Bearer <access_token>`
- Access token อายุ 30 นาที, Refresh token อายุ 7 วัน (เก็บฝั่ง client ใน memory/localStorage — เอกสารนี้เลือก `localStorage` เพราะเป็นระบบภายในองค์กรและต้องรองรับการรีเฟรชหน้าจอบนมือถือ)
- JWT payload: `sub` (user_id), `username`, `company_id`, `roles[]`, `scoped_company_ids[]`, `exp`, `jti`

### 1.2 รูปแบบ Response สำเร็จ
คืน object ของทรัพยากรตรง ๆ (ไม่ห่อ `data` ซ้อนโดยไม่จำเป็น)

```json
{ "id": 1042, "ticket_no": "AIDC-LOG-202608-0042", "subject": "..." }
```

รายการแบบแบ่งหน้าใช้รูปแบบเดียวกันทั้งระบบ

```json
{
  "items": [ { "id": 1042 } ],
  "page": 1,
  "page_size": 20,
  "total": 137,
  "total_pages": 7
}
```

### 1.3 รูปแบบ Error มาตรฐาน
ทุก error ตอบด้วยโครงสร้างเดียวกันเสมอ

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "ข้อมูลไม่ถูกต้อง",
    "details": [
      { "field": "subject", "message": "กรุณาระบุหัวข้อ" }
    ],
    "request_id": "01J9X2K7M4N8Q3"
  }
}
```

| ส่วน | คำอธิบาย |
|---|---|
| `code` | รหัสคงที่สำหรับให้ frontend ตัดสินใจ (ดูหัวข้อ 6) |
| `message` | ข้อความภาษาไทยแสดงผู้ใช้ได้ทันที |
| `details` | ใช้กับ validation error เท่านั้น |
| `request_id` | ตรงกับ log ฝั่ง server ใช้สืบหาปัญหา |

### 1.4 Pagination / Filter / Sorting

| พารามิเตอร์ | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|
| `page` | 1 | เริ่มที่ 1 |
| `page_size` | 20 | สูงสุด 100 |
| `sort` | `-created_at` | ชื่อฟิลด์; นำหน้าด้วย `-` = มากไปน้อย; หลายฟิลด์คั่นด้วยจุลภาค |
| `q` | — | คำค้นแบบข้อความอิสระ |

**กติกาการ filter**
- ค่าหลายค่าใช้จุลภาค: `?status=new,assigned`
- ช่วงวันที่ใช้ `_from` / `_to` เป็น ISO 8601: `?created_from=2026-08-01&created_to=2026-08-31`
- ค่าที่ไม่รู้จัก → `400 INVALID_PARAMETER` (ไม่เพิกเฉยเงียบ ๆ เพื่อกันบั๊กฝั่ง FE)
- **ข้อยกเว้นสำคัญ:** พารามิเตอร์ `company_id` ที่อยู่นอกขอบเขตสิทธิ์ของผู้เรียก จะถูกตัดออกโดยไม่แจ้ง error (ป้องกันการเดาข้อมูล — ดู `01-srs.md` US-07 AC-2)

### 1.5 กติกาอื่น
| หัวข้อ | ข้อกำหนด |
|---|---|
| เวลา | ISO 8601 พร้อม timezone เช่น `2026-08-31T09:15:00+07:00`; ส่งเข้ารับได้ทั้ง UTC และ +07:00 |
| Idempotency | `POST /tickets` รับ header `Idempotency-Key` (optional) กันการกดส่งซ้ำบนมือถือ |
| Rate limit | ตอบ header `X-RateLimit-Remaining`; เกินโควตา → `429 RATE_LIMITED` |
| Request ID | ทุก response มี header `X-Request-Id` |
| Versioning | เปลี่ยนแปลงที่ทำลายความเข้ากันได้ต้องขึ้น `/api/v2` |
| Soft delete | `DELETE` = soft delete และตอบ `204` |

---

## 2. ตาราง Endpoint

> คอลัมน์ "สิทธิ์" อ้างอิงรหัส permission ใน `04-rbac-sla.md`; `own` = เฉพาะข้อมูลของตนเอง
>
> **role ทั้ง 5 ของระบบ:** `end_user`, `agent`, `company_admin`, `manager_viewer`, `super_admin` — API ตรวจสิทธิ์ที่ระดับ **permission** ไม่ใช่ชื่อ role (role เป็นเพียงชุด permission ที่กำหนดไว้ล่วงหน้า) และตรวจ **ขอบเขตบริษัท** ซ้ำอีกชั้นเสมอตามกฎ row-level scoping ใน `02-data-model.md` หัวข้อ 5

### 2.1 Auth (6 endpoint)

| Method | Path | สิทธิ์ | Request (ย่อ) | Response (ย่อ) | Status |
|---|---|---|---|---|---|
| POST | `/auth/login` | สาธารณะ | `username`, `password` | `access_token`, `refresh_token`, `user` | 200 / 401 / 423 / 429 |
| POST | `/auth/refresh` | สาธารณะ (ต้องมี refresh token) | `refresh_token` | `access_token`, `refresh_token` | 200 / 401 |
| POST | `/auth/logout` | ล็อกอินแล้ว | `refresh_token` | — | 204 |
| GET | `/auth/me` | ล็อกอินแล้ว | — | โปรไฟล์ + `roles[]` + `permissions[]` + `scoped_companies[]` | 200 |
| POST | `/auth/change-password` | ล็อกอินแล้ว | `current_password`, `new_password` | — | 204 / 400 |
| GET | `/health` | สาธารณะ | — | `status`, `db`, `redis`, `version` | 200 / 503 |

### 2.2 Users (8 endpoint)

| Method | Path | สิทธิ์ | Request (ย่อ) | Response (ย่อ) | Status |
|---|---|---|---|---|---|
| GET | `/users` | `user.read` | filter: `company_id`, `role`, `is_active`, `q` | รายการแบ่งหน้า | 200 / 403 |
| POST | `/users` | `user.create` | `username`, `full_name`, `email`, `company_id`, `department_id`, `roles[]`, `password` | user | 201 / 409 / 422 |
| GET | `/users/{id}` | `user.read` หรือ own | — | user | 200 / 403 / 404 |
| PATCH | `/users/{id}` | `user.update` หรือ own (บางฟิลด์) | ฟิลด์ที่แก้ | user | 200 / 403 |
| DELETE | `/users/{id}` | `user.delete` | — | — | 204 / 409 (มี ticket ค้าง) |
| POST | `/users/{id}/reset-password` | `user.update` | `new_password` (optional) | `temporary_password` | 200 |
| PUT | `/users/{id}/roles` | `user.assign_role` | `roles[]` พร้อม `scoped_company_ids[]` | user | 200 / 403 |
| POST | `/users/import` | `user.create` | multipart: `file` (.xlsx/.csv) | `created`, `updated`, `errors[]` | 200 / 422 |

### 2.3 Companies / Departments (7 endpoint)

| Method | Path | สิทธิ์ | Request (ย่อ) | Response (ย่อ) | Status |
|---|---|---|---|---|---|
| GET | `/companies` | ล็อกอินแล้ว (คืนเฉพาะในขอบเขต) | `is_active` | รายการ (ไม่แบ่งหน้า, มี 7 รายการ) | 200 |
| POST | `/companies` | `company.manage` | `code`, `name_th`, `name_en` | company | 201 / 403 / 409 |
| GET | `/companies/{id}` | ล็อกอินแล้ว + อยู่ในขอบเขต | — | company | 200 / 403 |
| PATCH | `/companies/{id}` | `company.manage` | ฟิลด์ที่แก้ | company | 200 / 403 |
| GET | `/companies/{id}/departments` | ล็อกอินแล้ว + อยู่ในขอบเขต | `is_active` | รายการ | 200 |
| POST | `/departments` | `department.manage` | `company_id`, `name` | department | 201 / 403 |
| PATCH | `/departments/{id}` | `department.manage` | `name`, `is_active` | department | 200 / 403 |

### 2.4 Tickets (11 endpoint)

| Method | Path | สิทธิ์ | Request (ย่อ) | Response (ย่อ) | Status |
|---|---|---|---|---|---|
| GET | `/tickets` | `ticket.read` (scoped) | filter: `status`, `priority`, `company_id`, `category_id`, `assignee_id`, `requester_id`, `sla_status`, `created_from/to`, `q`, `sort`, `page` | รายการแบ่งหน้า | 200 |
| POST | `/tickets` | `ticket.create` | ดูตัวอย่าง 3.2 | ticket เต็ม | 201 / 422 |
| GET | `/tickets/{id}` | `ticket.read` (scoped) | — | ticket + category + requester + assignee + sla | 200 / 403 / 404 |
| PATCH | `/tickets/{id}` | `ticket.update` | `subject`, `description`, `category_id`, `department_id` | ticket | 200 / 403 |
| POST | `/tickets/{id}/status` | `ticket.change_status` | `to_status`, `reason`, `resolution_note` | ticket | 200 / 409 (transition ผิด) |
| POST | `/tickets/{id}/assign` | `ticket.assign` | `assignee_id` (null = ยกเลิกมอบหมาย) | ticket | 200 / 422 |
| POST | `/tickets/{id}/claim` | `ticket.assign_self` | — | ticket | 200 / 409 (มีผู้รับผิดชอบแล้ว) |
| POST | `/tickets/{id}/priority` | `ticket.change_priority` | `priority`, `reason` | ticket (พร้อม due ใหม่) | 200 / 403 |
| GET | `/tickets/{id}/history` | `ticket.read` (scoped) | — | รายการ `ticket_status_history` | 200 |
| DELETE | `/tickets/{id}` | `ticket.delete` | — | — | 204 / 403 |
| GET | `/tickets/export` | `report.export` | filter เหมือน `GET /tickets` + `format=xlsx\|pdf` | ไฟล์ หรือ `{ job_id }` ถ้า > 5,000 แถว | 200 / 202 |

**ค่า `sla_status` ที่รับได้:** `on_track` (ปกติ) / `at_risk` (เหลือ ≤ 20%) / `breached` (เกินกำหนด) / `paused` (`pending_user`)

### 2.5 Comments (3 endpoint)

| Method | Path | สิทธิ์ | Request (ย่อ) | Response (ย่อ) | Status |
|---|---|---|---|---|---|
| GET | `/tickets/{id}/comments` | `ticket.read` (scoped) | `page`, `page_size` | รายการ (กรอง `is_internal` ตาม role อัตโนมัติ) | 200 |
| POST | `/tickets/{id}/comments` | `ticket.comment` | `body`, `is_internal`, `attachment_ids[]` | comment | 201 / 403 (end_user ส่ง `is_internal=true`) |
| PATCH | `/comments/{id}` | ผู้เขียนเอง ภายใน 15 นาที | `body` | comment | 200 / 403 / 409 (หมดเวลาแก้ไข) |

### 2.6 Attachments (3 endpoint)

| Method | Path | สิทธิ์ | Request (ย่อ) | Response (ย่อ) | Status |
|---|---|---|---|---|---|
| POST | `/attachments` | `ticket.create` หรือ `ticket.comment` | multipart: `file`, `ticket_id?`, `comment_id?`, `kb_article_id?` | `id`, `file_name`, `file_size`, `mime_type` | 201 / 413 / 415 |
| GET | `/attachments/{id}/download` | ต้องเห็น ticket/บทความที่ผูกอยู่ | — | `302` ไปยัง signed URL อายุ 15 นาที | 302 / 403 / 404 |
| DELETE | `/attachments/{id}` | ผู้อัปโหลด หรือ `ticket.update` | — | — | 204 / 403 |

**ข้อจำกัดไฟล์:** ≤ 20 MB/ไฟล์, ≤ 5 ไฟล์/คำขอ, อนุญาต `jpg, jpeg, png, gif, webp, pdf, doc, docx, xls, xlsx, csv, txt, zip, mp4` — ตรวจ MIME จากเนื้อไฟล์จริง

### 2.7 Categories (5 endpoint)

| Method | Path | สิทธิ์ | Request (ย่อ) | Response (ย่อ) | Status |
|---|---|---|---|---|---|
| GET | `/categories` | ล็อกอินแล้ว | `company_id`, `is_active`, `tree=true` | รายการ/โครงสร้างต้นไม้ 2 ระดับ | 200 |
| POST | `/categories` | `category.manage` | `company_id?`, `parent_id?`, `code`, `name_th`, `default_priority`, `default_assignee_id?` | category | 201 / 403 |
| GET | `/categories/{id}` | ล็อกอินแล้ว | — | category | 200 |
| PATCH | `/categories/{id}` | `category.manage` | ฟิลด์ที่แก้ | category | 200 / 403 |
| DELETE | `/categories/{id}` | `category.manage` | — | — | 204 / 409 (มี ticket อ้างอิงอยู่ → ใช้ `is_active=false` แทน) |

### 2.8 SLA / Business hours / Holiday (10 endpoint)

| Method | Path | สิทธิ์ | Request (ย่อ) | Response (ย่อ) | Status |
|---|---|---|---|---|---|
| GET | `/sla/policies` | `sla.read` | `company_id` | รายการ policy + targets | 200 |
| POST | `/sla/policies` | `sla.manage` | `company_id?`, `name`, `targets[]` | policy | 201 / 403 |
| GET | `/sla/policies/{id}` | `sla.read` | — | policy + targets | 200 |
| PATCH | `/sla/policies/{id}` | `sla.manage` | `name`, `is_default`, `is_active` | policy | 200 / 403 |
| PUT | `/sla/policies/{id}/targets` | `sla.manage` | `targets[]` ครบ 4 priority | targets | 200 / 422 |
| GET | `/business-hours` | `sla.read` | `company_id` | 7 แถว | 200 |
| PUT | `/business-hours` | `sla.manage` | `company_id?`, `days[]` | 7 แถว | 200 / 403 |
| GET | `/holidays` | `sla.read` | `company_id`, `year` | รายการ | 200 |
| POST | `/holidays` | `sla.manage` | `company_id?`, `holiday_date`, `name` | holiday | 201 / 409 |
| DELETE | `/holidays/{id}` | `sla.manage` | — | — | 204 |

### 2.9 Knowledge Base (10 endpoint)

| Method | Path | สิทธิ์ | Request (ย่อ) | Response (ย่อ) | Status |
|---|---|---|---|---|---|
| GET | `/kb/articles` | ล็อกอินแล้ว (scoped ตาม visibility) | `q`, `kb_category_id`, `company_id`, `status`, `page` | รายการแบ่งหน้า (ไม่รวม `body_markdown`) | 200 |
| POST | `/kb/articles` | `kb.create` | `title`, `body_markdown`, `kb_category_id`, `visibility`, `company_id?`, `source_ticket_id?` | article | 201 / 403 |
| GET | `/kb/articles/{id}` | ล็อกอินแล้ว + เห็นได้ | — | article เต็ม (นับ view +1) | 200 / 403 / 404 |
| PATCH | `/kb/articles/{id}` | `kb.update` | ฟิลด์ที่แก้ | article | 200 / 403 |
| POST | `/kb/articles/{id}/publish` | `kb.publish` | — | article (`status=published`) | 200 / 403 |
| POST | `/kb/articles/{id}/archive` | `kb.publish` | — | article (`status=archived`) | 200 |
| POST | `/kb/articles/{id}/feedback` | ล็อกอินแล้ว | `is_helpful` | `helpful_count`, `not_helpful_count` | 200 / 409 (โหวตซ้ำ) |
| DELETE | `/kb/articles/{id}` | `kb.delete` | — | — | 204 |
| GET | `/kb/categories` | ล็อกอินแล้ว | `tree=true` | รายการ | 200 |
| POST | `/kb/categories` | `kb.manage_category` | `name_th`, `parent_id?` | category | 201 / 403 |

### 2.10 Dashboard / Reports (7 endpoint)

| Method | Path | สิทธิ์ | Request (ย่อ) | Response (ย่อ) | Status |
|---|---|---|---|---|---|
| GET | `/dashboard/summary` | `dashboard.view` | `company_id?`, `date_from`, `date_to` | การ์ดสรุป 4 ตัว + สัดส่วนตามสถานะ/priority | 200 |
| GET | `/dashboard/by-company` | `dashboard.view` | `date_from`, `date_to` | นับแยกบริษัท (แสดงเฉพาะบริษัทในขอบเขต) | 200 |
| GET | `/dashboard/by-category` | `dashboard.view` | `company_id?`, ช่วงวันที่, `limit` | top N หมวดหมู่ | 200 |
| GET | `/dashboard/by-assignee` | `dashboard.view` | `company_id?`, ช่วงวันที่ | ภาระงานรายผู้รับผิดชอบ | 200 |
| GET | `/dashboard/trend` | `dashboard.view` | `company_id?`, `days` (ค่าเริ่มต้น 30) | อนุกรมเวลา สร้าง/ปิด รายวัน | 200 |
| GET | `/reports/sla-compliance` | `report.view` | `company_id?`, `month` (`YYYY-MM`) | สรุป SLA แยก priority/บริษัท | 200 |
| GET | `/reports/{report_name}/export` | `report.export` | `format=xlsx\|pdf` + filter ของรายงานนั้น | ไฟล์ หรือ `{ job_id }` | 200 / 202 |

### 2.11 Notifications (8 endpoint)

| Method | Path | สิทธิ์ | Request (ย่อ) | Response (ย่อ) | Status |
|---|---|---|---|---|---|
| GET | `/notifications` | ล็อกอินแล้ว (ของตนเอง) | `is_read`, `page` | รายการ in-app แบ่งหน้า | 200 |
| GET | `/notifications/unread-count` | ล็อกอินแล้ว | — | `{ "count": 5 }` | 200 |
| POST | `/notifications/{id}/read` | เจ้าของ | — | — | 204 |
| POST | `/notifications/read-all` | ล็อกอินแล้ว | — | `{ "updated": 12 }` | 200 |
| GET | `/notifications/channels` | ล็อกอินแล้ว | — | รายการช่องทางของตน | 200 |
| PUT | `/notifications/channels` | ล็อกอินแล้ว | `channels[]` (`channel`, `destination`, `is_enabled`) | รายการช่องทางของตน | 200 / 422 |

**LINE binding (2 endpoint)**

| Method | Path | สิทธิ์ | Response |
|---|---|---|---|
| POST | `/notifications/line/bind-url` | ล็อกอินแล้ว | `{ "bind_url": "...", "expires_at": "..." }` |
| POST | `/notifications/line/callback` | สาธารณะ (ตรวจลายเซ็น) | 204 |

### 2.12 Admin / System (6 endpoint)

| Method | Path | สิทธิ์ | Request (ย่อ) | Response (ย่อ) | Status |
|---|---|---|---|---|---|
| GET | `/admin/audit-logs` | `audit.read` | `actor_id`, `action`, `entity_type`, `entity_id`, `company_id`, ช่วงวันที่, `page` | รายการแบ่งหน้า | 200 / 403 |
| GET | `/admin/roles` | `role.read` | — | รายการ role + permissions | 200 |
| PUT | `/admin/roles/{id}/permissions` | `role.manage` | `permission_codes[]` | role | 200 / 403 |
| GET | `/admin/permissions` | `role.read` | — | รายการ permission จัดกลุ่ม | 200 |
| GET | `/admin/jobs/{job_id}` | เจ้าของงาน | — | `status`, `progress`, `download_url` | 200 / 404 |
| GET | `/admin/system-info` | `system.manage` | — | เวอร์ชัน, จำนวนผู้ใช้/ticket, เวลา backup ล่าสุด | 200 / 403 |

### 2.13 สรุปจำนวน endpoint

| กลุ่ม | จำนวน |
|---|---|
| Auth | 6 |
| Users | 8 |
| Companies / Departments | 7 |
| Tickets | 11 |
| Comments | 3 |
| Attachments | 3 |
| Categories | 5 |
| SLA / Business hours / Holiday | 10 |
| Knowledge Base | 10 |
| Dashboard / Reports | 7 |
| Notifications | 8 |
| Admin / System | 6 |
| **รวม** | **84** |

---

## 3. ตัวอย่าง JSON ของ Endpoint สำคัญ

### 3.1 เข้าสู่ระบบ — `POST /api/v1/auth/login`

**Request**
```json
{
  "username": "somchai.k",
  "password": "P@ssw0rd123"
}
```

**Response 200**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 1800,
  "must_change_password": false,
  "user": {
    "id": 145,
    "username": "somchai.k",
    "full_name": "สมชาย กิตติวัฒน์",
    "email": "somchai.k@aidc.co.th",
    "company": { "id": 7, "code": "AIDC-LOG", "name_th": "เอไอดีซี โลจิสติกส์" },
    "department": { "id": 22, "name": "คลังสินค้า" },
    "roles": ["agent"],
    "scoped_companies": [
      { "id": 7, "code": "AIDC-LOG" },
      { "id": 2, "code": "AIDC-CON" }
    ],
    "permissions": ["ticket.read", "ticket.create", "ticket.assign", "ticket.comment", "ticket.change_status", "kb.create"]
  }
}
```

**Response 401**
```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
    "request_id": "01J9X2K7M4N8Q3"
  }
}
```

**Response 423** (บัญชีถูกล็อกจากการกรอกผิดเกิน 5 ครั้ง)
```json
{
  "error": {
    "code": "ACCOUNT_LOCKED",
    "message": "บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่อีกครั้งใน 15 นาที",
    "details": [{ "field": "locked_until", "message": "2026-08-31T09:45:00+07:00" }],
    "request_id": "01J9X2K7M4N8Q4"
  }
}
```

### 3.2 สร้าง Ticket — `POST /api/v1/tickets`

**Request** (แนบไฟล์โดยอัปโหลดผ่าน `POST /attachments` ก่อน แล้วส่ง `attachment_ids`)
```json
{
  "subject": "เครื่องยิงบาร์โค้ดคลัง 2 อ่านไม่ติด",
  "description": "เครื่องยิงบาร์โค้ด 3 ตัวที่โซนรับสินค้าคลัง 2 อ่านไม่ติดตั้งแต่เช้า ทำให้รับของเข้าระบบไม่ได้ มีรถรอคิวอยู่ 4 คัน",
  "category_id": 78,
  "priority": "critical",
  "company_id": 7,
  "department_id": 22,
  "requester_id": 145,
  "source": "mobile_web",
  "attachment_ids": [9012, 9013]
}
```

| ฟิลด์ | บังคับ | หมายเหตุ |
|---|---|---|
| `subject`, `description`, `category_id`, `priority` | ✔ | 4 ฟิลด์บังคับตาม NFR-33 |
| `company_id` | — | ค่าเริ่มต้น = บริษัทของผู้เรียก; ระบุได้เฉพาะเมื่ออยู่ในขอบเขตสิทธิ์ |
| `requester_id` | — | ค่าเริ่มต้น = ผู้เรียก; ระบุคนอื่นได้เฉพาะ role `agent` ขึ้นไป |

**Response 201**
```json
{
  "id": 1042,
  "ticket_no": "AIDC-LOG-202608-0042",
  "subject": "เครื่องยิงบาร์โค้ดคลัง 2 อ่านไม่ติด",
  "description": "เครื่องยิงบาร์โค้ด 3 ตัวที่โซนรับสินค้า...",
  "status": "new",
  "priority": "critical",
  "source": "mobile_web",
  "company": { "id": 7, "code": "AIDC-LOG", "name_th": "เอไอดีซี โลจิสติกส์" },
  "department": { "id": 22, "name": "คลังสินค้า" },
  "category": { "id": 78, "code": "LOG", "name_th": "เครื่องยิงบาร์โค้ด/เครื่องพิมพ์ฉลาก", "parent_name_th": "ระบบขนส่ง" },
  "requester": { "id": 145, "full_name": "สมชาย กิตติวัฒน์" },
  "assignee": null,
  "sla": {
    "policy_id": 1,
    "response_due_at": "2026-08-31T09:45:00+07:00",
    "resolution_due_at": "2026-08-31T13:15:00+07:00",
    "first_response_at": null,
    "status": "on_track",
    "remaining_minutes": 240,
    "is_response_breached": false,
    "is_resolution_breached": false
  },
  "attachments": [
    { "id": 9012, "file_name": "scanner-error.jpg", "file_size": 1843200, "mime_type": "image/jpeg" },
    { "id": 9013, "file_name": "คิวรถรอ.jpg", "file_size": 2011340, "mime_type": "image/jpeg" }
  ],
  "reopen_count": 0,
  "created_at": "2026-08-31T09:15:00+07:00",
  "updated_at": "2026-08-31T09:15:00+07:00"
}
```

### 3.3 รายการ Ticket พร้อม Filter — `GET /api/v1/tickets`

**Request**
```
GET /api/v1/tickets?status=new,assigned,in_progress&priority=critical,high&company_id=7&sla_status=at_risk,breached&created_from=2026-08-01&sort=-priority,resolution_due_at&page=1&page_size=20
Authorization: Bearer <token>
```

**Response 200**
```json
{
  "items": [
    {
      "id": 1042,
      "ticket_no": "AIDC-LOG-202608-0042",
      "subject": "เครื่องยิงบาร์โค้ดคลัง 2 อ่านไม่ติด",
      "status": "in_progress",
      "priority": "critical",
      "company": { "id": 7, "code": "AIDC-LOG" },
      "category": { "id": 78, "name_th": "เครื่องยิงบาร์โค้ด/เครื่องพิมพ์ฉลาก" },
      "requester": { "id": 145, "full_name": "สมชาย กิตติวัฒน์" },
      "assignee": { "id": 88, "full_name": "ปิยะ ศรีสุข" },
      "sla": {
        "resolution_due_at": "2026-08-31T13:15:00+07:00",
        "status": "at_risk",
        "remaining_minutes": 42
      },
      "comment_count": 3,
      "attachment_count": 2,
      "created_at": "2026-08-31T09:15:00+07:00",
      "updated_at": "2026-08-31T11:02:00+07:00"
    }
  ],
  "page": 1,
  "page_size": 20,
  "total": 7,
  "total_pages": 1
}
```

### 3.4 เปลี่ยนสถานะ — `POST /api/v1/tickets/1042/status`

**Request**
```json
{
  "to_status": "pending_user",
  "reason": "รอผู้แจ้งยืนยันว่าเปลี่ยนสายเชื่อมต่อแล้วอาการดีขึ้นหรือไม่",
  "comment": "รบกวนลองเปลี่ยนสาย USB ของเครื่องยิงตัวที่ 2 แล้วแจ้งผลกลับด้วยครับ"
}
```

| ฟิลด์ | บังคับ | หมายเหตุ |
|---|---|---|
| `to_status` | ✔ | ต้องเป็น transition ที่อนุญาต (ดู `02-data-model.md` หัวข้อ 4) |
| `reason` | ✔ เมื่อ `to_status` เป็น `cancelled`, `pending_user` หรือกรณี reopen | |
| `resolution_note` | ✔ เมื่อ `to_status = resolved` | |
| `comment` | — | ถ้าระบุ ระบบสร้างคอมเมนต์สาธารณะให้อัตโนมัติ |

**Response 200**
```json
{
  "id": 1042,
  "ticket_no": "AIDC-LOG-202608-0042",
  "status": "pending_user",
  "sla": {
    "status": "paused",
    "resolution_due_at": "2026-08-31T13:15:00+07:00",
    "paused_at": "2026-08-31T11:30:00+07:00",
    "pending_duration_minutes": 0
  },
  "updated_at": "2026-08-31T11:30:00+07:00"
}
```

**Response 409** (เปลี่ยนสถานะที่ไม่อนุญาต)
```json
{
  "error": {
    "code": "INVALID_STATE_TRANSITION",
    "message": "ไม่สามารถเปลี่ยนสถานะจาก 'new' ไปเป็น 'resolved' ได้",
    "details": [{ "field": "to_status", "message": "สถานะที่เปลี่ยนได้จาก 'new' คือ assigned, cancelled" }],
    "request_id": "01J9X2K7M4N8Q9"
  }
}
```

### 3.5 มอบหมายงาน — `POST /api/v1/tickets/1042/assign`

**Request**
```json
{
  "assignee_id": 88,
  "note": "ปิยะอยู่ใกล้คลัง 2 ให้เข้าดูหน้างานก่อน"
}
```

**Response 200**
```json
{
  "id": 1042,
  "ticket_no": "AIDC-LOG-202608-0042",
  "status": "assigned",
  "assignee": { "id": 88, "full_name": "ปิยะ ศรีสุข", "email": "piya.s@aidc.co.th" },
  "previous_assignee": null,
  "notifications_sent": ["in_app", "line"],
  "updated_at": "2026-08-31T09:22:00+07:00"
}
```

**Response 422** (ผู้รับผิดชอบไม่มีสิทธิ์ในบริษัทของ ticket)
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "ไม่สามารถมอบหมายงานให้ผู้ใช้รายนี้ได้",
    "details": [{ "field": "assignee_id", "message": "ผู้ใช้ไม่มีสิทธิ์ดูแล ticket ของบริษัท AIDC-LOG" }],
    "request_id": "01J9X2K7M4N8QA"
  }
}
```

### 3.6 สรุป Dashboard — `GET /api/v1/dashboard/summary`

**Request**
```
GET /api/v1/dashboard/summary?date_from=2026-08-01&date_to=2026-08-31
```

**Response 200**
```json
{
  "period": { "date_from": "2026-08-01", "date_to": "2026-08-31" },
  "scope": {
    "companies": [
      { "id": 2, "code": "AIDC-CON" },
      { "id": 7, "code": "AIDC-LOG" }
    ]
  },
  "cards": {
    "open_tickets": 43,
    "overdue_tickets": 6,
    "closed_today": 12,
    "avg_resolution_business_minutes": 386
  },
  "by_status": [
    { "status": "new", "count": 9 },
    { "status": "assigned", "count": 11 },
    { "status": "in_progress", "count": 17 },
    { "status": "pending_user", "count": 6 },
    { "status": "resolved", "count": 14 },
    { "status": "closed", "count": 128 },
    { "status": "cancelled", "count": 4 }
  ],
  "by_priority": [
    { "priority": "critical", "count": 5 },
    { "priority": "high", "count": 21 },
    { "priority": "medium", "count": 42 },
    { "priority": "low", "count": 18 }
  ],
  "sla": {
    "total_measured": 168,
    "response_met": 161,
    "response_met_percent": 95.8,
    "resolution_met": 149,
    "resolution_met_percent": 88.7
  }
}
```

### 3.7 รายงาน SLA รายเดือน — `GET /api/v1/reports/sla-compliance?month=2026-08`

**Response 200 (ย่อ)**
```json
{
  "month": "2026-08",
  "rows": [
    {
      "company": { "id": 7, "code": "AIDC-LOG", "name_th": "เอไอดีซี โลจิสติกส์" },
      "priority": "critical",
      "ticket_count": 5,
      "response_met": 5,
      "resolution_met": 4,
      "resolution_met_percent": 80.0,
      "avg_response_business_minutes": 18,
      "avg_resolution_business_minutes": 196
    }
  ],
  "totals": {
    "ticket_count": 168,
    "resolution_met_percent": 88.7
  }
}
```

---

## 4. เหตุการณ์ที่ทำให้เกิดการแจ้งเตือน (ผูกกับ endpoint)

| Endpoint ที่ทำให้เกิด | `event_type` | ผู้รับ |
|---|---|---|
| `POST /tickets` | `ticket_created` | ผู้แจ้ง (ยืนยัน), agent/company_admin ของบริษัทนั้น |
| `POST /tickets/{id}/assign` และ `/claim` | `ticket_assigned` | ผู้รับผิดชอบใหม่ |
| `POST /tickets/{id}/comments` (`is_internal=false`) | `comment_added` | ผู้แจ้ง + ผู้รับผิดชอบ (ยกเว้นผู้เขียนเอง) |
| `POST /tickets/{id}/status` | `status_changed` | ผู้แจ้ง + ผู้รับผิดชอบ |
| งานเบื้องหลังทุก 5 นาที | `sla_warning` | ผู้รับผิดชอบ |
| งานเบื้องหลังทุก 5 นาที | `sla_breached` | ผู้รับผิดชอบ + company_admin |
| สถานะเป็น `resolved` | `ticket_resolved` | ผู้แจ้ง |
| สถานะเป็น `closed` | `ticket_closed` | ผู้แจ้ง + ผู้รับผิดชอบ |

---

## 5. งานเบื้องหลัง (Background Jobs)

| งาน | ความถี่ | หน้าที่ |
|---|---|---|
| `scan_sla` | ทุก 5 นาที | ตรวจ ticket ที่ใกล้ครบ/เกิน SLA แล้วสร้าง notification |
| `send_notifications` | ต่อเนื่อง (queue) | ส่ง email/LINE พร้อม retry 3 ครั้ง (1, 5, 15 นาที) |
| `auto_close_resolved` | ทุกวัน 06:00 | ปิด ticket ที่ `resolved` เกิน 3 วันทำการ |
| `auto_resolve_pending` | ทุกวัน 06:00 | ตั้ง `resolved` ให้ ticket ที่ `pending_user` เกิน 5 วันทำการ |
| `export_job` | ตามคำขอ | สร้างไฟล์ export ขนาดใหญ่ (> 5,000 แถว) |
| `db_backup` | ทุกวัน 01:00 | `pg_dump` ตามนโยบายใน ADR-001 |

---

## 6. รหัสข้อผิดพลาดมาตรฐาน

| HTTP | `code` | ข้อความที่แสดงผู้ใช้ | เมื่อใด |
|---|---|---|---|
| 400 | `INVALID_PARAMETER` | พารามิเตอร์ไม่ถูกต้อง | query/path parameter ผิดรูปแบบหรือไม่รู้จัก |
| 400 | `BAD_REQUEST` | คำขอไม่ถูกต้อง | รูปแบบ JSON เสียหาย |
| 401 | `UNAUTHENTICATED` | กรุณาเข้าสู่ระบบใหม่ | ไม่มี token |
| 401 | `INVALID_CREDENTIALS` | ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง | ล็อกอินผิด |
| 401 | `TOKEN_EXPIRED` | เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่ | access token หมดอายุ (FE ต้องลอง refresh อัตโนมัติ 1 ครั้ง) |
| 401 | `INVALID_TOKEN` | โทเคนไม่ถูกต้อง | token เสียหาย/ถูกเพิกถอน |
| 403 | `FORBIDDEN` | คุณไม่มีสิทธิ์ดำเนินการนี้ | ไม่มี permission |
| 403 | `OUT_OF_SCOPE` | ข้อมูลนี้อยู่นอกขอบเขตสิทธิ์ของคุณ | เข้าถึงข้อมูลข้ามบริษัท |
| 403 | `PASSWORD_CHANGE_REQUIRED` | กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน | `must_change_password = true` |
| 404 | `NOT_FOUND` | ไม่พบข้อมูลที่ต้องการ | ไม่พบ หรือถูก soft delete |
| 409 | `CONFLICT` | ข้อมูลขัดแย้งกับสถานะปัจจุบัน | กรณีทั่วไป |
| 409 | `DUPLICATE_ENTRY` | ข้อมูลนี้มีอยู่แล้วในระบบ | ละเมิด UNIQUE เช่น username ซ้ำ |
| 409 | `INVALID_STATE_TRANSITION` | ไม่สามารถเปลี่ยนสถานะได้ | transition ไม่อยู่ใน state machine |
| 409 | `ALREADY_ASSIGNED` | มีผู้รับผิดชอบเรื่องนี้แล้ว | `claim` ซ้ำ |
| 409 | `EDIT_WINDOW_EXPIRED` | หมดเวลาแก้ไขข้อความแล้ว | แก้คอมเมนต์เกิน 15 นาที |
| 409 | `RESOURCE_IN_USE` | ไม่สามารถลบได้เพราะมีการใช้งานอยู่ | ลบ category/user ที่ถูกอ้างอิง |
| 413 | `FILE_TOO_LARGE` | ไฟล์ใหญ่เกิน 20 MB | อัปโหลดไฟล์ใหญ่ |
| 415 | `UNSUPPORTED_FILE_TYPE` | ไม่รองรับไฟล์ประเภทนี้ | นามสกุล/MIME ไม่อยู่ใน allowlist |
| 422 | `VALIDATION_ERROR` | ข้อมูลไม่ถูกต้อง | ตรวจ body ไม่ผ่าน (มี `details[]` เสมอ) |
| 423 | `ACCOUNT_LOCKED` | บัญชีถูกล็อกชั่วคราว | กรอกรหัสผิดครบ 5 ครั้ง |
| 423 | `ACCOUNT_DISABLED` | บัญชีนี้ถูกปิดใช้งาน | `is_active = false` |
| 429 | `RATE_LIMITED` | มีคำขอมากเกินไป กรุณารอสักครู่ | เกิน rate limit |
| 500 | `INTERNAL_ERROR` | ระบบขัดข้อง กรุณาแจ้งผู้ดูแลระบบ | ข้อผิดพลาดที่ไม่คาดคิด (แนบ `request_id` เสมอ) |
| 503 | `SERVICE_UNAVAILABLE` | ระบบอยู่ระหว่างปรับปรุง | ปิดปรับปรุง / DB ไม่ตอบสนอง |

**กติกาสำหรับ Frontend**
1. `TOKEN_EXPIRED` → เรียก `/auth/refresh` อัตโนมัติหนึ่งครั้ง แล้วลองคำขอเดิมซ้ำ ถ้ายังล้มเหลวจึงพากลับหน้าล็อกอิน
2. `VALIDATION_ERROR` → แสดง `details[].message` ที่ฟิลด์ที่เกี่ยวข้อง
3. `INTERNAL_ERROR` → แสดง `message` พร้อม `request_id` ให้ผู้ใช้แจ้งผู้ดูแล
4. รหัสอื่นทั้งหมด → แสดง `error.message` ได้ตรง ๆ (ข้อความเป็นภาษาไทยที่แสดงผู้ใช้ได้แล้ว)
