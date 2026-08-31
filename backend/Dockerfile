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

# ไลบรารีระบบสำหรับ WeasyPrint และการขึ้นรูป/ตัดคำภาษาไทย
#   libthai0 + libdatrie1  = ตัดคำไทย (ขาดแล้วบรรทัดจะตัดกลางคำหรือข้อความล้นตาราง)
#   pango + harfbuzz       = วางสระและวรรณยุกต์ให้ถูกตำแหน่ง (ขาดแล้วสระลอย)
#   libmagic1              = ตรวจ MIME จาก magic bytes จริง (NFR-15)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
        libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b \
        libthai0 libdatrie1 \
        libcairo2 libgdk-pixbuf-2.0-0 shared-mime-info \
        libmagic1 fontconfig tzdata curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv

# ฟอนต์ไทย (Sarabun และ Noto Sans Thai — SIL OFL 1.1 ใช้เชิงพาณิชย์ได้)
# ต้องเป็นฟอนต์ชุดเดียวกับที่ frontend ใช้ รายงานบนจอกับใน PDF จะได้หน้าตาตรงกัน (ADR-003)
COPY assets/fonts/ /usr/share/fonts/truetype/thai/
# ถ้าฟอนต์ไม่ติด ให้ build ล้มตรงนี้เลย ดีกว่าไปเจอเป็น PDF กล่องตอน UAT
RUN fc-cache -fv && fc-list | grep -qi sarabun

# ผู้ใช้ที่ไม่ใช่ root — uid 1000 ต้องตรงกับที่ backup script คาดหวัง
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
