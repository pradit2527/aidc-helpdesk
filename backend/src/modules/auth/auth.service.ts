import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';
import type { Response } from 'express';

import { ScopeService } from '../../common/scope.service';
import type { Db } from '../../db/client';
import { DB } from '../../db/db.module';
import { appUser, company, department, passwordHistory } from '../../db/schema';
import type { CurrentUserDto } from './dto/auth.dto';

/** กรอกรหัสผิดครบเท่านี้ครั้งติดกัน บัญชีถูกล็อก (นโยบาย 3.2) */
const MAX_FAILED_LOGINS = 5;

/** เปิดการล็อกบัญชีเมื่อกรอกผิดครบจำนวนหรือไม่ — ค่าเริ่มต้นคือปิด */
const LOCKOUT_ENABLED = process.env.LOCKOUT_ENABLED === 'true';

const ACCESS_TTL_MINUTES = Number(process.env.ACCESS_TOKEN_TTL_MINUTES ?? 30);
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7);

/** เก็บรหัสผ่านเก่ากี่ชุดไว้กันใช้ซ้ำ (นโยบาย 3.2) */
const PASSWORD_HISTORY_DEPTH = 3;

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

interface TokenClaims {
  sub: number;
  /**
   * เวอร์ชันของโทเคนที่ผู้ใช้คนนี้ถืออยู่
   *
   * เพิ่มค่านี้ในฐานข้อมูลเมื่อไรก็ตามที่ต้องการ "เตะออกจากระบบทุกอุปกรณ์"
   * เช่นตอนเปลี่ยนรหัสผ่าน ถอนบทบาท หรือปิดบัญชี — โทเคนเก่าที่ยังไม่หมดอายุ
   * จะใช้ไม่ได้ทันที โดยไม่ต้องมีตารางเก็บโทเคนที่ถูกเพิกถอน
   */
  ver: number;
  typ: 'access' | 'refresh';
}

/**
 * ยืนยันตัวตนและออกโทเคน
 *
 * โทเคนอยู่ในคุกกี้ httpOnly เท่านั้น ไม่เคยอยู่ใน response body
 * และไม่เคยอยู่ใน localStorage — สคริปต์ที่ถูกฝัง (XSS) จึงอ่านไปใช้ต่อไม่ได้
 * ราคาที่จ่ายคือคุกกี้ถูกแนบอัตโนมัติ จึงต้องกัน CSRF ด้วย double-submit token
 */
@Injectable()
export class AuthService {
  private readonly secret: Uint8Array;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly scopes: ScopeService,
  ) {
    const raw = process.env.JWT_SECRET;
    if (!raw || raw.length < 32) {
      // ล้มตั้งแต่บูต ดีกว่าปล่อยให้รันด้วยคีย์ที่เดาได้แล้วมารู้ทีหลัง
      throw new Error('ต้องตั้ง JWT_SECRET ยาวอย่างน้อย 32 อักขระ');
    }
    this.secret = new TextEncoder().encode(raw);
  }

  /**
   * ตรวจรหัสผ่านและออกโทเคน
   *
   * ⚠️ ข้อความผิดพลาดของ "ไม่มีชื่อผู้ใช้นี้" กับ "รหัสผ่านผิด" ต้องเหมือนกัน
   *    ถ้าแยกกัน จะไล่เดาได้ว่าบัญชีใดมีอยู่จริงในระบบ ซึ่งเป็นข้อมูลตั้งต้น
   *    ของการโจมตีแบบเดารหัสผ่านทีละบัญชี
   */
  async login(
    username: string,
    password: string,
  ): Promise<{ user: CurrentUserDto; tokens: SessionTokens; mustChangePassword: boolean }> {
    const [found] = await this.db
      .select({
        id: appUser.id,
        passwordHash: appUser.passwordHash,
        authProvider: appUser.authProvider,
        isActive: appUser.isActive,
        isLocked: appUser.isLocked,
        failedLoginCount: appUser.failedLoginCount,
        tokenVersion: appUser.tokenVersion,
        mustChangePassword: appUser.mustChangePassword,
        deletedAt: appUser.deletedAt,
      })
      .from(appUser)
      .where(eq(appUser.username, username))
      .limit(1);

    // ต้องประกาศชนิดที่ "ตัวแปร" ไม่ใช่ที่ผลลัพธ์ของ arrow
    // TypeScript จะตัดชนิดให้หลังการเรียกฟังก์ชันที่คืน never ก็ต่อเมื่อ
    // ตัวแปรมี type annotation ชัดเจน มิฉะนั้น found ยังเป็น possibly undefined ต่อไป
    const invalid: () => never = () => {
      throw new UnauthorizedException({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'ຊື່ຜູ້ໃຊ້ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ',
        },
      });
    };

    if (!found || found.deletedAt !== null || !found.isActive || !found.passwordHash) {
      /*
       * เผาเวลาให้พอ ๆ กับการตรวจ hash จริง
       *
       * ถ้าตอบกลับทันทีเมื่อไม่มีบัญชี แต่ช้ากว่าเมื่อมีบัญชี ผู้โจมตีจะจับ
       * ความต่างของเวลาแล้วรู้ได้ว่าชื่อผู้ใช้ใดมีอยู่จริง โดยไม่ต้องเดารหัสผ่านเลย
       */
      await argon2.verify(
        '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaaJObG',
        password,
      ).catch(() => false);
      invalid();
    }

    /*
     * ปิดการล็อกบัญชีอัตโนมัติไว้ด้วย LOCKOUT_ENABLED
     *
     * ค่าเริ่มต้นคือปิด เพราะระบบนี้ยังรันบนเครื่องพัฒนา และการล็อกบัญชี
     * ผู้ดูแลคนเดียวของระบบทำให้ไม่มีใครเข้ามาปลดได้เลย (นโยบาย 3.2
     * ห้ามปลดเองตามเวลา และยังไม่มี endpoint ให้ผู้ดูแลปลด)
     *
     * ก่อนขึ้นใช้งานจริงต้องตั้ง LOCKOUT_ENABLED=true และต้องมี
     * POST /users/{id}/unlock พร้อมใช้ก่อน มิฉะนั้นจะเจอปัญหาเดิมบนของจริง
     */
    if (LOCKOUT_ENABLED && found.isLocked) {
      throw new UnauthorizedException({
        error: {
          code: 'ACCOUNT_LOCKED',
          message: 'ບັນຊີຖືກລັອກ ຕິດຕໍ່ Service Desk ເພື່ອຢືນຢັນຕົວຕົນ ແລະ ປົດລັອກ',
        },
        // 423 ไม่ใช่ 401 — ผู้ใช้กรอกถูกก็ยังเข้าไม่ได้ จึงต้องบอกให้ชัดว่าให้ทำอะไรต่อ
        statusCode: 423,
      });
    }

    const ok = await argon2.verify(found.passwordHash, password).catch(() => false);

    if (!ok) {
      if (LOCKOUT_ENABLED) {
        const attempts = found.failedLoginCount + 1;
        const shouldLock = attempts >= MAX_FAILED_LOGINS;
        await this.db
          .update(appUser)
          .set({
            failedLoginCount: attempts,
            isLocked: shouldLock,
            lockedAt: shouldLock ? new Date() : null,
          })
          .where(eq(appUser.id, found.id));
      }
      invalid();
    }

    // เข้าสำเร็จ = ล้างตัวนับ มิฉะนั้นความผิดพลาดที่กระจายอยู่หลายเดือนจะสะสมจนล็อก
    await this.db
      .update(appUser)
      .set({ failedLoginCount: 0, lastLoginAt: new Date() })
      .where(eq(appUser.id, found.id));

    return {
      user: await this.currentUser(found.id),
      tokens: await this.issueTokens(found.id, found.tokenVersion),
      mustChangePassword: found.mustChangePassword,
    };
  }

  /** ต่ออายุ session จาก refresh token */
  async refresh(refreshToken: string): Promise<SessionTokens> {
    const claims = await this.verify(refreshToken, 'refresh');
    const [user] = await this.db
      .select({ id: appUser.id, tokenVersion: appUser.tokenVersion, isActive: appUser.isActive })
      .from(appUser)
      .where(eq(appUser.id, claims.sub))
      .limit(1);

    if (!user || !user.isActive || user.tokenVersion !== claims.ver) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHENTICATED', message: 'ເຊດຊັນໝົດອາຍຸແລ້ວ ກະລຸນາເຂົ້າສູ່ລະບົບໃໝ່' },
      });
    }
    return this.issueTokens(user.id, user.tokenVersion);
  }

  /**
   * เปลี่ยนรหัสผ่าน
   *
   * เพิ่ม token_version ด้วยเสมอ เพื่อเตะทุกอุปกรณ์ที่ยังค้าง session อยู่ออก
   * เพราะเหตุผลที่คนเปลี่ยนรหัสผ่านบ่อยที่สุดคือสงสัยว่ารหัสเดิมรั่ว
   */
  async changePassword(userId: number, current: string, next: string): Promise<void> {
    const [user] = await this.db
      .select({ id: appUser.id, passwordHash: appUser.passwordHash })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1);

    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, current).catch(() => false))) {
      throw new UnauthorizedException({
        error: { code: 'INVALID_CREDENTIALS', message: 'ລະຫັດຜ່ານປັດຈຸບັນບໍ່ຖືກຕ້ອງ' },
      });
    }

    await this.assertNotReused(userId, next);

    const hash = await argon2.hash(next, { type: argon2.argon2id });
    await this.db.transaction(async (tx) => {
      await tx.insert(passwordHistory).values({ userId, passwordHash: hash });
      await tx
        .update(appUser)
        .set({
          passwordHash: hash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          tokenVersion: sql`${appUser.tokenVersion} + 1`,
        })
        .where(eq(appUser.id, userId));
    });
  }

  /** ห้ามใช้ซ้ำกับรหัสผ่านล่าสุด 3 ชุด (นโยบาย 3.2) */
  private async assertNotReused(userId: number, next: string): Promise<void> {
    const recent = await this.db
      .select({ hash: passwordHistory.passwordHash })
      .from(passwordHistory)
      .where(eq(passwordHistory.userId, userId))
      .orderBy(desc(passwordHistory.createdAt))
      .limit(PASSWORD_HISTORY_DEPTH);

    for (const row of recent) {
      if (await argon2.verify(row.hash, next).catch(() => false)) {
        throw new UnauthorizedException({
          error: {
            code: 'VALIDATION_ERROR',
            message: `ຫ້າມໃຊ້ຊ້ຳກັບ ${PASSWORD_HISTORY_DEPTH} ລະຫັດຜ່ານຫຼ້າສຸດ`,
          },
        });
      }
    }
  }

  async currentUser(userId: number): Promise<CurrentUserDto> {
    const scope = await this.scopes.forUser(userId);

    const [row] = await this.db
      .select({
        id: appUser.id,
        username: appUser.username,
        fullName: appUser.fullName,
        email: appUser.email,
        jobTitle: appUser.jobTitle,
        companyId: appUser.companyId,
        companyCode: company.code,
        companyName: company.nameTh,
        departmentId: appUser.departmentId,
        departmentName: department.name,
      })
      .from(appUser)
      .innerJoin(company, eq(company.id, appUser.companyId))
      .leftJoin(department, eq(department.id, appUser.departmentId))
      .where(eq(appUser.id, userId))
      .limit(1);

    if (!row) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHENTICATED', message: 'ບໍ່ພົບບັນຊີຜູ້ໃຊ້' },
      });
    }

    // อ่านชื่อบริษัทในขอบเขตมาด้วย เพราะ frontend แสดงรหัสบริษัทบนหน้าจอ
    // ถ้าส่งแต่ id ไป frontend ต้องยิงอีกรอบเพื่อแปลงเป็นชื่อ
    const scoped = await this.db
      .select({ id: company.id, code: company.code, nameTh: company.nameTh })
      .from(company)
      .where(inArray(company.id, [...scope.companyIds]));

    return {
      id: row.id,
      username: row.username,
      full_name: row.fullName,
      email: row.email,
      job_title: row.jobTitle,
      company: { id: row.companyId, code: row.companyCode, name_th: row.companyName },
      department: row.departmentId
        ? { id: row.departmentId, name: row.departmentName ?? '' }
        : null,
      roles: [...scope.roleCodes],
      scoped_companies: scoped.map((c) => ({ id: c.id, code: c.code, name_th: c.nameTh })),
      permissions: [...scope.permissions],
    } as CurrentUserDto;
  }

  /** ข้อมูลสำหรับ GET /auth/me — เหมือน currentUser แต่พ่วงธงบังคับเปลี่ยนรหัสผ่าน */
  async meFor(userId: number): Promise<CurrentUserDto & { must_change_password: boolean }> {
    const [row] = await this.db
      .select({ mustChangePassword: appUser.mustChangePassword })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1);

    return {
      ...(await this.currentUser(userId)),
      must_change_password: row?.mustChangePassword ?? false,
    };
  }

  /** อ่าน user id จาก access token — ใช้โดย ScopeGuard */
  async userIdFromAccessToken(token: string): Promise<number> {
    const claims = await this.verify(token, 'access');
    const [user] = await this.db
      .select({ tokenVersion: appUser.tokenVersion })
      .from(appUser)
      .where(and(eq(appUser.id, claims.sub), eq(appUser.isActive, true)))
      .limit(1);

    if (!user || user.tokenVersion !== claims.ver) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHENTICATED', message: 'ເຊດຊັນໝົດອາຍຸແລ້ວ' },
      });
    }
    return claims.sub;
  }

  private async issueTokens(userId: number, tokenVersion: number): Promise<SessionTokens> {
    const sign = (typ: TokenClaims['typ'], ttl: string): Promise<string> =>
      // sub ตามสเปก JWT ต้องเป็นสตริง jose จึงบังคับชนิดไว้
      new SignJWT({ sub: String(userId), ver: tokenVersion, typ })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(ttl)
        .sign(this.secret);

    return {
      accessToken: await sign('access', `${ACCESS_TTL_MINUTES}m`),
      refreshToken: await sign('refresh', `${REFRESH_TTL_DAYS}d`),
      // token นี้ไม่ต้องเซ็น เพราะไม่ได้ใช้พิสูจน์ตัวตน
      // หน้าที่เดียวคือ "ค่าที่เว็บอื่นเดาไม่ได้และอ่านจากคุกกี้ของเราไม่ได้"
      csrfToken: crypto.randomUUID(),
    };
  }

  private async verify(token: string, expected: TokenClaims['typ']): Promise<TokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.secret);
      const claims = {
        sub: Number(payload.sub),
        ver: Number((payload as Record<string, unknown>).ver),
        typ: (payload as Record<string, unknown>).typ,
      } as TokenClaims;
      // access token ใช้แทน refresh ไม่ได้ และกลับกัน — อายุกับขอบเขตต่างกันคนละเรื่อง
      if (claims.typ !== expected) throw new Error('token ผิดประเภท');
      return claims;
    } catch {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHENTICATED', message: 'ເຊດຊັນໝົດອາຍຸແລ້ວ ກະລຸນາເຂົ້າສູ່ລະບົບໃໝ່' },
      });
    }
  }
}

/** ชื่อคุกกี้ทั้งสามตัว — ใช้ร่วมกันระหว่าง controller และ guard */
export const COOKIE = {
  access: 'aidc_at',
  refresh: 'aidc_rt',
  csrf: 'aidc_csrf',
} as const;

/**
 * ตั้งคุกกี้ทั้งสามตัวลงใน response
 *
 * ขอบเขต path ต่างกันโดยตั้งใจ
 *   - access ใช้ได้ทุก endpoint
 *   - refresh ใช้ได้เฉพาะ /auth เพื่อไม่ให้ถูกส่งไปกับทุกคำขอโดยไม่จำเป็น
 *   - csrf ต้องอ่านได้ด้วย JS จึงไม่ใส่ httpOnly (นั่นคือหน้าที่ของมัน)
 */
export function setSessionCookies(res: Response, tokens: SessionTokens): void {
  const secure = process.env.COOKIE_SECURE === 'true';
  const base = { httpOnly: true, secure, sameSite: 'strict' as const };

  res.cookie(COOKIE.access, tokens.accessToken, {
    ...base,
    path: '/api/v1',
    maxAge: ACCESS_TTL_MINUTES * 60_000,
  });
  res.cookie(COOKIE.refresh, tokens.refreshToken, {
    ...base,
    path: '/api/v1/auth',
    maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60_000,
  });
  res.cookie(COOKIE.csrf, tokens.csrfToken, {
    httpOnly: false,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge: ACCESS_TTL_MINUTES * 60_000,
  });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(COOKIE.access, { path: '/api/v1' });
  res.clearCookie(COOKIE.refresh, { path: '/api/v1/auth' });
  res.clearCookie(COOKIE.csrf, { path: '/' });
}
