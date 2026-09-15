import { api } from '@/lib/api';

/**
 * แชทถาม-ตอบกับทีม IT ผ่าน Chatwoot
 *
 * เปิดเมื่อตั้งค่าครบทั้งสองตัวเท่านั้น — ขาดตัวใดตัวหนึ่ง ทุกฟังก์ชันในไฟล์นี้ไม่ทำอะไร
 * เครื่อง dev ที่ไม่ได้ตั้งค่าจึงไม่ยิงไปเซิร์ฟเวอร์แชทจริงที่ทีมใช้งานอยู่
 *
 *   NEXT_PUBLIC_CHATWOOT_BASE_URL       ที่อยู่เซิร์ฟเวอร์ Chatwoot
 *   NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN  token ของ inbox แบบ Website
 *
 * ทั้งสองค่าเปิดเผยในหน้าเว็บตามการออกแบบของ Chatwoot ไม่ใช่ความลับ
 * ความลับตัวเดียวคือ HMAC token ซึ่งอยู่ที่ backend เท่านั้น (CHATWOOT_HMAC_TOKEN)
 *
 * ⚠️ ระบบจริงเป็น https — เซิร์ฟเวอร์ Chatwoot ต้องเป็น https ด้วย
 *    มิฉะนั้นเบราว์เซอร์บล็อกสคริปต์และหน้าต่างแชทเพราะเป็น mixed content
 *    โดยไม่มีข้อความเตือนให้ผู้ใช้เห็นเลย ปุ่มแชทแค่ไม่โผล่
 */

const BASE_URL = (process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL ?? '').trim().replace(/\/+$/, '');
const WEBSITE_TOKEN = (process.env.NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN ?? '').trim();

export const CHATWOOT_ENABLED = BASE_URL !== '' && WEBSITE_TOKEN !== '';

interface ChatwootUserAttributes {
  name?: string;
  email?: string;
  identifier_hash?: string;
}

interface ChatwootApi {
  hasLoaded?: boolean;
  setUser: (identifier: string, attributes: ChatwootUserAttributes) => void;
  setCustomAttributes: (attributes: Record<string, string>) => void;
  reset: () => void;
  toggle: (state?: 'open' | 'close') => void;
}

declare global {
  interface Window {
    chatwootSettings?: Record<string, unknown>;
    chatwootSDK?: { run: (options: { websiteToken: string; baseUrl: string }) => void };
    $chatwoot?: ChatwootApi;
  }
}

/** รูปร่างที่ GET /auth/chatwoot-identity ส่งกลับ */
interface ChatwootIdentity {
  identifier: string;
  /** null = backend ยังไม่ได้ตั้ง CHATWOOT_HMAC_TOKEN */
  identifier_hash: string | null;
  name: string;
  email: string | null;
  custom_attributes: Record<string, string>;
}

const SCRIPT_ID = 'chatwoot-sdk';
/** ผู้ใช้ล่าสุดที่บอก Chatwoot ไป — ใช้รู้ว่าเครื่องนี้เปลี่ยนคนนั่งแล้ว */
const LAST_IDENTIFIER_KEY = 'aidc.chatwoot.identifier';

/**
 * โหลดสคริปต์ของ Chatwoot หนึ่งครั้งต่อหน้า
 *
 * สร้าง element เองแทน <script src> ใน JSX เพราะ CSP ใช้ nonce + strict-dynamic —
 * สคริปต์ที่โค้ดของเราซึ่งผ่าน nonce แล้วสร้างขึ้นจะได้รับอนุญาตต่อ ส่วน tag
 * ที่เขียนลงหน้าตรง ๆ ต้องมี nonce ของตัวเอง ซึ่งไม่มีทางรู้ได้ฝั่ง client
 */
export function loadChatwoot(): void {
  if (!CHATWOOT_ENABLED || typeof window === 'undefined') return;
  if (document.getElementById(SCRIPT_ID)) return;

  /*
   * ชุดเดียวกับที่ @chatwoot/docusaurus-plugin ส่งให้ SDK — แอปนี้เป็น Next.js จึงตั้งตรงนี้แทน
   *
   * - position ขวา ไม่ใช่ซ้าย: ฝั่งซ้ายของจอคอมคือแถบเมนู ปุ่มแชทจะทับปุ่มออกจากระบบพอดี
   * - expanded_bubble: ปุ่มมีข้อความบอกว่ากดแล้วได้อะไร ปุ่มกลมไอคอนเปล่าคนไม่รู้ว่าคือแชทกับทีมไอที
   * - locale th: Chatwoot ไม่มีภาษาลาว ไทยใกล้ที่สุดที่ผู้ใช้ในเครืออ่านได้ทุกคน
   *   useBrowserLanguage ปิดไว้ — เบราว์เซอร์ส่วนใหญ่ในสำนักงานตั้งเป็นอังกฤษ ปุ่มในแชทจะกลายเป็นอังกฤษ
   * - darkMode auto: ตามธีมของเครื่อง ไม่แสดงหน้าต่างขาวจ้าทับหน้าจอที่มืดอยู่
   */
  window.chatwootSettings = {
    hideMessageBubble: false,
    position: 'right',
    locale: 'th',
    useBrowserLanguage: false,
    darkMode: 'auto',
    type: 'expanded_bubble',
    launcherTitle: 'ແຊັດກັບທີມໄອທີ',
  };

  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.src = `${BASE_URL}/packs/js/sdk.js`;
  script.async = true;
  script.onload = () => {
    window.chatwootSDK?.run({ websiteToken: WEBSITE_TOKEN, baseUrl: BASE_URL });
  };
  document.body.appendChild(script);
}

/** เรียกเมื่อหน้าต่างแชทพร้อมรับคำสั่ง — ก่อนพร้อม $chatwoot ยังไม่มีหรือยังไม่รับคำสั่ง */
function whenReady(run: (chatwoot: ChatwootApi) => void): void {
  if (window.$chatwoot?.hasLoaded) {
    run(window.$chatwoot);
    return;
  }
  window.addEventListener(
    'chatwoot:ready',
    () => {
      if (window.$chatwoot) run(window.$chatwoot);
    },
    { once: true },
  );
}

function readLastIdentifier(): string | null {
  try {
    return window.localStorage.getItem(LAST_IDENTIFIER_KEY);
  } catch {
    return null;
  }
}

function writeLastIdentifier(identifier: string | null): void {
  try {
    if (identifier) window.localStorage.setItem(LAST_IDENTIFIER_KEY, identifier);
    else window.localStorage.removeItem(LAST_IDENTIFIER_KEY);
  } catch {
    // เบราว์เซอร์ที่ปิด storage ไว้ — แชทยังใช้ได้ แค่ตรวจการเปลี่ยนคนไม่ได้
  }
}

/**
 * บอก Chatwoot ว่าผู้ใช้ที่ล็อกอินอยู่คือใคร
 *
 * เจ้าหน้าที่จะเห็นชื่อ อีเมล บริษัท และแผนกของผู้ถามทันที ไม่ต้องถามซ้ำ
 * และบทสนทนาผูกกับตัวบุคคล เปิดจากเครื่องไหนก็เห็นประวัติเดียวกัน
 *
 * ถ้าเครื่องนี้เคยบอกไว้ว่าเป็นอีกคน ล้างก่อน — คอมพิวเตอร์ใช้ร่วมกันในสาขาเจอกรณีนี้จริง
 * ถ้าไม่ล้าง คนที่ล็อกอินทีหลังจะเห็นแชทค้างของคนก่อนหน้า
 */
export async function identifyChatwootUser(): Promise<void> {
  if (!CHATWOOT_ENABLED) return;

  const identity = await api.get<ChatwootIdentity>('/auth/chatwoot-identity');

  whenReady((chatwoot) => {
    const last = readLastIdentifier();
    if (last && last !== identity.identifier) chatwoot.reset();

    chatwoot.setUser(identity.identifier, {
      name: identity.name,
      ...(identity.email ? { email: identity.email } : {}),
      ...(identity.identifier_hash ? { identifier_hash: identity.identifier_hash } : {}),
    });
    chatwoot.setCustomAttributes(identity.custom_attributes);
    writeLastIdentifier(identity.identifier);
  });
}

/**
 * เปิดหน้าต่างแชท — ใช้จากหน้า "แชทช่วยเหลือ" ให้ผู้ใช้เริ่มพิมพ์ได้ทันทีไม่ต้องหาปุ่มมุมจอ
 *
 * ถ้าสคริปต์ยังโหลดไม่เสร็จ รอให้พร้อมก่อนแล้วค่อยเปิด — กดก่อนพร้อมต้องไม่หายเงียบ
 */
export function openChatwoot(): void {
  if (!CHATWOOT_ENABLED || typeof window === 'undefined') return;
  loadChatwoot();
  whenReady((chatwoot) => chatwoot.toggle('open'));
}

/**
 * ล้างตัวตนและบทสนทนาออกจากหน้าต่างแชท — เรียกตอนออกจากระบบ
 *
 * ไม่งั้นแชทของคนที่เพิ่งออกยังเปิดดูได้บนเครื่องเดิม ทั้งที่ระบบหลักเตะออกแล้ว
 */
export function resetChatwoot(): void {
  if (!CHATWOOT_ENABLED || typeof window === 'undefined') return;
  window.$chatwoot?.reset();
  writeLastIdentifier(null);
}
