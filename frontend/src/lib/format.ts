/**
 * การจัดรูปแบบวันที่ เวลา และตัวเลข สำหรับผู้ใช้ภาษาลาว
 *
 * ทุกฟังก์ชันในไฟล์นี้ต้องให้ผลเหมือนกันทั้งบนเซิร์ฟเวอร์และเบราว์เซอร์
 * จึงกำหนดโซนเวลาและชื่อเดือนเองทั้งหมด ไม่พึ่ง locale ของเครื่องผู้ใช้
 * ถ้าปล่อยให้ toLocaleString เลือกเอง React จะเตือน hydration mismatch
 * และผู้ใช้ที่ตั้งเครื่องเป็นภาษาอื่นจะเห็นวันที่คนละแบบกับเพื่อนร่วมงาน
 */

export const TIMEZONE = 'Asia/Vientiane';

const LAO_MONTHS = [
  'ມັງກອນ',
  'ກຸມພາ',
  'ມີນາ',
  'ເມສາ',
  'ພຶດສະພາ',
  'ມິຖຸນາ',
  'ກໍລະກົດ',
  'ສິງຫາ',
  'ກັນຍາ',
  'ຕຸລາ',
  'ພະຈິກ',
  'ທັນວາ',
];

const LAO_MONTHS_SHORT = [
  'ມ.ກ.',
  'ກ.ພ.',
  'ມີ.ນ.',
  'ມ.ສ.',
  'ພ.ພ.',
  'ມິ.ຖ.',
  'ກ.ລ.',
  'ສ.ຫ.',
  'ກ.ຍ.',
  'ຕ.ລ.',
  'ພ.ຈ.',
  'ທ.ວ.',
];

const LAO_WEEKDAYS = ['ອາທິດ', 'ຈັນ', 'ອັງຄານ', 'ພຸດ', 'ພະຫັດ', 'ສຸກ', 'ເສົາ'];

/** ดึงส่วนประกอบของเวลาในโซน Asia/Vientiane โดยไม่ขึ้นกับเครื่องผู้ใช้ */
function parts(value: string | Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  const date = typeof value === 'string' ? new Date(value) : value;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const found = Object.fromEntries(
    formatter.formatToParts(date).map((p) => [p.type, p.value]),
  ) as Record<string, string | undefined>;

  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    found.weekday ?? '',
  );

  return {
    year: Number(found.year),
    month: Number(found.month),
    day: Number(found.day),
    // Intl ให้ 24 สำหรับเที่ยงคืนในบาง runtime — ปรับให้เป็น 0
    hour: Number(found.hour) % 24,
    minute: Number(found.minute),
    weekday: weekdayIndex,
  };
}

/**
 * ปีในเอกสารควบคุมทั้งหมดเป็นพุทธศักราช (2569 = 2026)
 * ระบบจึงต้องแสดง พ.ศ. ให้ตรงกับกระดาษที่ผู้ใช้ถืออยู่
 */
export function buddhistYear(gregorian: number): number {
  return gregorian + 543;
}

/** เช่น "31 ສິງຫາ 2569" */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const p = parts(value);
  return `${p.day} ${LAO_MONTHS[p.month - 1]} ${buddhistYear(p.year)}`;
}

/** เช่น "31 ສ.ຫ. 69" — ใช้ในตารางที่พื้นที่จำกัด */
export function formatDateShort(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const p = parts(value);
  return `${p.day} ${LAO_MONTHS_SHORT[p.month - 1]} ${String(buddhistYear(p.year)).slice(-2)}`;
}

/** เช่น "31 ສິງຫາ 2569 14:30 ນ." */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const p = parts(value);
  return `${formatDate(value)} ${pad(p.hour)}:${pad(p.minute)} ນ.`;
}

/** เช่น "14:30 ນ." */
export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const p = parts(value);
  return `${pad(p.hour)}:${pad(p.minute)} ນ.`;
}

/** เช่น "ວັນຈັນ 31 ສິງຫາ 2569" */
export function formatDateFull(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const p = parts(value);
  return `ວັນ${LAO_WEEKDAYS[p.weekday]} ${formatDate(value)}`;
}

export function weekdayName(dayOfWeek: number): string {
  return `ວັນ${LAO_WEEKDAYS[dayOfWeek] ?? '—'}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * แปลงนาทีเป็นข้อความที่อ่านง่าย เช่น "2 ຊມ. 15 ນທ."
 *
 * ไม่แปลงเป็น "วัน" เองโดยพลการ เพราะ 1 วันทำการ = 540 นาที ไม่ใช่ 1,440
 * ถ้าหารด้วย 24 ชั่วโมงจะได้ตัวเลขที่ผิดจากเอกสารควบคุมทันที
 * ให้ผู้เรียกส่ง unit มาบอกเองว่าเป็นนาทีทำการหรือนาทีปฏิทิน
 */
export function formatMinutes(
  minutes: number | null | undefined,
  unit: 'business_minutes' | 'calendar_minutes' = 'business_minutes',
): string {
  if (minutes === null || minutes === undefined) return '—';

  const abs = Math.abs(minutes);
  const BUSINESS_DAY = 540;

  if (unit === 'business_minutes' && abs >= BUSINESS_DAY) {
    const days = Math.floor(abs / BUSINESS_DAY);
    const rest = Math.round((abs % BUSINESS_DAY) / 60);
    return rest > 0 ? `${days} ມື້ເຮັດວຽກ ${rest} ຊມ.` : `${days} ມື້ເຮັດວຽກ`;
  }

  if (abs >= 60) {
    const hours = Math.floor(abs / 60);
    const rest = abs % 60;
    return rest > 0 ? `${hours} ຊມ. ${rest} ນທ.` : `${hours} ຊມ.`;
  }

  return `${abs} ນທ.`;
}

/** ข้อความเวลาคงเหลือ/เกินกำหนด ที่ไม่ซ้ำคำกับป้ายสถานะ SLA */
export function formatSlaRemaining(
  minutes: number | null | undefined,
  unit: 'business_minutes' | 'calendar_minutes' = 'business_minutes',
): string {
  if (minutes === null || minutes === undefined) return 'ຢຸດນັບຢູ່';
  return minutes < 0
    ? `ເກີນມາ ${formatMinutes(minutes, unit)}`
    : `ເຫຼືອ ${formatMinutes(minutes, unit)}`;
}

/** เช่น "2 ມື້ກ່ອນ" — ใช้กับคอลัมน์ "อัปเดตล่าสุด" */
export function formatRelative(value: string | Date | null | undefined, now = new Date()): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  const diffMinutes = Math.round((now.getTime() - date.getTime()) / 60000);

  if (diffMinutes < 1) return 'ຫາກໍ່ນີ້';
  if (diffMinutes < 60) return `${diffMinutes} ນທ. ກ່ອນ`;
  if (diffMinutes < 60 * 24) return `${Math.floor(diffMinutes / 60)} ຊມ. ກ່ອນ`;

  const days = Math.floor(diffMinutes / (60 * 24));
  if (days === 1) return 'ມື້ວານ';
  if (days < 7) return `${days} ມື້ກ່ອນ`;
  return formatDateShort(date);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** อักษรย่อสำหรับรูปแทนตัว — ภาษาลาวใช้ตัวแรกของแต่ละคำ */
export function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('');
}
