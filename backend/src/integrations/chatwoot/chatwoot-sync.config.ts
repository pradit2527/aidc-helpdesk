/**
 * ค่าตั้งการซิงก์แชทสองทาง Helpdesk ↔ Chatwoot
 *
 * ปิดไว้เป็นค่าเริ่มต้น — เปิดเมื่อตั้งครบทุกตัว:
 *   CHATWOOT_SYNC_ENABLED=true
 *   CHATWOOT_BASE_URL         ที่อยู่เซิร์ฟเวอร์ Chatwoot เช่น http://helpdesk.aidclaos.com
 *   CHATWOOT_ACCOUNT_ID       เลขบัญชีใน Chatwoot (ค่าเริ่มต้น 1)
 *   CHATWOOT_SYNC_INBOX_ID    เลข inbox ชนิด API ที่ใช้เก็บแชทจาก Helpdesk
 *   CHATWOOT_API_TOKEN        ⚠️ ความลับ — Access Token ของเจ้าหน้าที่ใน Chatwoot ห้าม commit
 *
 * ทางรับข้อความจาก Chatwoot เป็นการดึงเป็นระยะ ไม่ใช่ webhook โดยตั้งใจ:
 * backend ไม่ต้องเปิดให้อินเทอร์เน็ตเข้าถึง — เครื่อง dev ที่เปิดออกนอกพร้อม header
 * X-Dev-User-Id ใช้งานอยู่ เท่ากับให้ใครก็ได้สวมรอยเป็นผู้ใช้คนใดก็ได้
 */

export interface ChatwootSyncConfig {
  enabled: boolean;
  baseUrl: string;
  accountId: number;
  inboxId: number;
  token: string;
  pollMs: number;
  /** host ที่ยอมให้ดาวน์โหลดไฟล์แนบจาก Chatwoot — กันถูกหลอกให้ backend ไปดึง URL อื่น */
  fileHosts: string[];
}

export function readChatwootSyncConfig(env: NodeJS.ProcessEnv = process.env): ChatwootSyncConfig {
  const baseUrl = (env.CHATWOOT_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const token = (env.CHATWOOT_API_TOKEN ?? '').trim();
  const inboxId = Number(env.CHATWOOT_SYNC_INBOX_ID ?? '');
  const accountId = Number(env.CHATWOOT_ACCOUNT_ID ?? 1);
  const pollMs = Math.max(2000, Number(env.CHATWOOT_SYNC_POLL_MS ?? 4000) || 4000);

  let baseHost = '';
  try {
    baseHost = baseUrl ? new URL(baseUrl).host : '';
  } catch {
    baseHost = '';
  }
  const extraHosts = (env.CHATWOOT_FILE_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);

  return {
    enabled:
      env.CHATWOOT_SYNC_ENABLED === 'true' &&
      baseHost !== '' &&
      token !== '' &&
      Number.isInteger(inboxId) &&
      inboxId > 0 &&
      Number.isInteger(accountId) &&
      accountId > 0,
    baseUrl,
    accountId,
    inboxId,
    token,
    pollMs,
    fileHosts: [baseHost, ...extraHosts].filter(Boolean),
  };
}
