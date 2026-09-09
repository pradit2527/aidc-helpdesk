/**
 * ค่าตั้งของการส่งเรื่องแจ้งไปขึ้นบอร์ด Super Work
 *
 * อ่านจาก env ล้วน ไม่ฝังค่าใดไว้ในโค้ด — โดยเฉพาะคีย์ API ซึ่งถ้าหลุดลง repo
 * แล้วเท่ากับให้สิทธิ์เขียนบอร์ดของทั้งองค์กรกับทุกคนที่เห็นโค้ด
 *
 * ปิดไว้เป็นค่าเริ่มต้น (`SUPERWORK_ENABLED` ต้องเป็น 'true' เท่านั้น)
 * เครื่อง dev ของทุกคนจึงไม่ยิงของจริงขึ้นบอร์ดที่ทีมใช้งานอยู่โดยไม่ตั้งใจ
 */

export interface SuperworkConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  activityId: string;
  cardId: string;
  /** อย่างน้อยหนึ่งคน — Super Work ปฏิเสธ task ที่ไม่มีผู้รับผิดชอบ */
  memberIds: string[];
  /** ว่างไว้ = ใช้ผู้ตรวจตั้งต้นของ activity นั้น (สูงสุด 2 คน) */
  checkerIds: string[];
  /**
   * คะแนนงานที่จะส่งไปพร้อมกำหนดเวลา
   *
   * null = ไม่ส่งทั้ง point และ dueDate เลย ซึ่งเป็นค่าเริ่มต้นโดยตั้งใจ
   * Super Work บังคับให้สองค่านี้มาคู่กัน (400 point_deadline_pair_required)
   * และจะ "ทิ้งเงียบ ๆ พร้อมตอบ 201" ถ้าคนที่คีย์สวมบทบาทไม่ใช่หัวหน้า activity
   * การตั้งคะแนนมั่ว ๆ ยังไปกวนงบคะแนนของพนักงานคนนั้นด้วย
   * จึงต้องเป็นการตัดสินใจที่ตั้งใจตั้งค่า ไม่ใช่ค่าที่ติดมาเอง
   */
  point: number | null;
  /** ใส่ลิงก์กลับมาที่ ticket ในคำอธิบาย ให้คนบนบอร์ดกดกลับมาดูต้นเรื่องได้ */
  appBaseUrl: string;
  timeoutMs: number;
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function readSuperworkConfig(env: NodeJS.ProcessEnv = process.env): SuperworkConfig {
  const pointRaw = env.SUPERWORK_POINT?.trim();
  const point = pointRaw ? Number(pointRaw) : NaN;

  return {
    enabled: env.SUPERWORK_ENABLED === 'true',
    baseUrl: (
      env.SUPERWORK_BASE_URL ?? 'https://endpoint.superwork.tech/api/v1/partner/workboard'
    ).replace(/\/+$/, ''),
    apiKey: env.SUPERWORK_API_KEY ?? '',
    activityId: env.SUPERWORK_ACTIVITY_ID ?? '',
    cardId: env.SUPERWORK_CARD_ID ?? '',
    memberIds: list(env.SUPERWORK_MEMBER_IDS),
    checkerIds: list(env.SUPERWORK_CHECKER_IDS),
    point: Number.isFinite(point) ? point : null,
    appBaseUrl: (env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
    timeoutMs: Number(env.SUPERWORK_TIMEOUT_MS ?? 8000),
  };
}

/**
 * บอกว่าตั้งค่าครบพอจะยิงได้ไหม พร้อมเหตุผลเมื่อไม่ครบ
 *
 * คืนเหตุผลเป็นข้อความเพื่อให้ log ตอนบูตบอกได้ตรง ๆ ว่าขาดอะไร — การเปิดใช้
 * ไว้แต่ขาดค่าตัวหนึ่ง แล้วเงียบไปเฉย ๆ คือความล้มเหลวที่ไม่มีใครสังเกตจนสายไป
 */
export function describeMissing(config: SuperworkConfig): string[] {
  const missing: string[] = [];
  if (!config.apiKey) missing.push('SUPERWORK_API_KEY');
  if (!config.activityId) missing.push('SUPERWORK_ACTIVITY_ID');
  if (!config.cardId) missing.push('SUPERWORK_CARD_ID');
  if (config.memberIds.length === 0) missing.push('SUPERWORK_MEMBER_IDS');
  return missing;
}
