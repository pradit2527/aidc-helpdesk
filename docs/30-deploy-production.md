# คู่มือขึ้นระบบจริง — Vercel + Railway + Neon

เอกสารนี้พาไปทีละขั้นจนระบบใช้งานได้จริงบนอินเทอร์เน็ต

| ส่วน | โฮสต์ที่ใช้ | เหตุผล |
|---|---|---|
| หน้าเว็บ (Next.js) | **Vercel** | รองรับ App Router กับ middleware เต็มรูปแบบ |
| API (NestJS) | **Railway** | รันโปรเซสค้างได้ ซึ่ง Vercel ทำไม่ได้ |
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
ถ้าตั้งให้หน้าเว็บยิงไป `api.railway.app` ตรง ๆ จะล็อกอินไม่ได้เลย
และอาการที่เห็นคือ "ล็อกอินสำเร็จแล้วเด้งกลับหน้าล็อกอิน" ซึ่งไล่หาสาเหตุยากมาก

วิธีที่ถูกคือให้ Next.js เป็นตัวส่งต่อ (มีอยู่แล้วใน `next.config.ts`)

```
เบราว์เซอร์ → aidc-helpdesk.vercel.app/api/v1/*  →  Railway
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

## ขั้นที่ 2 — API (Railway)

1. สมัครที่ https://railway.app แล้ว **New Project → Deploy from GitHub repo**
2. เลือก repo `aidc-helpdesk`
3. **Settings → Root Directory** ตั้งเป็น `backend`
4. Railway จะเจอ `backend/Dockerfile` กับ `backend/railway.json` เอง

### ตัวแปรสภาพแวดล้อมที่ต้องตั้ง

```bash
NODE_ENV=production
TZ=Asia/Vientiane

DATABASE_URL=<connection string จาก Neon>
MIGRATE_URL=<connection string จาก Neon>

# สร้างใหม่เสมอ ห้ามใช้ค่าจากเอกสารหรือจากเครื่องพัฒนา
# สร้างด้วย: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
JWT_SECRET=<ค่าที่สร้างเอง ยาวอย่างน้อย 32 ไบต์>

ACCESS_TOKEN_TTL_MINUTES=30
REFRESH_TOKEN_TTL_DAYS=7
COOKIE_SECURE=true

# Railway มี proxy หนึ่งชั้นหน้าแอป
TRUST_PROXY_HOPS=1

# เปิดการล็อกบัญชีบน production
# ⚠️ ต้องมี POST /users/{id}/unlock ใช้ได้ก่อน มิฉะนั้นบัญชีที่ถูกล็อก
#    จะไม่มีใครปลดได้เลย ตอนนี้ยังไม่มี endpoint นั้น จึงยังตั้ง true ไม่ได้
LOCKOUT_ENABLED=false

# ไม่มี Redis ก็รันได้ แค่ไม่มีการประเมิน SLA อัตโนมัติ
JOBS_ENABLED=false
# ถ้ามี Upstash แล้ว: REDIS_URL=rediss://...  แล้วเปลี่ยน JOBS_ENABLED=true

# บัญชีผู้ดูแลชุดแรก — ใช้ครั้งเดียวตอน seed
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=<ตั้งรหัสที่แข็งแรง ห้ามใช้ค่าจากเครื่องพัฒนา>
```

### สร้างตารางและข้อมูลตั้งต้น

หลัง deploy ครั้งแรกสำเร็จ เปิด Railway shell แล้วสั่งตามลำดับ

```bash
npm run db:migrate:prod
npm run db:seed:prod
```

> ทั้งสองคำสั่งใช้ไฟล์ที่คอมไพล์แล้วใน `dist/` เพราะ `tsx` เป็น devDependency
> ที่ถูกตัดออกจาก image ไปแล้ว การเรียก `npm run db:migrate` ธรรมดาจะไม่ทำงาน

5. คัดลอก URL สาธารณะที่ Railway ให้มา เช่น `https://aidc-helpdesk-api.up.railway.app`

---

## ขั้นที่ 3 — หน้าเว็บ (Vercel)

1. https://vercel.com/pradit-s-projects/aidc-helpdesk
2. **Settings → Build and Deployment → Root Directory** ตั้งเป็น

```
frontend
```

   ⚠️ ขั้นนี้ข้ามไม่ได้ — repo นี้เป็น monorepo ที่ไม่มี `package.json` ที่ราก
   ถ้าไม่ตั้ง build จะล้มด้วย `No Next.js version detected`

3. **Settings → Environment Variables** ใส่ตัวเดียว

```bash
BACKEND_ORIGIN=https://aidc-helpdesk-api.up.railway.app
```

   **ห้ามตั้ง `NEXT_PUBLIC_API_BASE_URL`** — ถ้าตั้งเป็น URL เต็มของ Railway
   เบราว์เซอร์จะยิงข้ามโดเมนแล้วคุกกี้ `SameSite=Strict` จะไม่ถูกส่งไป
   ปล่อยให้เป็นค่าเริ่มต้น `/api/v1` แล้วให้ Next.js ส่งต่อให้

4. **Deployments → Redeploy**

---

## ขั้นที่ 4 — ตรวจว่าใช้งานได้จริง

```bash
# API ตอบไหม
curl https://aidc-helpdesk-api.up.railway.app/api/v1/livez

# ฐานข้อมูลต่อติดไหม — ต้องได้ database.status = "ok"
curl https://aidc-helpdesk-api.up.railway.app/api/v1/health

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
| Railway | เครดิต $5/เดือน | พอสำหรับ API ตัวเดียว |
| Neon | 0.5 GB · 190 ชม.คอมพิวต์ | พอช่วงทดลอง |
| Upstash | 10,000 คำสั่ง/วัน | พอสำหรับงาน SLA ทุก 5 นาที |

> ⚠️ Vercel Hobby **ห้ามใช้เชิงพาณิชย์** ตามข้อตกลงการใช้งาน
> ระบบภายในองค์กรอยู่ในพื้นที่คลุมเครือ ควรตรวจกับฝ่ายกฎหมายก่อนใช้จริงระยะยาว
