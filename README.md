# AIDC Helpdesk — Group Service Desk

ระบบ helpdesk แบบ web application สำหรับพนักงานกลุ่มบริษัท AIDC 7 บริษัท
(AIDC HQ · AIDC Construction · Cosi · Heavy Machine · AIDC Tech · AIDC Trading · AIDC Logistic)

---

## ทีมงาน

| บทบาท | ผู้รับผิดชอบ |
|---|---|
| Project Manager | คุณ (PM) |
| System Analyst | AI agent — `.claude/agents/system-analyst.md` |
| Senior Backend | AI agent — `.claude/agents/senior-backend.md` |
| Senior Frontend | AI agent — `.claude/agents/senior-frontend.md` |

เรียกใช้ทีมได้จาก Claude Code / Cowork ในโฟลเดอร์นี้ เช่น "ให้ system-analyst ทบทวน requirement เรื่อง approval flow"

---

## สถานะโปรเจกต์

เฟสปัจจุบัน: **ตัดสิน stack และทิศทาง UI แล้ว — กำลังปรับเอกสารให้ตรงเอกสารควบคุมก่อนเริ่มเขียนโค้ด (Phase 0)**

| การตัดสินใจ | ผล | เอกสาร |
|---|---|---|
| Tech stack | Next.js 15 + Tailwind (เว็บ) · FastAPI + Celery (API/worker) · PostgreSQL 16 | [ADR-002](docs/07-adr-002-tech-stack.md) |
| ทิศทาง UI | แนวทาง B — พาเลตต์เชิงความหมาย 15 คู่ · Noto Sans Thai · มุม 8px | [ADR-003](docs/08-adr-003-ui-direction.md) |

> ⚠️ **สิ่งที่ต้องทำก่อนเขียนโค้ด:** เอกสาร `01`–`04`, `11`, `20`–`22` เขียนขึ้น **ก่อน** ได้รับเอกสารควบคุมจริง
> และ `05-sla-policy-alignment.md` พบว่าไม่ตรงกัน **20 จุด (G-01…G-20)** — ต้อง sync ให้เสร็จก่อน
> มิฉะนั้นจะได้ระบบที่ผิด AIDC-IT-SLA-001 v1.1 ตั้งแต่บรรทัดแรก

---

## เอกสาร (`docs/`)

### วิเคราะห์ระบบ — System Analyst
| ไฟล์ | เนื้อหา |
|---|---|
| `00-tech-stack-decision.md` | ADR-001 — ⚠️ ถูกแทนที่โดย ADR-002 (ฝั่ง backend ยังใช้ได้ทั้งหมด) |
| `07-adr-002-tech-stack.md` | **ADR-002** — stack ที่ใช้จริง: Next.js + Tailwind / FastAPI / Celery / PostgreSQL |
| `08-adr-003-ui-direction.md` | **ADR-003** — ทิศทาง UI แนวทาง B + สิ่งที่ยกมาจาก prototype |
| `01-srs.md` | ข้อกำหนดระบบ FR 50 ข้อ · NFR 30 ข้อ · user story 18 ข้อ |
| `02-data-model.md` | ER diagram · 20 entity · state machine ของ ticket · seed data |
| `03-api-spec.md` | API contract 84 endpoint · error code 24 รหัส |
| `04-rbac-sla.md` | Permission matrix 43 สิทธิ์ × 5 role (SLA ปรับตามเอกสารจริงแล้ว) |
| `05-sla-policy-alignment.md` | เทียบระบบกับ **AIDC-IT-SLA-001 v1.1** — gap analysis + seed จริง |
| `06-sop-workflow-mapping.md` | แปลง SOP-01…SOP-10 และนโยบายไอที เป็นความต้องการของระบบ |

### สถาปัตยกรรม — Senior Backend
| ไฟล์ | เนื้อหา |
|---|---|
| `10-backend-architecture.md` | โครงสร้างชั้น · multi-tenant scoping · auth · attachment |
| `11-sla-engine.md` | อัลกอริทึมนับเวลาทำการ + โค้ด Python ที่ผ่านเทสต์ 35 assertion |
| `12-backend-implementation-plan.md` | แผน sprint · migration · test strategy · notification |
| `13-deployment.md` | docker-compose · Dockerfile · nginx · backup/restore |

### UI/UX — Senior Frontend
| ไฟล์ | เนื้อหา |
|---|---|
| `20-frontend-architecture.md` | โครงสร้าง feature-based · data fetching · auth flow |
| `21-ui-ux-design.md` | Sitemap · user flow · wireframe 8 หน้า · design system |
| `22-component-spec.md` | Component inventory + props · Zod validation · ตารางคำศัพท์ |
| `23-frontend-implementation-plan.md` | แผน sprint frontend · DoD · แผนทดสอบ e2e |

### เอกสารอ้างอิงขององค์กร (`docs/reference/`)
| ไฟล์ | เนื้อหา |
|---|---|
| `AIDC-IT-SLA-001.txt` | ข้อตกลงระดับการให้บริการ v1.1 (ข้อความที่สกัดจาก .docx) |
| `AIDC-IT-SOP.txt` | กลยุทธ์ นโยบาย และ SOP-01…SOP-10 |

---

## Prototype (`prototype/`)

`AIDC_Helpdesk_Portal_v2.html` — เปิดด้วยเบราว์เซอร์ได้ทันที ไม่ต้อง build
ครบ 10 หน้าจอ: เข้าสู่ระบบ SSO · แจ้งเรื่องใหม่ (มี AI Knowledge Assistant + Auto Routing) ·
คิวงาน · Executive Dashboard · ITAM · กฎมอบหมาย & SLA · คลังความรู้ · แผงรายละเอียดตั๋ว ·
ส่งต่อข้ามบริษัท · CSAT — รองรับมือถือและโหมดมืด

> ⚠️ prototype เป็น **เอกสารอ้างอิงเชิงเทคนิค ไม่ใช่ต้นแบบภาพ** แล้ว — ภาษาภาพยึดตาม ADR-003 (แนวทาง B)
> และโมเดลข้อมูลใน prototype ยังเป็นรุ่นก่อนปรับตามเอกสารควบคุม (สถานะ 4 ค่าแทนที่จะเป็น 7, ผู้แจ้งเลือกระดับเอง, มี LINE เป็นช่องทางรับแจ้ง)

---

## SLA ที่ระบบบังคับใช้ (อ้างอิง AIDC-IT-SLA-001 v1.1)

| ระดับ | เวลาตอบรับ | เวลาแก้ไข | การนับเวลา |
|---|---|---|---|
| P1 – Critical | 15 นาที | 4 ชั่วโมง | ต่อเนื่อง 24×7 |
| P2 – High | 30 นาที | 8 ชั่วโมงทำการ | เวลาทำการ |
| P3 – Medium | 2 ชั่วโมงทำการ | 2 วันทำการ | เวลาทำการ |
| P4 – Low | 4 ชั่วโมงทำการ | 5 วันทำการ | เวลาทำการ |

เวลาทำการ: **จันทร์–ศุกร์ 08:30–17:30** (ยกเว้นวันหยุดบริษัท) · On-call P1 ตลอด 24 ชั่วโมง
เป้าหมายรวม: SLA compliance ≥ 95% · CSAT ≥ 4.2/5 · Uptime ระบบ Critical ≥ 99.9%

---

## เรื่องที่รอ PM ตัดสินใจ

ดูรายการเต็มใน `05-sla-policy-alignment.md` (Q-01…Q-09) และ `01-srs.md` (A-01…A-12) — ที่เป็นตัวบล็อก:

1. เอกสาร SLA เป็นของ **AIDC Tech** เท่านั้น — อีก 6 บริษัทใช้ชุดเดียวกันหรือแยก policy
2. ปฏิทินวันหยุดฉบับทางการ (ไทยหรือ สปป.ลาว — โดเมนอีเมลในเอกสารคือ `.com.la`)
3. ปลายทาง backup นอกเซิร์ฟเวอร์หลัก — เป็น blocker ก่อน go-live
4. ช่องทางแจ้งเตือน: LINE Notify ปิดบริการแล้ว ต้องเลือกระหว่าง Teams webhook / LINE OA / อีเมลอย่างเดียว
5. ขอบเขต helpdesk: เฉพาะ IT หรือรวม HR / จัดซื้อ / ซ่อมบำรุง
