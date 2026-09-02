import type { Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { RequestContextStore, resolveRequestId } from '../http/request-context';

/**
 * ฟิลด์ที่ห้ามโผล่ใน log เด็ดขาด
 *
 * log มักถูกส่งต่อไป ELK หรือ Loki ซึ่งมีคนเข้าถึงได้กว้างกว่าฐานข้อมูลมาก
 * รหัสผ่านหรือ token ที่หลุดไปอยู่ในนั้นเท่ากับรั่วออกนอกระบบแล้ว
 * และ log เก่ามักถูกเก็บไว้นานกว่าที่ token จะหมดอายุเสียอีก
 */
const REDACTED = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'req.body.password',
  'req.body.current_password',
  'req.body.new_password',
];

/** เส้นทางที่ไม่ต้องเขียน log — ถูกเรียกทุกไม่กี่วินาทีและไม่มีข้อมูลให้วิเคราะห์ */
const QUIET_PATHS = new Set(['/api/v1/livez', '/api/v1/readyz', '/api/v1/health']);

const isProduction = process.env.NODE_ENV === 'production';

/**
 * pino-pretty เป็น devDependency จึงไม่มีอยู่ใน image ของ production
 *
 * ถ้าอ้างถึงมันโดยไม่ตรวจก่อน pino จะโยน "unable to determine transport target"
 * ตั้งแต่ตอนสร้าง logger ซึ่งเกิดก่อนที่แอปจะขึ้น — ผลคือ **ทั้งระบบบูตไม่ขึ้น
 * เพราะตัวจัดรูปแบบ log หายไป** ซึ่งเป็นเหตุผลที่ยอมรับไม่ได้เลย
 * ตรวจก่อนใช้ แล้วถอยไปใช้ JSON ธรรมดาแทนถ้าไม่มี
 */
function hasPinoPretty(): boolean {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

const usePretty = !isProduction && hasPinoPretty();

/**
 * ตั้งค่า pino ให้ log เป็น JSON ที่ query ได้บน centralized logging
 *
 * ทุกบรรทัดมี request_id และ user_id เสมอ ทำให้ตอบคำถามอย่าง
 * "ผู้ใช้คนนี้เจออะไรบ้างตอนบ่ายสองโมง" ได้ด้วย query เดียว
 * แทนที่จะต้องไล่อ่าน log ทีละบรรทัด
 */
export const loggerConfig: Params = {
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),

    // บนเครื่องพัฒนาอ่าน JSON ด้วยตาไม่ไหว จึงจัดรูปให้อ่านง่าย
    // บน production ต้องเป็น JSON บรรทัดเดียวเพื่อให้ตัวเก็บ log แยกฟิลด์ได้
    ...(usePretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { singleLine: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
          },
        }
      : {}),

    redact: { paths: REDACTED, censor: '[ตัดออก]' },

    // ใช้ id เดียวกับที่ middleware ตั้งไว้ เพื่อให้ log ของ pino กับของ filter
    // อ้างถึงคำขอเดียวกันจริง ๆ ไม่ใช่คนละเลขที่บังเอิญอยู่ใกล้กัน
    genReqId: (req: IncomingMessage) =>
      RequestContextStore.requestId() ??
      resolveRequestId(req.headers['x-request-id'] as string | undefined),

    customProps: () => ({
      request_id: RequestContextStore.requestId() ?? null,
      user_id: RequestContextStore.userId() ?? null,
    }),

    // ไม่ log health check ที่สำเร็จ มิฉะนั้น log จะเต็มไปด้วยบรรทัดเดิมซ้ำ ๆ
    // แต่ยัง log เมื่อมันล้มเหลว เพราะนั่นคือสัญญาณว่าระบบกำลังมีปัญหา
    autoLogging: {
      ignore: (req: IncomingMessage) => QUIET_PATHS.has((req.url ?? '').split('?')[0] ?? ''),
    },

    customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },

    // ตัดฟิลด์ที่ไม่ได้ใช้ออก ให้เหลือเฉพาะที่ query จริง
    serializers: {
      req: (req: IncomingMessage & { url?: string; method?: string }) => ({
        method: req.method,
        // ตัด query string ทิ้ง เพราะคำค้นอาจมีชื่อคนหรือเลขที่เอกสาร
        path: (req.url ?? '').split('?')[0],
      }),
      res: (res: ServerResponse) => ({ status: res.statusCode }),
    },
  },
};
