/**
 * ค่าตั้งของผู้ช่วย AI (แชทถาม-ตอบปัญหาไอที)
 *
 * ปิดไว้เป็นค่าเริ่มต้น — ต้องตั้ง ASSISTANT_ENABLED=true พร้อม ANTHROPIC_API_KEY
 * เครื่อง dev ของทุกคนจึงไม่เรียก API ที่คิดเงินจริงโดยไม่ตั้งใจ
 *
 * ANTHROPIC_API_KEY ไม่ถูกอ่านที่นี่ — SDK อ่านจาก env เอง การส่งต่อผ่านโค้ด
 * เพิ่มจุดที่คีย์อาจหลุดลง log โดยไม่ได้อะไรเพิ่ม
 */

export const ASSISTANT_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type AssistantEffort = (typeof ASSISTANT_EFFORTS)[number];

export interface AssistantConfig {
  enabled: boolean;
  model: string;
  /**
   * ความลึกของการคิด — medium เป็นค่าเริ่มต้นเพราะแชทถาม-ตอบต้องการคำตอบเร็ว
   * และคำถามส่วนใหญ่เป็นปัญหาพื้นฐาน ยกขึ้นได้ถ้าวัดแล้วคำตอบไม่ดีพอ
   */
  effort: AssistantEffort;
}

export function readAssistantConfig(env: NodeJS.ProcessEnv = process.env): AssistantConfig {
  const effort = env.ASSISTANT_EFFORT?.trim();
  return {
    enabled: env.ASSISTANT_ENABLED === 'true',
    model: env.ASSISTANT_MODEL?.trim() || 'claude-opus-5',
    effort:
      effort && (ASSISTANT_EFFORTS as readonly string[]).includes(effort)
        ? (effort as AssistantEffort)
        : 'medium',
  };
}
