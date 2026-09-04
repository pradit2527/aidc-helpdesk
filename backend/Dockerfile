# syntax=docker/dockerfile:1
#
# AIDC Helpdesk API
#
# แยกเป็นสามชั้นเพื่อให้ image สุดท้ายไม่มีเครื่องมือ build ติดไปด้วย
# ชั้น deps และ build มี TypeScript, NestJS CLI และ devDependencies ครบ
# แต่ชั้นที่รันจริงมีแค่ dist กับ dependencies ที่ต้องใช้ตอนรัน
#
# ที่ต้องระวังเป็นพิเศษคือ argon2 — เป็น native module ที่คอมไพล์ตอน
# npm install ผลลัพธ์จึงผูกกับสถาปัตยกรรมและเวอร์ชัน Node ของเครื่องที่ build
# ถ้าคัดลอก node_modules ข้ามชั้นที่ base ไม่ตรงกัน จะพังตอนรันด้วยข้อความ
# "invalid ELF header" ซึ่งอ่านแล้วไม่รู้เลยว่าเกิดจากอะไร
# ทุกชั้นจึงใช้ node:22-alpine เหมือนกันหมด

FROM node:22-alpine AS deps
WORKDIR /app

# argon2 ต้องคอมไพล์จากซอร์ส alpine จึงต้องมีเครื่องมือ build ให้ครบก่อน
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci


FROM node:22-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ตัด devDependencies ออกหลัง build เสร็จ ไม่ใช่ก่อน
# เพราะ nest build ต้องใช้ TypeScript กับ NestJS CLI ซึ่งอยู่ใน devDependencies
RUN npm prune --omit=dev


FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
# ตรงกับ DB_TIMEZONE ใน src/db/client.ts — ถ้าไม่ตรง การตัดวันของ
# ตัวกันแจ้งเตือนซ้ำ (created_at::date) จะเลื่อนไปจากที่ SLA engine คิดไว้
ENV TZ=Asia/Vientiane

# tini เก็บกวาด zombie process และส่งต่อสัญญาณ SIGTERM ให้แอปจริง
# ถ้าไม่มี Node จะเป็น PID 1 ซึ่งไม่จัดการสัญญาณตามค่าเริ่มต้น
# ผลคือตอน deploy ใหม่ คอนเทนเนอร์จะถูกฆ่าทิ้งแทนที่จะปิดตัวเองอย่างเรียบร้อย
# แล้ว connection ที่ค้างกับงานที่กำลังทำอยู่จะหายไปกลางคัน
RUN apk add --no-cache tini

# ไม่รันด้วย root — ถ้ามีช่องโหว่ในแอป ผู้โจมตีจะได้สิทธิ์แค่ผู้ใช้ธรรมดา
USER node

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
# migration เป็นไฟล์ .sql ที่อ่านตอนรัน ไม่ได้ถูกคอมไพล์เข้า dist
COPY --from=build --chown=node:node /app/src/db/migrations ./src/db/migrations

EXPOSE 8000

# ใช้ /livez ไม่ใช่ /health โดยตั้งใจ
# /health ตรวจฐานข้อมูลกับ Redis ด้วย ซึ่งถ้าฐานข้อมูลล่มชั่วคราว
# healthcheck จะสั่งรีสตาร์ทคอนเทนเนอร์วนไปเรื่อย ทั้งที่การรีสตาร์ท
# แก้ปัญหาฐานข้อมูลไม่ได้ มีแต่จะทำให้เหตุขัดข้องยาวขึ้น
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8000)+'/api/v1/livez').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
