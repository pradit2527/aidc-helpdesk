import 'reflect-metadata';
/**
 * ต้องโหลด .env ก่อนบรรทัด import อื่นทั้งหมด
 *
 * db/client.ts อ่าน DATABASE_URL ตอนโมดูลถูก import ซึ่งเกิดก่อน
 * NestFactory.create() และก่อนที่ ConfigModule จะได้ทำงาน
 * ถ้าโหลดทีหลัง แอปจะตายตอนบูตด้วยข้อความว่าไม่ได้ตั้ง DATABASE_URL
 * ทั้งที่ไฟล์ .env มีค่าอยู่ครบ
 */
import 'dotenv/config';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger as PinoLogger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';

const API_PREFIX = 'api/v1';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // ปิด logger ของ Nest แล้วให้ pino รับช่วง มิฉะนั้น log บูตจะเป็นข้อความเปล่า
    // ปนอยู่กับ JSON ทำให้ตัวเก็บ log แยกฟิลด์บางบรรทัดไม่ได้
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));

  /*
   * บอก Express ว่าอยู่หลัง reverse proxy กี่ชั้น
   *
   * ถ้าไม่ตั้ง req.ip จะเป็น IP ของ nginx ทุกคำขอ ผลคือ rate limit
   * นับรวมผู้ใช้ทั้งบริษัทเป็นก้อนเดียว แล้วบล็อกทุกคนพร้อมกัน
   *
   * ตั้งเป็นจำนวนชั้นที่แน่นอน ไม่ใช่ true — เพราะ true เชื่อ X-Forwarded-For
   * ทั้งสายที่ผู้เรียกปลอมเองได้ ซึ่งทำให้เลี่ยง rate limit ได้ด้วยการใส่ header
   */
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

  app.setGlobalPrefix(API_PREFIX);
  app.use(cookieParser());
  // Swagger UI ต้องโหลดสคริปต์ของตัวเอง จึงปิด CSP ของ helmet ไว้
  // CSP จริงของแอปตั้งที่ nginx และ middleware ของ frontend
  app.use(helmet({ contentSecurityPolicy: false }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // ส่งฟิลด์ที่ไม่รู้จักมา = 400 ไม่ใช่เพิกเฉยเงียบ ๆ
      // ป้องกันบั๊กฝั่ง frontend ที่พิมพ์ชื่อฟิลด์ผิดแล้วไม่มีใครรู้
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('AIDC Helpdesk API')
    .setDescription(
      [
        'API ของระบบ Service Desk กลุ่มบริษัท AIDC 7 บริษัท',
        '',
        '### เอกสารอ้างอิง',
        'สัญญาฉบับเต็มอยู่ที่ `docs/03-api-spec.md` v2.0 (118 endpoint)',
        'หน้านี้คือ OpenAPI ที่ NestJS สร้างจากโค้ดจริง — ถ้าสองอันไม่ตรงกัน ให้ยึดหน้านี้',
        '',
        '### การยืนยันตัวตน',
        'ใช้ **httpOnly cookie** ที่ backend เป็นผู้ตั้ง ไม่ใช่ `Authorization: Bearer`',
        'JavaScript ฝั่ง frontend อ่าน token ไม่ได้เลย ซึ่งปิดช่องที่ XSS จุดเดียวจะขโมย token ทั้งก้อน',
        '',
        '| cookie | อายุ | หมายเหตุ |',
        '|---|---|---|',
        '| `aidc_at` | 30 นาที | access token · HttpOnly |',
        '| `aidc_rt` | 7 วัน | refresh token · HttpOnly · Path=/api/v1/auth |',
        '| `aidc_csrf` | 7 วัน | **อ่านได้ด้วย JS** — ต้องส่งกลับใน header `X-CSRF-Token` ทุก POST/PUT/PATCH/DELETE |',
        '',
        '### กฎที่ระบบบังคับเสมอ',
        '- **Row-level scoping** ที่ชั้น query ทุกครั้ง ไม่พึ่งการซ่อน UI',
        '- **ระดับความสำคัญ P1–P4 ระบบคำนวณจาก impact × urgency** ผู้แจ้งส่งมาเองไม่ได้',
        '- **เวลาที่เหลือเป็นนาทีทำการ** (ยกเว้น P1 ที่นับต่อเนื่อง 24×7)',
        '  frontend จึงต้องไม่ทำนาฬิกานับถอยหลัง — ดูฟิลด์ `remaining_unit`',
        '',
        '### รูปแบบผลลัพธ์',
        'ทุก endpoint ตอบด้วยซองเดียวกัน ยกเว้น `/livez` และ `/readyz`',
        'ที่ผู้บริโภคเป็น load balancer ซึ่งมีสัญญาของตัวเองอยู่แล้ว',
        '',
        '```json',
        '{ "success": true,  "data": { }, "error": null, "meta": { "request_id": "..." } }',
        '{ "success": false, "data": null, "error": { "code": "...", "message": "..." }, "meta": { } }',
        '```',
        '',
        'endpoint ที่แบ่งหน้าจะวางรายการไว้ที่ `data` เป็นอาร์เรย์',
        'และวาง `page` `page_size` `total` `total_pages` ไว้ใน `meta`',
        '',
        '`meta.request_id` ตรงกับ header `X-Request-Id` และกับทุกบรรทัด log ของคำขอนั้น',
        'เวลาผู้ใช้แจ้งปัญหา ให้ขอเลขนี้มาแล้วค้นใน log ได้ทันที',
        '',
        '### รหัสสถานะที่ใช้',
        '`400` รูปร่างคำขอผิด (ฟิลด์เกิน ชนิดผิด) · `422` รูปร่างถูกแต่ผิดกฎธุรกิจ',
        '`401` ยังไม่ยืนยันตัวตน · `403` ยืนยันแล้วแต่ไม่มีสิทธิ์ · `404` ไม่พบหรืออยู่นอกขอบเขต',
        '`409` ชนกับสถานะปัจจุบัน · `423` บัญชีถูกล็อก · `429` เรียกถี่เกินกำหนด',
      ].join('\n'),
    )
    .setVersion('0.1.0')
    .addServer('/', 'เซิร์ฟเวอร์ปัจจุบัน')
    .addCookieAuth('aidc_at', {
      type: 'apiKey',
      in: 'cookie',
      name: 'aidc_at',
      description: 'ตั้งอัตโนมัติหลังเรียก POST /api/v1/auth/login',
    })
    .addTag('Auth', 'เข้าสู่ระบบ ออกจากระบบ และข้อมูลผู้ใช้ปัจจุบัน')
    .addTag('Tickets', 'แจ้งเรื่อง ติดตาม เปลี่ยนสถานะ และทบทวนระดับความสำคัญ')
    .addTag('System', 'ตรวจสุขภาพระบบ')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup(`${API_PREFIX}/docs`, app, document, {
    jsonDocumentUrl: `${API_PREFIX}/openapi.json`,
    customSiteTitle: 'AIDC Helpdesk API',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      tagsSorter: 'alpha',
      tryItOutEnabled: true,
    },
  });

  const port = Number(process.env.PORT ?? 8000);
  await app.listen(port, '0.0.0.0');

  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      `  AIDC Helpdesk API`,
      `  - API      : http://localhost:${port}/${API_PREFIX}`,
      `  - เอกสาร    : http://localhost:${port}/${API_PREFIX}/docs`,
      `  - OpenAPI  : http://localhost:${port}/${API_PREFIX}/openapi.json`,
      '',
    ].join('\n'),
  );
}

void bootstrap();
