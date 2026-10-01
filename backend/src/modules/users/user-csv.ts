/**
 * แปลงทะเบียนผู้ใช้เป็น CSV ที่ Excel บนเครื่องผู้ใช้เปิดแล้วอ่านออก
 *
 * ภาษาลาวกับไทยในไฟล์ CSV คือจุดที่พังบ่อยที่สุด — Excel บน Windows
 * เดาการเข้ารหัสจากโค้ดเพจของเครื่อง ไม่ได้เดาเป็น UTF-8 ไฟล์ที่ถูกต้องทุกไบต์
 * จึงเปิดมาเป็นตัวต่างดาว แล้วผู้ใช้สรุปว่า "ระบบส่งออกไฟล์เสีย"
 * BOM ข้างหน้าคือสิ่งเดียวที่บอก Excel ว่าเป็น UTF-8 และต้องมาคู่กับ CRLF
 */

/** เพดานแถวต่อหนึ่งคำขอ — องค์กรนี้มีพนักงานหลักร้อย จึงไม่เคยชนในการใช้งานจริง */
export const USER_EXPORT_MAX_ROWS = 5000;

export interface UserCsvRow {
  username: string;
  full_name: string;
  email: string | null;
  employee_code: string | null;
  job_title: string | null;
  company_code: string;
  department_name: string | null;
  roles: string;
  is_active: boolean;
  is_locked: boolean;
  must_change_password: boolean;
  last_login_at: Date | null;
}

const HEADERS = [
  'username',
  'ຊື່-ນາມສະກຸນ',
  'ອີເມວ',
  'ລະຫັດພະນັກງານ',
  'ຕຳແໜ່ງ',
  'ບໍລິສັດ',
  'ພະແນກ',
  'ບົດບາດ',
  'ໃຊ້ງານຢູ່',
  'ຖືກລັອກ',
  'ຍັງໃຊ້ລະຫັດຕັ້ງຕົ້ນ',
  'ເຂົ້າລະບົບລ່າສຸດ',
] as const;

const yesNo = (value: boolean): string => (value ? 'ແມ່ນ' : 'ບໍ່');

/**
 * เวลาตามโซนเวียงจันทน์ ไม่ใช่ UTC
 *
 * ผู้อ่านไฟล์นี้อยู่ที่เวียงจันทน์ การส่ง UTC ออกไปแปลว่าทุกเวลาเลื่อนไป 7 ชั่วโมง
 * ซึ่งเงียบพอที่จะไม่มีใครสังเกต แต่ทำให้ "เข้าระบบล่าสุดเมื่อวาน" กลายเป็นวันอื่น
 */
function vientianeTime(value: Date | null): string {
  if (!value) return 'ຍັງບໍ່ເຄີຍເຂົ້າ';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Vientiane',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(value);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

/**
 * ครอบค่าหนึ่งช่องตามกติกาของ RFC 4180
 *
 * ⚠️ เครื่องหมาย = + - @ ข้างหน้าค่าถูกตีความเป็นสูตรโดย Excel (CSV injection)
 *    ชื่อหรือตำแหน่งที่ขึ้นต้นด้วยอักขระพวกนี้จึงถูกเติม ' นำหน้า
 *    ข้อมูลในระบบนี้มาจากการนำเข้าไฟล์ของผู้ดูแล ซึ่งเป็นข้อมูลที่คนพิมพ์เข้ามา
 *    ไม่ใช่ค่าที่ระบบสร้างเอง จึงต้องถือว่าควบคุมเนื้อหาไม่ได้
 */
function cell(value: string | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: readonly UserCsvRow[]): string {
  const lines = [HEADERS.map(cell).join(',')];

  for (const r of rows) {
    lines.push(
      [
        cell(r.username),
        cell(r.full_name),
        cell(r.email),
        cell(r.employee_code),
        cell(r.job_title),
        cell(r.company_code),
        cell(r.department_name),
        cell(r.roles),
        cell(yesNo(r.is_active)),
        cell(yesNo(r.is_locked)),
        cell(yesNo(r.must_change_password)),
        cell(vientianeTime(r.last_login_at)),
      ].join(','),
    );
  }

  // BOM + CRLF — สองอย่างนี้ต้องมาคู่กัน มิฉะนั้น Excel ยังอ่านผิดอยู่ดี
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** ชื่อไฟล์ที่เรียงตามวันได้เมื่อเก็บหลายครั้ง */
export function exportFileName(now: Date): string {
  const stamp = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Vientiane',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .replace(/-/g, '');
  return `aidc-helpdesk-users-${stamp}.csv`;
}
