# Deployment — AIDC Helpdesk

| หัวข้อ | รายละเอียด |
|---|---|
| รหัสเอกสาร | BE-004 |
| เวอร์ชัน | 1.0 |
| ผู้จัดทำ | Senior Backend |
| ปลายทาง | เซิร์ฟเวอร์ภายในองค์กร (on-prem) — Linux เป็นหลัก, รองรับ Windows Server ด้วย WSL2 |
| ทรัพยากรขั้นต่ำ | 4 vCPU / 8 GB RAM / 200 GB SSD (ตาม ADR-001 6.1) |
| เอกสารอ้างอิง | `00-tech-stack-decision.md` (6), `01-srs.md` (NFR-12, 20–23), `10-backend-architecture.md`, `12-backend-implementation-plan.md` |

---

## 1. `docker-compose.yml`

> วางไว้ที่ `/opt/aidc-helpdesk/docker-compose.yml` — ทุก service กำหนด healthcheck, `restart: unless-stopped`, จำกัด log และผูก volume ที่ต้องสำรอง

```yaml
name: aidc-helpdesk

x-logging: &default-logging
  driver: json-file
  options:
    max-size: "20m"
    max-file: "5"

x-api-env: &api-env
  ENV: ${ENV:-production}
  TZ: Asia/Bangkok
  DATABASE_URL: postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
  REDIS_URL: redis://redis:6379/0
  SECRET_KEY: ${SECRET_KEY}
  ATTACHMENT_DIR: /data/attachments
  EXPORT_DIR: /data/exports
  SMTP_HOST: ${SMTP_HOST}
  SMTP_PORT: ${SMTP_PORT:-25}
  SMTP_USER: ${SMTP_USER:-}
  SMTP_PASSWORD: ${SMTP_PASSWORD:-}
  SMTP_FROM: ${SMTP_FROM}
  NOTIFY_CHANNELS: ${NOTIFY_CHANNELS:-in_app,email}
  TEAMS_WEBHOOK_URL: ${TEAMS_WEBHOOK_URL:-}
  LINE_CHANNEL_ACCESS_TOKEN: ${LINE_CHANNEL_ACCESS_TOKEN:-}
  LINE_CHANNEL_SECRET: ${LINE_CHANNEL_SECRET:-}
  PUBLIC_BASE_URL: ${PUBLIC_BASE_URL}
  LOG_LEVEL: ${LOG_LEVEL:-INFO}

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      TZ: Asia/Bangkok
      PGTZ: UTC
    command:
      - postgres
      - -c
      - max_connections=100
      - -c
      - shared_buffers=1GB
      - -c
      - effective_cache_size=3GB
      - -c
      - work_mem=16MB
      - -c
      - maintenance_work_mem=256MB
      - -c
      - log_min_duration_statement=1000
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./backup:/backup
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    logging: *default-logging
    networks: [backend]

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes", "--maxmemory", "512mb", "--maxmemory-policy", "noeviction"]
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    logging: *default-logging
    networks: [backend]

  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    image: aidc-helpdesk-api:${IMAGE_TAG:-latest}
    restart: unless-stopped
    environment: *api-env
    command:
      - gunicorn
      - app.main:app
      - --worker-class=uvicorn.workers.UvicornWorker
      - --workers=4
      - --bind=0.0.0.0:8000
      - --timeout=90
      - --graceful-timeout=30
      - --access-logfile=-
      - --error-logfile=-
    volumes:
      - attachments:/data/attachments
      - exports:/data/exports
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=5).status==200 else 1)"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging: *default-logging
    networks: [backend]

  worker:
    image: aidc-helpdesk-api:${IMAGE_TAG:-latest}
    restart: unless-stopped
    environment: *api-env
    command:
      - celery
      - -A
      - app.workers.celery_app.celery_app
      - worker
      - --loglevel=info
      - --concurrency=2
      - --max-tasks-per-child=200
    volumes:
      - attachments:/data/attachments
      - exports:/data/exports
    depends_on:
      api:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "celery -A app.workers.celery_app.celery_app inspect ping -d celery@$$HOSTNAME || exit 1"]
      interval: 60s
      timeout: 15s
      retries: 3
      start_period: 40s
    logging: *default-logging
    networks: [backend]

  beat:
    image: aidc-helpdesk-api:${IMAGE_TAG:-latest}
    restart: unless-stopped
    environment: *api-env
    command:
      - celery
      - -A
      - app.workers.celery_app.celery_app
      - beat
      - --loglevel=info
      - --schedule=/tmp/celerybeat-schedule
    depends_on:
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "test -f /tmp/celerybeat-schedule || exit 1"]
      interval: 60s
      timeout: 10s
      retries: 3
      start_period: 30s
    logging: *default-logging
    networks: [backend]

  nginx:
    image: nginx:1.27-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./certs:/etc/nginx/certs:ro
      - ./frontend-dist:/usr/share/nginx/html:ro
      - attachments:/data/attachments:ro
      - exports:/data/exports:ro
    depends_on:
      api:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://127.0.0.1/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3
    logging: *default-logging
    networks: [backend]

volumes:
  pgdata:
  redisdata:
  attachments:
  exports:

networks:
  backend:
    driver: bridge
```

### 1.1 หมายเหตุสำคัญของไฟล์นี้

| ประเด็น | เหตุผล |
|---|---|
| `worker` และ `beat` ใช้ `image:` เดียวกับ `api` ไม่ build ซ้ำ | build ครั้งเดียว ได้โค้ดชุดเดียวกันแน่นอน (ต้อง `docker compose build api` ก่อน `up`) |
| `PGTZ: UTC` แต่ `TZ: Asia/Bangkok` | ฐานข้อมูลเก็บ UTC ตาม NFR-34 ส่วน log ของ container อ่านเป็นเวลาไทย |
| `redis` ใช้ `maxmemory-policy noeviction` | Redis เป็น broker ของ Celery — ถ้าใช้ `allkeys-lru` งานในคิวอาจถูกลบทิ้งเงียบ ๆ |
| `--max-tasks-per-child=200` | กัน memory leak สะสมในงานที่สร้าง PDF/Excel |
| nginx mount `attachments` และ `exports` แบบ `:ro` | ใช้กับ `X-Accel-Redirect` เพื่อให้ nginx เสิร์ฟไฟล์แทน Python |
| ไม่เปิดพอร์ต postgres/redis ออกนอก | เข้าถึงได้เฉพาะใน network `backend` เท่านั้น |
| `./backup` mount เข้า postgres | ให้ `pg_dump` เขียนไฟล์ออกมาที่โฮสต์ได้โดยไม่ต้อง copy |

---

## 2. Dockerfile (multi-stage)

`backend/Dockerfile`

```dockerfile
# ---------- stage 1: builder ----------
FROM python:3.12-slim-bookworm AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY requirements.txt .
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install -r requirements.txt

# ---------- stage 2: runtime ----------
FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    TZ=Asia/Bangkok

# ไลบรารีระบบสำหรับ WeasyPrint + การขึ้นรูป/ตัดคำภาษาไทย
#   libthai0 + libdatrie1 = ตัดคำไทย (ขาดแล้วบรรทัดจะตัดกลางคำ)
#   pango/harfbuzz        = วางสระ-วรรณยุกต์ให้ถูกตำแหน่ง
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
        libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b \
        libthai0 libdatrie1 \
        libcairo2 libgdk-pixbuf-2.0-0 shared-mime-info \
        libmagic1 fontconfig tzdata curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv

# ฟอนต์ไทย (Sarabun = SIL OFL 1.1, Noto Sans Thai = SIL OFL 1.1)
COPY assets/fonts/Sarabun-Regular.ttf assets/fonts/Sarabun-Bold.ttf \
     assets/fonts/NotoSansThai-Regular.ttf \
     /usr/share/fonts/truetype/thai/
RUN fc-cache -fv && fc-list | grep -i sarabun

# ผู้ใช้ที่ไม่ใช่ root
RUN groupadd -g 1000 app && useradd -u 1000 -g app -m -s /usr/sbin/nologin app \
    && mkdir -p /data/attachments /data/exports \
    && chown -R app:app /data

WORKDIR /app
COPY --chown=app:app . .

USER app
EXPOSE 8000

CMD ["gunicorn", "app.main:app", \
     "--worker-class=uvicorn.workers.UvicornWorker", \
     "--workers=4", "--bind=0.0.0.0:8000", "--timeout=90"]
```

| จุดออกแบบ | เหตุผล |
|---|---|
| แยก builder/runtime | ไม่มี `build-essential` ใน image สุดท้าย — เล็กลง ~350 MB และลดพื้นที่โจมตี |
| `USER app` (uid 1000) | ไม่รันเป็น root; ไฟล์แนบบน volume มี owner ตรงกับที่ backup script คาด |
| `fc-list \| grep -i sarabun` ใน RUN | ถ้าฟอนต์ไม่ติด build จะ **ล้มทันที** ดีกว่าไปเจอเป็น PDF กล่องตอน UAT |
| `libmagic1` | ใช้ตรวจ MIME จริงของไฟล์แนบ (NFR-15) |

---

## 3. `.env.example`

```bash
# ============================================================
# AIDC Helpdesk — ตัวอย่างไฟล์ตั้งค่า
# คัดลอกเป็น .env แล้วแก้ค่า — ห้าม commit ไฟล์ .env เข้า git
# สร้าง SECRET_KEY ด้วย: openssl rand -hex 32
# ============================================================

# ---------- ทั่วไป ----------
ENV=production
IMAGE_TAG=latest
LOG_LEVEL=INFO
PUBLIC_BASE_URL=https://helpdesk.aidc.local
TZ=Asia/Bangkok

# ---------- ฐานข้อมูล ----------
POSTGRES_USER=aidc_helpdesk
POSTGRES_PASSWORD=            # ต้องกรอก - อย่างน้อย 24 ตัวอักษรสุ่ม
POSTGRES_DB=aidc_helpdesk
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=5

# ---------- ความปลอดภัย ----------
SECRET_KEY=                   # ต้องกรอก - openssl rand -hex 32 (>= 32 ตัวอักษร)
ACCESS_TOKEN_MINUTES=30
REFRESH_TOKEN_DAYS=7
LOGIN_MAX_FAILED=5
LOGIN_LOCK_MINUTES=15
RATE_LIMIT_LOGIN_PER_MIN=10
RATE_LIMIT_API_PER_MIN=120
CORS_ORIGINS=https://helpdesk.aidc.local

# ---------- ไฟล์แนบ / export ----------
ATTACHMENT_DIR=/data/attachments
EXPORT_DIR=/data/exports
MAX_UPLOAD_MB=20
MAX_FILES_PER_REQUEST=5

# ---------- อีเมล (SMTP ภายในองค์กร) ----------
SMTP_HOST=smtp.aidc.local
SMTP_PORT=25
SMTP_USER=                    # ว่างได้ถ้า relay ภายในไม่ต้อง auth
SMTP_PASSWORD=
SMTP_FROM=helpdesk@aidc.co.th

# ---------- ช่องทางแจ้งเตือน ----------
# ค่าที่รองรับ: in_app,email,teams,line,webpush
NOTIFY_CHANNELS=in_app,email
TEAMS_WEBHOOK_URL=            # Power Automate "Workflows" webhook (ไม่ใช่ O365 connector เดิม)
LINE_CHANNEL_ACCESS_TOKEN=    # ใช้เมื่อเปิด LINE Messaging API (LINE Notify ปิดบริการแล้ว)
LINE_CHANNEL_SECRET=

# ---------- ข้อมูลตั้งต้น ----------
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=          # รหัสชั่วคราว - ระบบบังคับเปลี่ยนตอนล็อกอินครั้งแรก
SEED_ADMIN_EMAIL=it.admin@aidc.co.th

# ---------- Backup ----------
BACKUP_DIR=/opt/aidc-helpdesk/backup
BACKUP_RETENTION_DAYS=30
BACKUP_MONTHLY_RETENTION=12
BACKUP_OFFSITE_TARGET=        # เช่น nas.aidc.local:/volume1/backup/helpdesk (บังคับก่อน go-live)
```

> **การตรวจสอบก่อน start:** สคริปต์ `scripts/preflight.sh` ตรวจว่า `SECRET_KEY`, `POSTGRES_PASSWORD`, `SEED_ADMIN_PASSWORD`, `BACKUP_OFFSITE_TARGET` ไม่ว่าง และ `SECRET_KEY` ยาว ≥ 32 — ถ้าไม่ผ่านให้หยุด ไม่ให้ deploy

---

## 4. Nginx

`nginx/conf.d/helpdesk.conf`

```nginx
# --- โซนสำหรับจำกัดอัตราคำขอ (ด่านแรกก่อนถึง FastAPI) ---
limit_req_zone $binary_remote_addr zone=login_zone:10m rate=10r/m;
limit_req_zone $binary_remote_addr zone=api_zone:10m   rate=240r/m;

upstream api_backend {
    server api:8000;
    keepalive 32;
}

server {
    listen 80;
    server_name helpdesk.aidc.local;
    location /healthz { return 200 "ok\n"; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    http2 on;
    server_name helpdesk.aidc.local;

    ssl_certificate     /etc/nginx/certs/helpdesk.crt;
    ssl_certificate_key /etc/nginx/certs/helpdesk.key;
    ssl_protocols       TLSv1.2 TLSv1.3;          # NFR-12
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1h;

    # --- ขนาดอัปโหลด: ไฟล์ 20 MB x 5 ไฟล์ + overhead ของ multipart ---
    client_max_body_size 110m;
    client_body_timeout  120s;
    client_body_buffer_size 1m;

    # --- security header ---
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000" always;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript
               application/xml image/svg+xml;
    gzip_min_length 1024;

    # --- SPA (React build) ---
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }
    location /assets/ {
        root /usr/share/nginx/html;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # --- ล็อกอิน: จำกัดอัตราเข้มกว่าปกติ (NFR-17) ---
    location = /api/v1/auth/login {
        limit_req zone=login_zone burst=5 nodelay;
        limit_req_status 429;
        proxy_pass http://api_backend;
        include /etc/nginx/conf.d/proxy_common.inc;
    }

    # --- API ทั่วไป ---
    location /api/ {
        limit_req zone=api_zone burst=60 nodelay;
        limit_req_status 429;
        proxy_pass http://api_backend;
        include /etc/nginx/conf.d/proxy_common.inc;
        proxy_read_timeout    90s;      # ต้องยาวกว่า gunicorn timeout เล็กน้อย
        proxy_send_timeout    90s;
        proxy_connect_timeout 10s;
        proxy_request_buffering off;    # อัปโหลดไฟล์ใหญ่ไม่ต้องพักที่ nginx ทั้งก้อน
    }

    # --- export ที่อาจใช้เวลานาน (sync <= 5,000 แถว) ---
    location /api/v1/tickets/export {
        proxy_pass http://api_backend;
        include /etc/nginx/conf.d/proxy_common.inc;
        proxy_read_timeout 300s;
        proxy_buffering off;
    }

    # --- ไฟล์แนบ: เข้าถึงได้เฉพาะผ่าน X-Accel-Redirect จาก FastAPI เท่านั้น ---
    location /protected/attachments/ {
        internal;
        alias /data/attachments/;
        add_header Content-Disposition "attachment" always;
        add_header X-Content-Type-Options "nosniff" always;
    }
    location /protected/exports/ {
        internal;
        alias /data/exports/;
        add_header Content-Disposition "attachment" always;
    }

    location /healthz { return 200 "ok\n"; }
}
```

`nginx/conf.d/proxy_common.inc`

```nginx
proxy_http_version 1.1;
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Request-Id      $request_id;
proxy_set_header Connection        "";
```

| ค่าที่ต้องสอดคล้องกัน | ค่า |
|---|---|
| `client_max_body_size` (nginx) | 110m — รองรับ 5 ไฟล์ × 20 MB + multipart overhead |
| `MAX_UPLOAD_MB` (app) | 20 — ด่านจริงที่ตัดสินใจต่อไฟล์ |
| `proxy_read_timeout` | 90s > `gunicorn --timeout=90` เล็กน้อย เพื่อให้ error มาจากแอปไม่ใช่ nginx |
| `X-Request-Id` | nginx สร้างให้ถ้า client ไม่ส่งมา → ตรงกับ log ของแอป |

---

## 5. ขั้นตอนติดตั้งบนเซิร์ฟเวอร์ภายในองค์กร

### 5.1 Linux (แนะนำ — Ubuntu Server 22.04/24.04 LTS)

| ขั้น | คำสั่ง / สิ่งที่ทำ | ตรวจสอบว่าสำเร็จ |
|---|---|---|
| 1 | ติดตั้ง Docker Engine + Compose plugin ตามคู่มือทางการ (ไม่ใช้ `docker.io` จาก apt เก่า) | `docker --version` ≥ 27, `docker compose version` = v2 |
| 2 | ตั้งเวลาเครื่อง: `timedatectl set-timezone Asia/Bangkok` และเปิด NTP | `timedatectl` แสดง `NTP service: active` |
| 3 | สร้างโฟลเดอร์ `/opt/aidc-helpdesk` และวางไฟล์ `docker-compose.yml`, `nginx/`, `certs/`, `backend/`, `frontend-dist/` | `ls /opt/aidc-helpdesk` ครบ |
| 4 | `cp .env.example .env` แล้วกรอกค่าทั้งหมด; `chmod 600 .env` | `bash scripts/preflight.sh` ผ่าน |
| 5 | วางใบรับรอง TLS ที่ `certs/helpdesk.crt` + `.key` (ใบรับรองภายในองค์กรใช้ได้ตาม NFR-12) | `openssl x509 -in certs/helpdesk.crt -noout -dates` |
| 6 | `docker compose build api` | ไม่มี error, ขั้นตอน `fc-list \| grep sarabun` ผ่าน |
| 7 | `docker compose up -d postgres redis` แล้วรอ healthy | `docker compose ps` แสดง `healthy` ทั้งสอง |
| 8 | รัน migration: `docker compose run --rm api alembic upgrade head` | `alembic current` = revision ล่าสุด |
| 9 | รัน seed: `docker compose run --rm api python -m app.db.seed --core` | มี 7 บริษัท, 43 permission, 5 role, super_admin 1 บัญชี |
| 10 | `docker compose up -d` (ทุก service) | `docker compose ps` healthy ครบ 6 |
| 11 | ตรวจสุขภาพ: `curl -k https://helpdesk.aidc.local/api/v1/health` | `{"status":"ok","db":"ok","redis":"ok"}` |
| 12 | ล็อกอินด้วย super_admin → ระบบบังคับเปลี่ยนรหัส → เปลี่ยนทันที | เข้าหน้า dashboard ได้ |
| 13 | ตั้ง cron backup (หัวข้อ 6) และทดสอบ restore 1 รอบ | มีไฟล์ dump และ restore ขึ้นได้จริง |
| 14 | เปิดพอร์ต 443 บนไฟร์วอลล์เฉพาะวง LAN/VPN; ปิด 80 หลังยืนยัน redirect | `ufw status` / nmap จากเครื่องอื่น |

### 5.2 Windows Server (Docker Desktop + WSL2)

> ใช้ได้จริงแต่ **ไม่ใช่ทางที่แนะนำสำหรับ production** — ถ้าองค์กรมีทางเลือกเป็น Linux VM ให้เลือก Linux

| ขั้น | สิ่งที่ทำ | ข้อควรระวัง |
|---|---|---|
| 1 | ตรวจว่าเป็น Windows Server 2022 ขึ้นไป และเปิดฟีเจอร์ `Virtual Machine Platform` + `WSL` | Windows Server 2019 ไม่รองรับ WSL2 อย่างเป็นทางการ |
| 2 | ติดตั้ง WSL2 + Ubuntu: `wsl --install -d Ubuntu-22.04` แล้ว `wsl --set-default-version 2` | ต้องรีสตาร์ตเครื่อง; ถ้าเป็น VM ต้องเปิด **nested virtualization** ที่ hypervisor |
| 3 | ติดตั้ง Docker Desktop และเปิด "Use WSL 2 based engine" | Docker Desktop มี **เงื่อนไขสัญญาอนุญาตเชิงพาณิชย์** สำหรับองค์กรขนาดใหญ่ — ต้องตรวจสอบกับฝ่ายจัดซื้อ **[ต้องยืนยันกับ PM]** |
| 4 | ตั้ง Docker Desktop ให้ **Start on login** และตั้งเครื่องให้ auto-login หรือใช้ Task Scheduler สั่ง `wsl -d Ubuntu ... docker compose up -d` ตอนบูต | **ข้อควรระวังใหญ่ที่สุด:** Docker Desktop ผูกกับ session ของผู้ใช้ ถ้าไม่มีใครล็อกอิน ระบบอาจไม่ขึ้นเองหลังไฟดับ |
| 5 | วางโค้ดทั้งหมด **ในระบบไฟล์ของ WSL** (`\\wsl$\Ubuntu\opt\aidc-helpdesk`) ไม่ใช่ `C:\` | ถ้าวางบน `C:\` แล้ว mount ข้ามระบบไฟล์ จะช้ามาก (I/O ตกหลายเท่า) และสิทธิ์ไฟล์เพี้ยน |
| 6 | ตั้ง `.wslconfig` ที่ `C:\Users\<user>\.wslconfig` จำกัด memory/CPU | ค่าเริ่มต้น WSL2 กินแรมได้เกือบทั้งเครื่องและไม่คืน |
| 7 | ตั้งเวลาเครื่องเป็น Asia/Bangkok ทั้งฝั่ง Windows และใน WSL | นาฬิกา WSL2 เคยมีปัญหาเพี้ยนหลังเครื่องตื่นจาก sleep — ปิด sleep และตรวจ `date` ใน WSL หลังรีบูต |
| 8 | ยกเว้นโฟลเดอร์ Docker/WSL จากการสแกนของ Windows Defender | ไม่ยกเว้น = ประสิทธิภาพตกและอาจล็อกไฟล์ฐานข้อมูล |
| 9 | เปิดพอร์ต 443 ที่ Windows Firewall | Docker Desktop ทำ port forward ให้เอง แต่ firewall ยังบล็อกได้ |
| 10 | ขั้นตอน 4–14 ของหัวข้อ 5.1 ทำเหมือนกันทุกประการ (รันคำสั่งใน WSL) | — |

**ข้อควรระวังเพิ่มเติมสำหรับ Windows**

| ประเด็น | ผลกระทบ | ทางแก้ |
|---|---|---|
| ไฟดับ / รีบูตอัตโนมัติจาก Windows Update | ระบบไม่ขึ้นเอง ถ้าไม่มีใครล็อกอิน | ตั้ง Task Scheduler แบบ "Run whether user is logged on or not" + ตั้ง Windows Update ให้ restart เฉพาะหน้าต่างบำรุงรักษา |
| Backup ของไฟล์บน WSL | เครื่องมือ backup ของ Windows มองไม่เห็นไฟล์ใน WSL2 ตรง ๆ | ให้ script `pg_dump` เขียนออกมาที่ path ที่ Windows เห็น (`/mnt/c/backup/...`) แล้วให้ตัว backup องค์กรเก็บต่อ |
| ประสิทธิภาพ I/O | ต่ำกว่า Linux ประมาณ 20–40% | ยอมรับได้ที่โหลดระดับนี้ แต่ควรตั้ง `shared_buffers` ให้พอดี อย่าให้ swap |
| การกู้ระบบตอนกลางคืน | ต้องมีคน remote เข้า Windows ได้ | ระบุผู้ดูแลชัดเจน (PM-10) |

### 5.3 การอัปเดตเวอร์ชัน (deploy รอบถัดไป)

```bash
cd /opt/aidc-helpdesk
# 1) สำรองก่อนเสมอ
./scripts/backup_db.sh pre-deploy
# 2) ดึงโค้ดใหม่ + build
git -C ./src pull && docker compose build api
# 3) migration ก่อนสลับ image (ADR-001 6.2)
docker compose run --rm api alembic upgrade head
# 4) สลับ service ทีละตัว
docker compose up -d api worker beat nginx
# 5) ตรวจสุขภาพ
curl -fsSk https://helpdesk.aidc.local/api/v1/health | jq .
docker compose ps
```

**Rollback**

```bash
IMAGE_TAG=<tag เดิม> docker compose up -d api worker beat
docker compose run --rm api alembic downgrade -1     # เฉพาะเมื่อ migration รอบนี้มีปัญหา
```

---

## 6. Backup และ Restore

### 6.1 นโยบาย (ตาม ADR-001 6.3 และ NFR-22/23)

| รายการ | วิธี | ความถี่ | เก็บย้อนหลัง | ปลายทาง |
|---|---|---|---|---|
| ฐานข้อมูล (รายวัน) | `pg_dump -Fc` + gzip | ทุกวัน 01:00 | 30 วัน | เครื่อง + NAS |
| ฐานข้อมูล (รายเดือน) | เก็บ dump ของวันที่ 1 แยกโฟลเดอร์ | รายเดือน | 12 เดือน | NAS + offsite |
| ไฟล์แนบ | `rsync -a --delete` จาก volume | ทุกวัน 02:00 | 30 วัน | NAS |
| `.env` + certs | คัดลอกแบบเข้ารหัส (`age`/`gpg`) | เมื่อเปลี่ยน | ตลอด | ที่เก็บ secret ขององค์กร |
| ทดสอบกู้คืน | restore ลง DB ชั่วคราวแล้วนับแถว | ทุกไตรมาส | บันทึกผลเป็นเอกสาร | — |
| RPO / RTO | ≤ 24 ชม. / ≤ 4 ชม. | — | — | — |

> **[บังคับก่อน go-live]** ถ้ายังไม่มีปลายทางนอกเครื่อง (NAS/external) ให้ถือเป็น blocker ตาม TR-02 / PM-02

### 6.2 สคริปต์สำรองข้อมูล

`scripts/backup_db.sh`

```bash
#!/usr/bin/env bash
# สำรองฐานข้อมูล AIDC Helpdesk — เรียกจาก cron ทุกวัน 01:00
set -euo pipefail

cd /opt/aidc-helpdesk
set -a; source .env; set +a

LABEL="${1:-daily}"
STAMP="$(date +%Y%m%d_%H%M%S)"
DAY_OF_MONTH="$(date +%d)"
OUT_DIR="${BACKUP_DIR}/daily"
[ "$DAY_OF_MONTH" = "01" ] && OUT_DIR="${BACKUP_DIR}/monthly"
mkdir -p "$OUT_DIR"

FILE="${OUT_DIR}/helpdesk_${LABEL}_${STAMP}.dump"

# -Fc = custom format บีบอัดในตัว, restore เลือกตารางได้
docker compose exec -T postgres \
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner \
    > "$FILE"

# ตรวจว่าไฟล์ใช้ได้จริง ไม่ใช่ไฟล์ว่าง/พัง
docker compose exec -T postgres pg_restore --list < "$FILE" > /dev/null \
    || { echo "FATAL: dump เสียหาย $FILE" >&2; exit 1; }

SIZE=$(stat -c%s "$FILE")
[ "$SIZE" -gt 100000 ] || { echo "FATAL: dump เล็กผิดปกติ ($SIZE bytes)" >&2; exit 1; }

# สำเนาไปปลายทางนอกเครื่อง
if [ -n "${BACKUP_OFFSITE_TARGET:-}" ]; then
    rsync -a --timeout=600 "$FILE" "${BACKUP_OFFSITE_TARGET}/db/" \
        || echo "WARN: ส่งไป offsite ไม่สำเร็จ" >&2
fi

# ลบของเก่า
find "${BACKUP_DIR}/daily"   -name '*.dump' -mtime "+${BACKUP_RETENTION_DAYS}" -delete
find "${BACKUP_DIR}/monthly" -name '*.dump' -mtime "+$((BACKUP_MONTHLY_RETENTION*31))" -delete

echo "OK backup=$FILE size=$SIZE"
```

`scripts/backup_files.sh`

```bash
#!/usr/bin/env bash
# สำรองไฟล์แนบ — cron ทุกวัน 02:00
set -euo pipefail
cd /opt/aidc-helpdesk
set -a; source .env; set +a

VOL_PATH="$(docker volume inspect aidc-helpdesk_attachments -f '{{ .Mountpoint }}')"
rsync -a --delete --timeout=1800 \
      "${VOL_PATH}/" "${BACKUP_OFFSITE_TARGET}/attachments/"
echo "OK attachments synced"
```

**crontab ของเครื่องเซิร์ฟเวอร์**

```cron
0 1 * * *  /opt/aidc-helpdesk/scripts/backup_db.sh daily    >> /var/log/aidc-backup.log 2>&1
0 2 * * *  /opt/aidc-helpdesk/scripts/backup_files.sh       >> /var/log/aidc-backup.log 2>&1
30 3 * * 0 /opt/aidc-helpdesk/scripts/verify_restore.sh     >> /var/log/aidc-backup.log 2>&1
```

### 6.3 ขั้นตอนกู้คืน (RTO ≤ 4 ชม.)

| ขั้น | คำสั่ง | หมายเหตุ |
|---|---|---|
| 1 | `docker compose stop api worker beat` | หยุดการเขียน ไม่ต้องหยุด postgres |
| 2 | `docker compose exec -T postgres psql -U $POSTGRES_USER -d postgres -c "DROP DATABASE $POSTGRES_DB;"` | ทำหลังยืนยันว่ามี dump ที่ใช้ได้แล้วเท่านั้น |
| 3 | `... -c "CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER;"` | |
| 4 | `docker compose exec -T postgres pg_restore -U $POSTGRES_USER -d $POSTGRES_DB --no-owner < backup/daily/xxx.dump` | ใช้เวลา ~2–5 นาทีที่ขนาดข้อมูลปีแรก |
| 5 | คืนไฟล์แนบ: `rsync -a $OFFSITE/attachments/ $VOL_PATH/` | ต้องคืน **คู่กับ** DB ของวันเดียวกัน มิฉะนั้นจะมีแถว attachment ที่ไม่มีไฟล์ |
| 6 | `docker compose run --rm api alembic upgrade head` | เผื่อ dump เก่ากว่า schema ปัจจุบัน |
| 7 | `docker compose up -d` แล้วตรวจ `/health` + เปิด ticket ตัวอย่าง | |
| 8 | บันทึกผลการกู้คืนลงเอกสาร (NFR-23) | เวลาที่ใช้จริง, ปัญหาที่พบ |

`scripts/verify_restore.sh` (ทดสอบอัตโนมัติรายสัปดาห์ — ไม่แตะฐานข้อมูลจริง)

```bash
#!/usr/bin/env bash
# กู้ dump ล่าสุดลงฐานข้อมูลชั่วคราวแล้วนับแถว เพื่อพิสูจน์ว่า backup ใช้ได้จริง
set -euo pipefail
cd /opt/aidc-helpdesk
set -a; source .env; set +a

LATEST="$(ls -t "${BACKUP_DIR}"/daily/*.dump | head -1)"
TMP_DB="restore_check_$(date +%s)"

docker compose exec -T postgres createdb -U "$POSTGRES_USER" "$TMP_DB"
docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$TMP_DB" --no-owner < "$LATEST"
COUNT=$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$TMP_DB" -tAc \
        "SELECT count(*) FROM ticket;")
docker compose exec -T postgres dropdb -U "$POSTGRES_USER" "$TMP_DB"

echo "restore check OK file=$LATEST tickets=$COUNT"
[ "$COUNT" -ge 0 ] || exit 1
```

---

## 7. Monitoring, Health Check และ Log Rotation

### 7.1 Health check

| ระดับ | จุดตรวจ | ผลลัพธ์ |
|---|---|---|
| Container | `healthcheck` ในทุก service (หัวข้อ 1) | Docker restart เองเมื่อ unhealthy ต่อเนื่อง |
| แอปพลิเคชัน | `GET /api/v1/health` ตรวจ DB (`SELECT 1`), Redis (`PING`), พื้นที่ `/data`, เวลา `scan_sla` ล่าสุด | `200 ok` / `200 degraded` / `503` |
| ภายนอก | ระบบ monitoring ขององค์กร (Zabbix/Uptime Kuma) ยิง `/api/v1/health` ทุก 1 นาที | แจ้งเตือนทีม IT เมื่อล้ม 3 ครั้งติด |

```json
// ตัวอย่าง response ของ /api/v1/health
{
  "status": "degraded",
  "version": "1.0.3",
  "db": "ok",
  "redis": "ok",
  "disk_data_free_percent": 62.4,
  "last_sla_scan_at": "2026-08-31T10:35:00+07:00",
  "checks": [
    { "name": "sla_scan_freshness", "status": "warn",
      "detail": "ไม่มีการสแกน SLA มา 18 นาที (คาดหวังทุก 5 นาที)" }
  ]
}
```

### 7.2 สิ่งที่ต้องเฝ้าดูขั้นต่ำ (ไม่ต้องติดตั้ง Prometheus ในเฟส 1)

| ตัวชี้วัด | เกณฑ์เตือน | ดูจากไหน |
|---|---|---|
| `/api/v1/health` ไม่ตอบ 200 | ทันที | monitoring ภายนอก |
| พื้นที่ว่าง `/data` และ `/var/lib/docker` | < 20% | health endpoint + `df` ใน cron |
| ความยาวคิว Celery | > 500 งานค้างนานเกิน 10 นาที | `redis-cli llen celery` ใน cron |
| `scan_sla` ไม่ได้รัน | > 15 นาที | health endpoint |
| จำนวน 5xx | > 10 ครั้ง/ชม. | นับจาก log ด้วย `jq` ใน cron |
| backup ล่าสุด | > 26 ชม. | `find` ใน cron + แจ้งอีเมล |
| การล็อกอินล้มเหลว | > 100 ครั้ง/ชม./IP | `audit_log` action = `login_failed` |

```bash
# scripts/watchdog.sh — cron ทุก 10 นาที ส่งอีเมลเมื่อพบปัญหา
0,10,20,30,40,50 * * * * /opt/aidc-helpdesk/scripts/watchdog.sh
```

### 7.3 Log rotation

| ประเภท log | วิธีหมุน | เก็บ |
|---|---|---|
| stdout ของทุก container | Docker `json-file` driver, `max-size=20m`, `max-file=5` (ตั้งไว้ใน compose แล้ว) | ~100 MB/service |
| nginx access/error | เขียนลง stdout/stderr → ตกอยู่ใต้กติกาเดียวกัน | เหมือนกัน |
| `/var/log/aidc-backup.log` | `logrotate` รายสัปดาห์ เก็บ 8 สัปดาห์ | |
| PostgreSQL slow query (`log_min_duration_statement=1000`) | stdout ของ container postgres | |
| `audit_log` ในฐานข้อมูล | **ห้ามลบ** เก็บอย่างน้อย 1 ปี (NFR-18); พิจารณา partition รายปีเมื่อเกิน 5 ล้านแถว | |

`/etc/logrotate.d/aidc-helpdesk`

```text
/var/log/aidc-backup.log {
    weekly
    rotate 8
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root adm
}
```

> **หมายเหตุสำหรับ Windows/WSL2:** ค่า log rotation ของ Docker ตั้งใน compose อยู่แล้วจึงใช้ได้เหมือนกัน ส่วน `logrotate` ให้ตั้งใน WSL (`sudo systemctl enable --now logrotate.timer` หรือใส่ใน cron ของ WSL เพราะ systemd ใน WSL อาจไม่ถูกเปิดใช้)

---

## 8. Checklist ก่อน Go-live

| # | รายการ | ผู้รับผิดชอบ | สถานะ |
|---|---|---|---|
| 1 | `.env` กรอกครบ, `chmod 600`, มีสำเนาเก็บในที่เก็บ secret ขององค์กร | BE + ผู้ดูแลระบบ | ☐ |
| 2 | `SECRET_KEY` และรหัสฐานข้อมูลเป็นค่าสุ่มจริง ไม่ใช่ค่าตัวอย่าง | BE | ☐ |
| 3 | ใบรับรอง TLS ติดตั้งแล้วและมือถือของผู้ใช้เชื่อถือ (สำคัญกับผู้ใช้หน้างาน) | ผู้ดูแลระบบ | ☐ |
| 4 | Migration + seed รันสำเร็จบนเซิร์ฟเวอร์จริง | BE | ☐ |
| 5 | รหัส super_admin ถูกเปลี่ยนจากค่าเริ่มต้นแล้ว | ผู้ดูแลระบบ | ☐ |
| 6 | **Backup ทำงานอัตโนมัติ + มีปลายทางนอกเครื่อง + ทดสอบ restore สำเร็จ** (blocker) | BE + PM | ☐ |
| 7 | SMTP ส่งอีเมลจริงถึงผู้ใช้ทดสอบได้ | BE | ☐ |
| 8 | ช่องทางแจ้งเตือนที่ PM เลือก (PM-01) ตั้งค่าและทดสอบแล้ว | BE + PM | ☐ |
| 9 | Health check ถูกผูกกับระบบ monitoring ขององค์กร | ผู้ดูแลระบบ | ☐ |
| 10 | นำเข้าผู้ใช้จริงและตรวจ role/scope ของ company_admin แต่ละบริษัท | PM + company_admin | ☐ |
| 11 | ทดสอบ PDF/Excel ภาษาไทยด้วยข้อมูลจริง 1 รายงาน | BE + PM | ☐ |
| 12 | ระบุผู้ดูแลระบบและช่องทางติดต่อยามฉุกเฉิน (PM-10) | PM | ☐ |
| 13 | แจ้งหน้าต่างบำรุงรักษา (อาทิตย์ 20:00–23:00) ให้ผู้ใช้ทราบ | PM | ☐ |
| 14 | ซ้อม rollback 1 รอบบน staging | BE | ☐ |
