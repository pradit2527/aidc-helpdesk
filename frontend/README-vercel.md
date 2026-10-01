# ค่าของหน้าเว็บบน Vercel

ค่าสองตัวที่เคยต้องกรอกในแดชบอร์ดทุกครั้ง ย้ายมาอยู่ใน [`vercel.json`](./vercel.json) แล้ว
เพราะทั้งคู่เป็น **ที่อยู่สาธารณะ ไม่ใช่ความลับ** การเก็บไว้ใน repo จึงดีกว่าในสองทาง:
ใครก็ตามที่ deploy ได้ค่าชุดเดียวกันเสมอ และเวลาที่อยู่ของ backend เปลี่ยน
จะเห็นในประวัติ git ว่าเปลี่ยนเมื่อไรเพราะอะไร

| ตัวแปร | ค่า | ใครอ่าน |
|---|---|---|
| `BACKEND_ORIGIN` | `https://aidc-helpdesk.onrender.com` | `next.config.ts` → ส่งต่อ `/api/v1/*` ไป backend |
| `NEXT_PUBLIC_WS_ORIGIN` | `https://aidc-helpdesk.onrender.com` | `lib/ws.ts` → socket.io ต่อตรงไป backend |

## ที่ยังต้องตั้งในแดชบอร์ด

```bash
# แชทถาม-ตอบ Chatwoot — ไม่ตั้งสองตัวนี้ = ไม่มีปุ่มแชทบนหน้าเว็บ
NEXT_PUBLIC_CHATWOOT_BASE_URL=https://helpdesk.aidclaos.com
NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN=<website token ของ inbox แบบ Website>
```

`NEXT_PUBLIC_*` ถูกฝังตอน build — แก้แล้วต้อง **Redeploy** ทุกครั้ง ไม่ใช่แค่รีสตาร์ท

## ⚠️ ห้ามตั้ง `NEXT_PUBLIC_API_BASE_URL`

ปล่อยให้เป็นค่าเริ่มต้น `/api/v1` เสมอ ถ้าตั้งเป็น URL เต็มของ backend
เบราว์เซอร์จะยิงข้ามโดเมนเอง แล้วคุกกี้ `SameSite=Strict` จะไม่ถูกแนบไป
ผลคือล็อกอินผ่านแต่ทุกคำขอหลังจากนั้นได้ 401 โดยไม่มีอะไรบอกสาเหตุ

## ⚠️ Root Directory ต้องเป็น `frontend`

repo นี้เป็น monorepo ที่ไม่มี `package.json` ที่ราก ถ้าไม่ตั้ง
build จะล้มด้วย `No Next.js version detected` — และไฟล์ `vercel.json` นี้
จะไม่ถูกอ่านด้วย เพราะ Vercel มองหามันในโฟลเดอร์ที่เป็น Root Directory
