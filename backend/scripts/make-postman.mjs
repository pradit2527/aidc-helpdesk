/**
 * สร้าง Postman collection จาก OpenAPI ของเซิร์ฟเวอร์ที่รันอยู่
 *
 *   node scripts/make-postman.mjs [http://localhost:8000]
 *
 * สร้างจากสเปกจริงแทนการเขียนมือ เพราะ collection ที่เขียนมือจะล้าสมัย
 * ทันทีที่เพิ่ม endpoint แล้วคนที่ใช้จะไม่รู้ว่ามันตกรุ่นไปแล้ว
 *
 * ⚠️ สองอย่างที่ทำให้ยิง API นี้จาก Postman ไม่ผ่านถ้าไม่ตั้งค่า
 *
 *   1. token อยู่ในคุกกี้ httpOnly ไม่ใช่ Authorization header
 *      Postman เก็บคุกกี้ให้เองในคุกกี้จาร์ ใช้ได้เลยหลังยิง login
 *      แต่ต้องไม่ปิด "Automatically follow redirects" หรือล้างจาร์ทิ้ง
 *
 *   2. ทุก POST/PATCH/DELETE ต้องมี header X-CSRF-Token ที่ตรงกับ
 *      คุกกี้ aidc_csrf มิฉะนั้นได้ 403 ทุกครั้ง
 *      สคริปต์ระดับ collection ด้านล่างอ่านคุกกี้แล้วเติม header ให้อัตโนมัติ
 */

import fs from 'node:fs';
import path from 'node:path';

const ORIGIN = process.argv[2] ?? 'http://localhost:8000';
const SPEC_URL = `${ORIGIN}/api/v1/openapi.json`;

/**
 * เติม X-CSRF-Token ให้ทุกคำขอที่เปลี่ยนสถานะ
 *
 * อ่านจากคุกกี้จาร์ของ Postman ซึ่งได้ค่ามาตอนยิง login
 * ถ้ายังไม่เคย login จะไม่มีคุกกี้ สคริปต์จึงไม่เติมอะไรและปล่อยให้ได้ 401
 * ซึ่งเป็นข้อความที่บอกปัญหาตรงกว่า 403 จาก CSRF
 */
const PRE_REQUEST = `
const method = pm.request.method;
if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
  const jar = pm.cookies;
  const csrf = jar.has('aidc_csrf') ? jar.get('aidc_csrf') : null;
  if (csrf) {
    pm.request.headers.upsert({ key: 'X-CSRF-Token', value: csrf });
  } else {
    console.warn('ยังไม่มีคุกกี้ aidc_csrf — ยิง POST /auth/login ก่อน');
  }
}
`.trim();

/** ตรวจรูปแบบซองมาตรฐานให้ทุกคำขอ จะได้รู้ทันทีเมื่อสัญญาเปลี่ยน */
const TEST_SCRIPT = `
pm.test('ตอบกลับเป็น JSON', () => pm.response.to.be.json);

const body = pm.response.json();
const isEnvelopeExempt = pm.request.url.getPath().match(/\\/(livez|readyz)$/);

if (!isEnvelopeExempt) {
  pm.test('ห่อด้วยซองมาตรฐาน { success, data, error, meta }', () => {
    pm.expect(body).to.have.all.keys('success', 'data', 'error', 'meta');
  });
  pm.test('meta.request_id มีค่า — ใช้อ้างอิงตอนแจ้งปัญหา', () => {
    pm.expect(body.meta.request_id).to.be.a('string').and.not.empty;
  });
}
`.trim();

function folderFor(op, fallbackPath) {
  const tag = op.tags?.[0];
  if (tag) return tag;
  return fallbackPath.split('/').filter(Boolean)[2] ?? 'อื่น ๆ';
}

/** ตัวอย่าง body จาก schema — Postman ต้องมีอะไรให้แก้ ไม่ใช่ช่องว่างเปล่า */
function sampleBody(op, spec) {
  const content = op.requestBody?.content?.['application/json'];
  if (!content?.schema) return null;

  const resolve = (schema, depth = 0) => {
    if (!schema || depth > 4) return null;
    if (schema.$ref) {
      const name = schema.$ref.split('/').pop();
      return resolve(spec.components?.schemas?.[name], depth + 1);
    }
    if (schema.type === 'array') return [resolve(schema.items, depth + 1)].filter((v) => v !== null);
    if (schema.properties) {
      const out = {};
      for (const [key, prop] of Object.entries(schema.properties)) {
        out[key] = prop.example ?? resolve(prop, depth + 1) ?? defaultFor(prop);
      }
      return out;
    }
    return schema.example ?? defaultFor(schema);
  };

  return resolve(content.schema);
}

function defaultFor(schema) {
  if (!schema) return null;
  if (schema.enum?.length) return schema.enum[0];
  switch (schema.type) {
    case 'string':
      return '';
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    default:
      return null;
  }
}

const spec = await fetch(SPEC_URL).then((r) => {
  if (!r.ok) throw new Error(`อ่าน ${SPEC_URL} ไม่ได้ (${r.status}) — เซิร์ฟเวอร์รันอยู่ไหม`);
  return r.json();
});

const folders = new Map();

for (const [rawPath, ops] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(ops)) {
    const name = folderFor(op, rawPath);
    if (!folders.has(name)) folders.set(name, []);

    // แปลง /api/v1/tickets/{id} เป็นรูปแบบตัวแปรของ Postman
    const pmPath = rawPath.replace(/^\//, '').split('/');
    const query = (op.parameters ?? [])
      .filter((p) => p.in === 'query')
      .map((p) => ({
        key: p.name,
        value: p.example !== undefined ? String(p.example) : '',
        description: p.description ?? '',
        // ปิดไว้ก่อนทุกตัว ให้ผู้ใช้ติ๊กเปิดเฉพาะที่ต้องการ
        disabled: true,
      }));

    const body = sampleBody(op, spec);

    folders.get(name).push({
      name: `${method.toUpperCase()} ${rawPath.replace('/api/v1', '')} — ${op.summary ?? ''}`.trim(),
      request: {
        method: method.toUpperCase(),
        header: body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
        ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2) } } : {}),
        url: {
          raw: `{{baseUrl}}/${pmPath.join('/')}`,
          host: ['{{baseUrl}}'],
          path: pmPath,
          ...(query.length ? { query } : {}),
        },
        description: op.description ?? '',
      },
      response: [],
    });
  }
}

const collection = {
  info: {
    name: 'AIDC Helpdesk API',
    description: [
      'สร้างอัตโนมัติจาก OpenAPI ของเซิร์ฟเวอร์ อย่าแก้ด้วยมือ',
      'สร้างใหม่ด้วย: node scripts/make-postman.mjs [origin]',
      '',
      '## เริ่มใช้งาน',
      '1. เลือก environment แล้วตั้ง baseUrl',
      '2. ยิง `POST /auth/login` หนึ่งครั้ง — Postman เก็บคุกกี้ให้เอง',
      '3. หลังจากนั้นยิง endpoint อื่นได้เลย ไม่ต้องแนบ token',
      '',
      '## สิ่งที่สคริปต์จัดการให้',
      '- `X-CSRF-Token` ถูกเติมอัตโนมัติทุก POST/PATCH/DELETE',
      '  จากคุกกี้ `aidc_csrf` ถ้าไม่มีจะได้ 403 ทุกครั้ง',
      '- ทุกคำขอถูกตรวจว่าตอบเป็นซองมาตรฐาน `{ success, data, error, meta }`',
      '',
      '## ที่ต้องระวัง',
      '- อย่าล้างคุกกี้จาร์ ไม่งั้นต้อง login ใหม่',
      '- `aidc_rt` จำกัด path ไว้ที่ `/api/v1/auth` จึงถูกส่งเฉพาะตอนต่ออายุ session',
      '- token อยู่ในคุกกี้ httpOnly — อ่านค่าจาก Postman ไม่ได้ และไม่จำเป็นต้องอ่าน',
    ].join('\n'),
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  event: [
    { listen: 'prerequest', script: { type: 'text/javascript', exec: PRE_REQUEST.split('\n') } },
    { listen: 'test', script: { type: 'text/javascript', exec: TEST_SCRIPT.split('\n') } },
  ],
  variable: [
    { key: 'baseUrl', value: `${ORIGIN}/api/v1`, type: 'string' },
    { key: 'username', value: 'admin', type: 'string' },
    { key: 'password', value: '', type: 'string' },
  ],
  item: [...folders.entries()]
    .sort(([a], [b]) => (a === 'Auth' ? -1 : b === 'Auth' ? 1 : a.localeCompare(b)))
    .map(([name, items]) => ({ name, item: items })),
};

// ให้ login ใช้ตัวแปรแทนค่าตายตัว จะได้ไม่มีรหัสผ่านติดอยู่ในไฟล์ที่แชร์กัน
const auth = collection.item.find((f) => f.name === 'Auth');
const login = auth?.item.find((i) => i.request.method === 'POST' && i.name.includes('/auth/login'));
if (login) {
  login.request.body.raw = JSON.stringify(
    { username: '{{username}}', password: '{{password}}' },
    null,
    2,
  );
}

const outDir = path.resolve('postman');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'aidc-helpdesk.postman_collection.json');
fs.writeFileSync(outFile, JSON.stringify(collection, null, 2) + '\n', 'utf8');

const envFile = path.join(outDir, 'aidc-helpdesk.postman_environment.json');
fs.writeFileSync(
  envFile,
  JSON.stringify(
    {
      name: 'AIDC Helpdesk — local',
      values: [
        { key: 'baseUrl', value: 'http://localhost:8000/api/v1', enabled: true },
        { key: 'username', value: 'admin', enabled: true },
        // ปล่อยว่างโดยตั้งใจ — ไฟล์นี้ถูก commit ขึ้น repo สาธารณะ
        { key: 'password', value: '', type: 'secret', enabled: true },
      ],
      _postman_variable_scope: 'environment',
    },
    null,
    2,
  ) + '\n',
  'utf8',
);

const endpointCount = [...folders.values()].reduce((sum, list) => sum + list.length, 0);
console.log(`สร้างแล้ว ${endpointCount} endpoint ใน ${folders.size} โฟลเดอร์`);
console.log(`  ${outFile}`);
console.log(`  ${envFile}`);
