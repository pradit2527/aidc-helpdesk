# ---------- stage 1: deps ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---------- stage 2: builder ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next/font ดาวน์โหลด Noto Sans Thai ตอน build แล้ว self-host
# ทำให้ตอน runtime ไม่มีการเรียก Google CDN เลย ซึ่งจำเป็นเพราะ on-prem + CSP default-src 'self'
RUN npm run build

# ---------- stage 3: runtime ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Asia/Bangkok \
    PORT=3000

RUN apt-get update && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs

# output: 'standalone' รวม dependency ที่ใช้จริงมาให้แล้ว
# image สุดท้ายจึงไม่มี node_modules ทั้งก้อน (เล็กลงราว 300 MB)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
