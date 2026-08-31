"""ค่าตั้งค่าทั้งหมดของ backend — อ่านจาก environment variable เท่านั้น

หลักการ (docs/10-backend-architecture.md §3.1):
- แหล่งเดียว: ทุกค่ามาจาก env อ่านผ่าน Settings ตัวเดียว
- fail fast: ค่าที่ขาดหรือผิดชนิดต้องทำให้แอปไม่ start ไม่ใช่พังตอน runtime
- ไม่มี default ที่อันตราย: SECRET_KEY ไม่มีค่าเริ่มต้น
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn, RedisDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # ── ทั่วไป ──
    ENV: Literal["local", "staging", "production"] = "local"
    APP_VERSION: str = "0.1.0"
    API_PREFIX: str = "/api/v1"
    TIMEZONE: str = "Asia/Bangkok"
    LOG_LEVEL: str = "INFO"

    # ── ฐานข้อมูล / คิว ──
    DATABASE_URL: PostgresDsn
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 5
    REDIS_URL: RedisDsn

    # ── ความปลอดภัย ──
    SECRET_KEY: str = Field(min_length=32)
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_MINUTES: int = 30
    REFRESH_TOKEN_DAYS: int = 7

    # นโยบาย 3.2: ล็อกเมื่อผิด 5 ครั้ง และ "ปลดล็อกต้องยืนยันตัวตนกับ Service Desk"
    # จึงไม่มีค่า LOGIN_LOCK_MINUTES อีกต่อไป — ปลดได้ทาง POST /users/{id}/unlock เท่านั้น
    LOGIN_MAX_FAILED: int = 5
    PASSWORD_MIN_LENGTH: int = 12          # นโยบาย 3.2 (เดิม 8 — แก้ตาม SRS v2.0 NFR-10)
    PASSWORD_HISTORY_SIZE: int = 5         # [รอ PM ยืนยัน — Q-11]
    ADMIN_PASSWORD_MAX_AGE_DAYS: int = 90  # นโยบาย 3.2

    RATE_LIMIT_LOGIN_PER_MIN: int = 10
    RATE_LIMIT_API_PER_MIN: int = 120

    # ── Cookie (ADR-002 D-01) ──
    # token อยู่ใน httpOnly cookie ที่ backend ตั้งเอง — JavaScript อ่านไม่ได้
    COOKIE_ACCESS_NAME: str = "aidc_at"
    COOKIE_REFRESH_NAME: str = "aidc_rt"
    COOKIE_CSRF_NAME: str = "aidc_csrf"
    COOKIE_DOMAIN: str | None = None
    COOKIE_SECURE: bool = True
    COOKIE_SAMESITE: Literal["strict", "lax", "none"] = "strict"

    # ── ไฟล์แนบ / export ──
    ATTACHMENT_DIR: str = "/data/attachments"
    EXPORT_DIR: str = "/data/exports"
    MAX_UPLOAD_MB: int = 20
    MAX_FILES_PER_REQUEST: int = 5
    SIGNED_URL_TTL_MINUTES: int = 15

    # ── SLA ──
    SLA_SCAN_INTERVAL_MINUTES: int = 5
    SLA_SCAN_STALE_MINUTES: int = 15  # เกินนี้ /health รายงาน degraded

    # ── แจ้งเตือน ──
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 25
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM: str = "helpdesk@aidc.co.th"
    NOTIFY_CHANNELS: list[str] = ["in_app", "email"]
    TEAMS_WEBHOOK_URL: str | None = None
    LINE_CHANNEL_ACCESS_TOKEN: str | None = None
    LINE_CHANNEL_SECRET: str | None = None

    PUBLIC_BASE_URL: str = "https://helpdesk.aidc.local"

    @field_validator("SECRET_KEY")
    @classmethod
    def _reject_placeholder(cls, v: str) -> str:
        if v.lower().startswith(("change", "secret", "placeholder", "example")):
            raise ValueError("SECRET_KEY ยังเป็นค่าตัวอย่าง — สร้างค่าจริงด้วย openssl rand -hex 32")
        return v

    @field_validator("COOKIE_SECURE")
    @classmethod
    def _secure_in_production(cls, v: bool, info) -> bool:
        if info.data.get("ENV") == "production" and not v:
            raise ValueError("COOKIE_SECURE ต้องเป็น true บน production")
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
