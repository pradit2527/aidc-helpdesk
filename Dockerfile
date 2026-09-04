# syntax=docker/dockerfile:1
#
# AIDC Helpdesk API
#
# ⚠️ ไฟล์นี้อยู่ที่ "ราก" ของ repo โดยตั้งใจ ไม่ใช่ใน backend/
#
#    Render กับ Railway มองหา ./Dockerfile ที่รากเป็นค่าเริ่มต้น และค่านั้น
#    อยู่ในหน้า Settings ของ service ซึ่ง render.yaml ไม่ได้ทับให้เมื่อ service
#    ถูกสร้างแบบธรรมดา (ไม่ใช่ Blueprint) ผลคือ build ล้มด้วย
#      failed to read dockerfile: open Dockerfile: no such file or directory
#    ทั้งที่ backend/Dockerfile มีอยู่จริง
#
#    วางไว้ที่รากแล้วทุกแพลตฟอร์มเจอเองโดยไม่ต้องตั้งค่าอะไรเพิ่ม
#    แลกกับการต้องเขียน backend/ นำหน้าทุกพาธ ซึ่งชัดเจนกว่าการไล่แก้
#    ช่องตั้งค่าในหน้าเว็บของแต่ละเจ้าให้ตรงกัน
#
# ⚠️ ใช้ node:22-slim (Debian) ไม่ใช่ alpine
#
#    argon2 เป็น native module ที่มี prebuild สำหรับ linux แบบ glibc เท่านั้น
#    ส่วน alpine ใช้ musl ซึ่งเป็น libc คนละตัว บน alpine ตัวโหลดโมดูล
#    จะเลือก prebuild ที่สถาปัตยกรรมตรงมาใช้ แล้วล้มตอนโหลดด้วย
#      Error relocating .../argon2.node: __strdup: symbol not found
#    ซึ่งเกิดตอน "รัน" ไม่ใช่ตอน "build" — deploy ขึ้นไปแล้วค่อยพัง

FROM node:22-slim AS deps
WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci


FROM node:22-slim AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY backend/ ./
RUN npm run build

# ตัด devDependencies ออกหลัง build เสร็จ ไม่ใช่ก่อน
# เพราะ nest build ต้องใช้ TypeScript กับ NestJS CLI ซึ่งอยู่ใน devDependencies
RUN npm prune --omit=dev


FROM node:22-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
# ต้องตรงกับ DB_TIMEZONE ใน backend/src/db/client.ts — ถ้าไม่ตรง การตัดวันของ
# ตัวกันแจ้งเตือนซ้ำ (created_at::date) จะเลื่อนไปจากที่ SLA engine คิดไว้
ENV TZ=Asia/Vientiane

# tini เก็บกวาด zombie process และส่งต่อ SIGTERM ให้แอปจริง
# ถ้าไม่มี Node จะเป็น PID 1 ซึ่งไม่จัดการสัญญาณตามค่าเริ่มต้น
# ผลคือตอน deploy ใหม่ คอนเทนเนอร์ถูกฆ่าทิ้งแทนที่จะปิดตัวเองอย่างเรียบร้อย
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

# ไม่รันด้วย root — ถ้ามีช่องโหว่ในแอป ผู้โจมตีจะได้สิทธิ์แค่ผู้ใช้ธรรมดา
USER node

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
# migration เป็นไฟล์ .sql ที่อ่านตอนรัน ไม่ได้ถูกคอมไพล์เข้า dist
# migrate.ts อ้างพาธ './src/db/migrations' เทียบกับ working directory
COPY --from=build --chown=node:node /app/src/db/migrations ./src/db/migrations

EXPOSE 8000

# ใช้ /livez ไม่ใช่ /health โดยตั้งใจ
# /health ตรวจฐานข้อมูลกับ Redis ด้วย ถ้าฐานข้อมูลล่มชั่วคราว healthcheck
# จะสั่งรีสตาร์ทคอนเทนเนอร์วนไปเรื่อย ทั้งที่การรีสตาร์ทแก้ปัญหาฐานข้อมูลไม่ได้
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8000)+'/api/v1/livez').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
