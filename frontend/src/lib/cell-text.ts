import * as React from 'react';

/**
 * ดึง "ข้อความที่ผู้ใช้เห็น" ออกจากเซลล์ของตาราง
 *
 * ตารางรายงานนิยามคอลัมน์เป็นฟังก์ชัน render ที่คืน JSX (ตัวหนา สีตามสถานะ ลิงก์เลขที่เรื่อง)
 * แต่การเรียงลำดับ ค้นหา และส่งออกไฟล์ต้องใช้ค่าธรรมดา จึงอ่านจากสิ่งที่ render คืนมาชุดเดียวกัน
 * ไม่ต้องเขียน accessor ซ้ำทุกคอลัมน์ของยี่สิบกว่าตาราง
 *
 *   ข้อความ ตัวเลข         → ตัวมันเอง
 *   อาร์เรย์ / Fragment    → ต่อกันตามลำดับ
 *   องค์ประกอบ HTML ปกติ  → ข้อความของลูก ๆ
 *   คอมโพเนนต์ทุกชนิด      → ข้อความของลูก ๆ ผ่าน props.children เท่านั้น
 *
 * ⚠️ ห้ามเรียกฟังก์ชันคอมโพเนนต์เพื่อ "ดูว่ามันวาดอะไร"
 *    ฟังก์ชันนี้ทำงานระหว่าง render ของตาราง (ใน useMemo) — คอมโพเนนต์ที่ใช้ hook จะเอา hook
 *    ของมันไปผูกกับตารางแทน แล้วหน้าพังด้วย "Cannot read properties of undefined (reading 'length')"
 *    เกิดกับ next/link ที่ทุกคอลัมน์เลขที่เรื่องใช้ และรันในเทสต์ไม่เจอเพราะนอก render ไม่มี dispatcher
 *    (เคยเป็นแบบนั้นรุ่นแรก — เทสต์ผ่านแต่หน้าจริงล้ม)
 *
 *    ผลที่ตามมา: ป้ายที่เอาข้อความมาจาก props ไม่ใช่ลูก (ResultChip · StatusBadge · SlaBadge · PriorityBadge)
 *    อ่านออกเป็นข้อความว่าง คอลัมน์ที่ใช้ป้ายพวกนี้ต้องส่ง `text` เอง — ดู hasComponent ที่ตารางใช้เตือนตอนลืม
 *
 * ทำไมไม่ใช้ react-dom/server (renderToStaticMarkup): Next ห้ามนำเข้ามันในคอมโพเนนต์ฝั่งหน้าเว็บ
 * ของ app router และจะทำให้ build ล้ม
 */
export function cellText(node: React.ReactNode): string {
  return collect(node, 0).replace(/\s+/g, ' ').trim();
}

/** กันองค์ประกอบที่เรียกตัวเองวนไม่รู้จบ — ตารางจริงลึกไม่เกินสิบชั้น */
const MAX_DEPTH = 40;

function collect(node: React.ReactNode, depth: number): string {
  if (depth > MAX_DEPTH) return '';
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);

  if (Array.isArray(node)) return joinChildren(node, depth);

  if (!React.isValidElement(node)) return '';

  const element = node as React.ReactElement<
    { children?: React.ReactNode },
    React.JSXElementConstructor<unknown>
  >;
  const { props } = element;

  // HTML ปกติ · Fragment · Link · memo · คอมโพเนนต์ฟังก์ชัน — อ่านเฉพาะลูก ไม่เรียกตัวมัน
  return collect(props.children, depth + 1);
}

/**
 * ต่อข้อความของลูกหลายตัว — องค์ประกอบสองตัวติดกันคั่นด้วยช่องว่าง ข้อความล้วนต่อกันตรง ๆ
 *
 * เซลล์แบบ "รหัสบริษัท" บนบรรทัดแรก "ชื่อเต็ม" บนบรรทัดสองเป็นสอง <span> ที่ขึ้นบรรทัดใหม่ด้วย CSS
 * ถ้าต่อกันตรง ๆ จะได้ "AIDC-TECHບໍລິສັດ…" ติดกันทั้งในช่องค้นหาและไฟล์ส่งออก
 * แต่ "95.2" ตามด้วย "%" ที่เป็นข้อความ (หรือ <b>95.2</b>%) ต้องไม่ถูกแยก
 */
function joinChildren(children: React.ReactNode[], depth: number): string {
  let out = '';
  let previousWasElement = false;
  for (const child of children) {
    const text = collect(child, depth + 1);
    if (text === '') continue; // ไอคอน / false / null — ไม่นับเป็นเพื่อนบ้าน
    const isElement = React.isValidElement(child);
    if (out !== '' && isElement && previousWasElement) out += ' ';
    out += text;
    previousWasElement = isElement;
  }
  return out;
}

/**
 * เซลล์นี้มีคอมโพเนนต์ (ไม่ใช่ HTML ปกติ) อยู่ข้างในไหม — ตารางใช้เตือนนักพัฒนาตอนที่ cellText
 * อ่านได้ว่างแต่เซลล์มีป้ายอยู่ แปลว่าป้ายเอาข้อความจาก props และคอลัมน์นั้นลืมส่ง `text`
 * ไฟล์ส่งออกจะว่างเปล่าเงียบ ๆ ถ้าไม่มีอะไรบอก
 */
export function hasComponent(node: React.ReactNode, depth = 0): boolean {
  if (depth > MAX_DEPTH) return false;
  if (Array.isArray(node)) return node.some((child) => hasComponent(child, depth + 1));
  if (!React.isValidElement(node)) return false;

  const element = node as React.ReactElement<{ children?: React.ReactNode }>;
  if (typeof element.type !== 'string' && element.type !== React.Fragment) return true;
  return hasComponent(element.props.children, depth + 1);
}

/**
 * เทียบสองเซลล์สำหรับเรียงลำดับ
 *
 *   ตัวเลขล้วน ("1,234" · "95.2%" · "-3")  → เทียบเป็นตัวเลข ไม่ใช่ตัวอักษร
 *                                             ("100" ต้องมากกว่า "9" ไม่ใช่น้อยกว่า)
 *   เซลล์ว่าง / "—" / "-"                 → ไปท้ายเสมอ ไม่ว่าเรียงขึ้นหรือลง
 *                                             ไม่งั้นคอลัมน์ที่ไม่มีค่าจะลอยขึ้นบนสุดตอนเรียงจากมากไปน้อย
 *   อย่างอื่น (ข้อความ · ช่วงเวลา · วัน)    → เทียบแบบรู้จักตัวเลขในข้อความ ("ลำดับที่ 2" < "ลำดับที่ 10")
 *
 * ตัวเลขที่มีหน่วยปน ("3 ມື້ 14 ຊມ.") ไม่ถือเป็นตัวเลขล้วน — เทียบเป็นข้อความรู้ตัวเลข ซึ่งเรียง
 * ตามตัวเลขแรกก่อน ถูกพอสำหรับช่วงเวลาที่หน่วยเรียงจากใหญ่ไปเล็ก ส่วนคอลัมน์ที่ต้องแม่นกว่านั้น
 * ให้ส่ง sortValue เข้ามา
 */
const collator = new Intl.Collator('lo', { numeric: true, sensitivity: 'base' });

const EMPTY = /^(—|–|-|n\/a|ບໍ່ມີ)?$/i;
const PLAIN_NUMBER = /^[+-]?\d[\d,]*(?:\.\d+)?%?$|^[+-]?\.\d+%?$/;

export function parseNumber(text: string): number | null {
  const t = text.trim();
  if (!PLAIN_NUMBER.test(t)) return null;
  const value = Number(t.replace(/,/g, '').replace(/%$/, ''));
  return Number.isFinite(value) ? value : null;
}

export function compareCells(
  a: string | number | null,
  b: string | number | null,
  direction: 'asc' | 'desc',
): number {
  const sign = direction === 'asc' ? 1 : -1;

  const aText = a === null ? '' : String(a).trim();
  const bText = b === null ? '' : String(b).trim();
  const aEmpty = EMPTY.test(aText);
  const bEmpty = EMPTY.test(bText);

  // ว่างไปท้ายเสมอ — จึงต้องไม่คูณ sign กับผลของเคสนี้
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const aNum = typeof a === 'number' ? a : parseNumber(aText);
  const bNum = typeof b === 'number' ? b : parseNumber(bText);
  if (aNum !== null && bNum !== null) return (aNum - bNum) * sign;

  return collator.compare(aText, bText) * sign;
}
