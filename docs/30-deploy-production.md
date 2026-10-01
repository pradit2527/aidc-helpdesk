# คู่มือขึ้นระบบจริง — Vercel + Render + Neon

เอกสารนี้พาไปทีละขั้นจนระบบใช้งานได้จริงบนอินเทอร์เน็ต

| ส่วน | โฮสต์ที่ใช้ | เหตุผล |
|---|---|---|
| หน้าเว็บ (Next.js) | **Vercel** | รองรับ App Router กับ middleware เต็มรูปแบบ |
| API (NestJS) | **Render** (สิงคโปร์) | รันโปรเซสค้างได้ ซึ่ง Vercel ทำไม่ได้ · ใกล้ลาวที่สุดเท่าที่มี |
| ฐานข้อมูล | **Neon** | Postgres 17 · มีชั้นฟรี · รองรับ `pg_trgm` กับ `unaccent` |
| คิวงาน | **Upstash Redis** | ไม่บังคับ — ไม่มีก็ยังใช้งานได้ แค่ไม่มีการประเมิน SLA อัตโนมัติ |

---

## ทำไมไม่เอา NestJS ขึ้น Vercel ด้วย

Vercel รันโค้ดแบบ serverless คือปลุกขึ้นมาตอบคำขอแล้วดับ ซึ่งขัดกับสองอย่างที่ระบบนี้ต้องการ

1. **BullMQ worker ต้องรันค้างตลอดเวลา** เพื่อรอคิวงานประเมิน SLA ทุก 5 นาที
   บน serverless ไม่มีโปรเซสที่อยู่ยาวพอจะทำแบบนั้น
2. **connection pool ของ Postgres** — serverless แต่ละครั้งเปิด connection ใหม่
   ระบบที่มีคนใช้พร้อมกันจะกิน connection จนเต็มโควตาของฐานข้อมูล

---

## ⚠️ จุดที่พังบ่อยที่สุด อ่านก่อนเริ่ม

**หน้าเว็บต้องคุยกับ API ผ่านโดเมนของตัวเอง ห้ามเรียกข้ามโดเมน**

ระบบยืนยันตัวตนด้วยคุกกี้ `SameSite=Strict` ซึ่งเบราว์เซอร์จะไม่ส่งข้ามโดเมนให้
ถ้าตั้งให้หน้าเว็บยิงไป `onrender.com` ตรง ๆ จะล็อกอินไม่ได้เลย
และอาการที่เห็นคือ "ล็อกอินสำเร็จแล้วเด้งกลับหน้าล็อกอิน" ซึ่งไล่หาสาเหตุยากมาก

วิธีที่ถูกคือให้ Next.js เป็นตัวส่งต่อ (มีอยู่แล้วใน `next.config.ts`)

```
เบราว์เซอร์ → aidc-helpdesk.vercel.app/api/v1/*  →  Render
                    ↑ เบราว์เซอร์เห็นแค่โดเมนเดียว คุกกี้จึงทำงาน
```

จึงต้องตั้ง `BACKEND_ORIGIN` ที่ **Vercel** ไม่ใช่ `NEXT_PUBLIC_API_BASE_URL`

---

## ขั้นที่ 1 — ฐานข้อมูล (Neon)

1. สมัครที่ https://neon.tech แล้วสร้างโปรเจกต์
   - Region: **Singapore (ap-southeast-1)** ใกล้ลาวที่สุด
   - Postgres version: 17
2. คัดลอก connection string มา หน้าตาแบบนี้

```
postgresql://user:pass@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

> โค้ดเปิด SSL ให้อัตโนมัติเมื่อ host ไม่ใช่ localhost จึงไม่ต้องตั้งอะไรเพิ่ม

**ต้องมีสองบัญชี** ตามที่ `.env.example` อธิบายไว้
- `MIGRATE_URL` — บัญชีเจ้าของ schema ใช้ตอนสร้างตาราง (ต้องมีสิทธิ์ `CREATE EXTENSION`)
- `DATABASE_URL` — บัญชีที่แอปใช้ตอนรัน ไม่ต้องมีสิทธิ์ DDL

บนชั้นฟรีของ Neon ใช้บัญชีเดียวกันไปก่อนได้ แต่**ก่อนใช้งานจริงควรแยก**
เพราะถ้าแอปถูกเจาะ ผู้โจมตีจะลบตารางทิ้งไม่ได้

---

## หมายเหตุเรื่อง base image ของ Docker

`backend/Dockerfile` ใช้ `node:22-slim` (Debian) ไม่ใช่ alpine โดยตั้งใจ

`argon2` ที่ใช้แฮชรหัสผ่านมี prebuild สำหรับ linux แบบ **glibc** เท่านั้น
ส่วน alpine ใช้ **musl** ซึ่งเป็น libc คนละตัว บน alpine ตัวโหลดโมดูลจะเลือก
prebuild ที่สถาปัตยกรรมตรงมาใช้ แล้วล้มตอนรันด้วย

```
Error relocating .../argon2.node: __strdup: symbol not found
```

ที่ร้ายคือมันพังตอน **รัน** ไม่ใช่ตอน build — build ผ่านหมด แล้วค่อยพังบนเซิร์ฟเวอร์

ถ้าจะเปลี่ยนไปใช้ alpine ต้องบังคับให้คอมไพล์ argon2 ใหม่จากซอร์ส
(`npm ci --build-from-source` พร้อมติดตั้ง `python3 make g++`) ซึ่งช้ากว่า
และไม่ได้ประโยชน์อะไรนอกจากประหยัดพื้นที่ราว 30 MB

---

## ขั้นที่ 2 — API (Render)

Render อ่าน [`render.yaml`](../render.yaml) ที่รากของ repo แล้วตั้งค่าเกือบทั้งหมดให้เอง
สิ่งที่ต้องทำด้วยมือจึงเหลือแค่กรอกค่าที่เป็นความลับ

1. https://dashboard.render.com → **New → Blueprint**
2. เลือก repo `aidc-helpdesk` สาขา `master`
3. Render อ่าน `render.yaml` แล้วสร้าง service `aidc-helpdesk-api` (docker · สิงคโปร์)
   โดยใช้ `Dockerfile` ที่รากของ repo — **ไม่ต้องตั้ง Root Directory**

### ค่าที่ต้องกรอกเอง (4 ตัว)

ทุกตัวในไฟล์ blueprint ทำเครื่องหมาย `sync: false` ไว้ Render จะถามตอนสร้าง
และไม่เก็บค่าไว้ใน repo

| key | ค่า |
|---|---|
| `DATABASE_URL` | connection string **แบบ pooled** จาก Neon (ชื่อโฮสต์ลงท้าย `-pooler`) |
| `MIGRATE_URL` | connection string **แบบ direct** (ไม่มี `-pooler`) — 0001 เรียก `CREATE EXTENSION` |
| `JWT_SECRET` | สร้างใหม่เสมอ: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `SEED_ADMIN_PASSWORD` | 12 ตัวขึ้นไป มีพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และอักขระพิเศษ |

ค่าที่เหลือ blueprint ตั้งให้แล้วทั้งหมด — `NODE_ENV` · `TZ=Asia/Vientiane` ·
`COOKIE_SECURE=true` · `TRUST_PROXY_HOPS=1` · `LOCKOUT_ENABLED=false` ·
`JOBS_ENABLED=false` · `MIGRATE_ON_BOOT=true` · `WS_CORS_ORIGIN` · `APP_BASE_URL`

### ตารางฐานข้อมูลสร้างเอง ไม่ต้องเข้า shell

`MIGRATE_ON_BOOT=true` ทำให้แอปรัน migration ที่ค้างอยู่ให้เองก่อนเปิดรับคำขอทุกครั้งที่บูต
ชั้นฟรีของ Render ไม่มี `preDeployCommand` ให้ใช้ ถ้าไม่ทำแบบนี้จะต้องมีคนจำว่า
ต้องเข้า shell ไปรัน `db:migrate:prod` **ก่อน** โค้ดใหม่ขึ้นทุกครั้ง ซึ่งพลาดเมื่อไหร่
โค้ดใหม่จะวิ่งบน schema เก่าแล้วล้มเป็นคำขอ ๆ ไป

> migration ที่ล้มจะทำให้บูตไม่ขึ้นโดยตั้งใจ — เห็นในหน้า Logs ของ deploy นั้นเลย
> ดีกว่าขึ้นมาแล้วตอบ error ทีละคำขอโดยที่ health check ยังเขียว

ส่วน **ข้อมูลตั้งต้น** (บัญชี admin · บทบาท · หมวดหมู่ · ค่า SLA) ยังต้องสั่งเองครั้งเดียว
หลัง deploy แรกสำเร็จ — Render → service → **Shell**

```bash
npm run db:seed:prod
```

> ใช้ไฟล์ที่คอมไพล์แล้วใน `dist/` เพราะ `tsx` เป็น devDependency ที่ถูกตัดออกจาก image
> การเรียก `npm run db:seed` ธรรมดาจะไม่ทำงาน

4. คัดลอก URL สาธารณะที่ Render ให้มา — ปัจจุบันคือ `https://aidc-helpdesk.onrender.com`

---

## ขั้นที่ 3 — หน้าเว็บ (Vercel)

1. https://vercel.com/pradit-s-projects/aidc-helpdesk
2. **Settings → Build and Deployment → Root Directory** ตั้งเป็น

```
frontend
```

   ⚠️ ขั้นนี้ข้ามไม่ได้ — repo นี้เป็น monorepo ที่ไม่มี `package.json` ที่ราก
   ถ้าไม่ตั้ง build จะล้มด้วย `No Next.js version detected`

3. **Settings → Environment Variables**

```bash

# แชทถาม-ตอบ Chatwoot — ไม่ตั้งสองตัวนี้ = ไม่มีปุ่มแชท
NEXT_PUBLIC_CHATWOOT_BASE_URL=https://helpdesk.aidclaos.com
NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN=<website token ของ inbox แบบ Website>
```

   **เซิร์ฟเวอร์ Chatwoot ต้องเป็น https** — หน้าเว็บนี้เป็น https ถ้าแชทเป็น http
   เบราว์เซอร์บล็อกโดยไม่แจ้งอะไรเลย ปุ่มแชทแค่ไม่โผล่
   `NEXT_PUBLIC_*` ถูกฝังตอน build ต้อง Redeploy ทุกครั้งที่แก้
   ส่วน HMAC token ของแชท (`CHATWOOT_HMAC_TOKEN`) เป็นความลับ ตั้งที่ Render ไม่ใช่ที่นี่

   **ห้ามตั้ง `NEXT_PUBLIC_API_BASE_URL`** — ถ้าตั้งเป็น URL เต็มของ Render
   เบราว์เซอร์จะยิงข้ามโดเมนแล้วคุกกี้ `SameSite=Strict` จะไม่ถูกส่งไป
   ปล่อยให้เป็นค่าเริ่มต้น `/api/v1` แล้วให้ Next.js ส่งต่อให้

4. **Deployments → Redeploy**

---

## ขั้นที่ 4 — ตรวจว่าใช้งานได้จริง

```bash
# API ตอบไหม
curl https://aidc-helpdesk.onrender.com/api/v1/livez

# ฐานข้อมูลต่อติดไหม — ต้องได้ database.status = "ok"
curl https://aidc-helpdesk.onrender.com/api/v1/health

# หน้าเว็บส่งต่อไป API ได้ไหม
curl https://aidc-helpdesk.vercel.app/api/v1/livez

# ล็อกอินได้ไหม และคุกกี้ถูกตั้งครบสามตัวไหม
curl -i -X POST https://aidc-helpdesk.vercel.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<รหัสที่ตั้งไว้>"}' | grep -i set-cookie
```

ต้องเห็น `aidc_at`, `aidc_rt`, `aidc_csrf` และสองตัวแรกต้องมี `HttpOnly` กับ `Secure`

---

## สิ่งที่ต้องทำก่อนให้คนจริงใช้

ระบบขึ้นได้แล้วไม่ได้แปลว่าพร้อมให้พนักงาน 5,000 คนใช้

- [ ] **เปลี่ยนรหัสผู้ดูแลทันทีหลัง seed** — รหัสในเครื่องพัฒนาอยู่ใน repo สาธารณะแล้ว
- [ ] **สร้างบัญชีผู้ดูแลคนที่สอง** — ตอนนี้มีคนเดียว ถ้าเข้าไม่ได้คือจบ
- [ ] **เขียน `POST /users/{id}/unlock`** แล้วค่อยตั้ง `LOCKOUT_ENABLED=true`
- [ ] **ตั้ง `TRUST_PROXY_HOPS` ให้ตรงจริง** — ถ้าผิด การจำกัดอัตราการเรียกจะนับ
      ผู้ใช้ทุกคนรวมเป็นก้อนเดียว แล้วบล็อกทั้งบริษัทพร้อมกัน
- [ ] **ตั้งค่า backup ของ Neon** และทดสอบกู้คืนจริงหนึ่งครั้ง
- [ ] **ปฏิทินวันหยุดราชการลาว** — ยังไม่มี ทำให้ SLA คำนวณผิดในวันหยุด
- [ ] endpoint ที่เหลืออีกราว 105 ตัว และหน้าจอ 36 หน้าที่ยังใช้ข้อมูลจำลอง

---

## ค่าใช้จ่าย

| บริการ | ชั้นฟรี | พอไหม |
|---|---|---|
| Vercel Hobby | 100 GB ทราฟฟิก/เดือน | พอสำหรับใช้ภายในองค์กร |
| Render | ชั้นฟรี | หลับเมื่อไม่มีคนใช้ 15 นาที คำขอแรกหลังตื่นช้าราวครึ่งนาที |
| Neon | 0.5 GB · 190 ชม.คอมพิวต์ | พอช่วงทดลอง |
| Upstash | 10,000 คำสั่ง/วัน | พอสำหรับงาน SLA ทุก 5 นาที |

> ⚠️ Vercel Hobby **ห้ามใช้เชิงพาณิชย์** ตามข้อตกลงการใช้งาน
> ระบบภายในองค์กรอยู่ในพื้นที่คลุมเครือ ควรตรวจกับฝ่ายกฎหมายก่อนใช้จริงระยะยาว
