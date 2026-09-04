# syntax=docker/dockerfile:1
#
# AIDC Helpdesk API
#
# ⚠️ ใช้ node:22-slim (Debian) ไม่ใช่ alpine โดยตั้งใจ
#
#    argon2 เป็น native module ที่มาพร้อม prebuild สำเร็จรูป แต่ตัวที่ให้มา
#    สำหรับ linux เป็นแบบ glibc เท่านั้น (linux-x64, linux-arm64)
#    ส่วน alpine ใช้ musl ซึ่งเป็น libc คนละตัว
#
#    ผลคือบน alpine ตัวโหลดโมดูลจะเจอ prebuild ที่สถาปัตยกรรมตรง แล้วเลือกใช้
#    แทนที่จะคอมไพล์ใหม่ จากนั้นล้มตอนรันด้วยข้อความประมาณ
#      Error relocating .../argon2.node: __strdup: symbol not found
#    ซึ่งเกิดตอน "รัน" ไม่ใช่ตอน "build" — build ผ่านหมดแล้วค่อยพังบนเซิร์ฟเวอร์
#
#    Debian ใช้ glibc prebuild จึงโหลดได้ตรง ๆ ไม่ต้องคอมไพล์
#    build เร็วกว่าและไม่มีความเสี่ยงเรื่อง libc ไม่ตรงกัน
#    image ใหญ่กว่า alpine ราว 30 MB ซึ่งแลกกันคุ้ม

FROM node:22-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci


FROM node:22-slim AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ตัด devDependencies ออกหลัง build เสร็จ ไม่ใช่ก่อน
# เพราะ nest build ต้องใช้ TypeScript กับ NestJS CLI ซึ่งอยู่ใน devDependencies
RUN npm prune --omit=dev


FROM node:22-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
# ตรงกับ DB_TIMEZONE ใน src/db/client.ts — ถ้าไม่ตรง การตัดวันของ
# ตัวกันแจ้งเตือนซ้ำ (created_at::date) จะเลื่อนไปจากที่ SLA engine คิดไว้
ENV TZ=Asia/Vientiane

# tini เก็บกวาด zombie process และส่งต่อ SIGTERM ให้แอปจริง
# ถ้าไม่มี Node จะเป็น PID 1 ซึ่งไม่จัดการสัญญาณตามค่าเริ่มต้น
# ผลคือตอน deploy ใหม่ คอนเทนเนอร์ถูกฆ่าทิ้งแทนที่จะปิดตัวเองอย่างเรียบร้อย
# แล้ว connection ที่ค้างกับงานที่กำลังทำอยู่จะหายไปกลางคัน
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

# ไม่รันด้วย root — ถ้ามีช่องโหว่ในแอป ผู้โจมตีจะได้สิทธิ์แค่ผู้ใช้ธรรมดา
# ผู้ใช้ node มีมาให้แล้วใน image ทางการของ Node
USER node

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
# migration เป็นไฟล์ .sql ที่อ่านตอนรัน ไม่ได้ถูกคอมไพล์เข้า dist
# และ migrate.ts อ้างพาธ './src/db/migrations' เทียบกับ working directory
COPY --from=build --chown=node:node /app/src/db/migrations ./src/db/migrations

EXPOSE 8000

# ใช้ /livez ไม่ใช่ /health โดยตั้งใจ
# /health ตรวจฐานข้อมูลกับ Redis ด้วย ถ้าฐานข้อมูลล่มชั่วคราว healthcheck
# จะสั่งรีสตาร์ทคอนเทนเนอร์วนไปเรื่อย ทั้งที่การรีสตาร์ทแก้ปัญหาฐานข้อมูลไม่ได้
# มีแต่จะทำให้เหตุขัดข้องยาวขึ้น
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8000)+'/api/v1/livez').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
