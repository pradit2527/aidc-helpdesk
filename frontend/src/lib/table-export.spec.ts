import { crc32 as nodeCrc32, inflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { columnLetter, crc32, fileSafeName, sheetName, toCsv, toTsv, toXlsx, zipStore } from './table-export';

const header = ['ບໍລິສັດ', 'ສ້າງ', 'ເສັດ', '% ທັນເວລາ'];
const rows = [
  ['AIDC-TECH', '17', '15', '95.2%'],
  ['AIDC-HQ', '1,204', '9', '—'],
];

describe('toCsv', () => {
  it('ขึ้นต้นด้วย BOM และใช้ CRLF — Excel บนวินโดวส์ลาว/ไทยจึงอ่านเป็น UTF-8', () => {
    const csv = toCsv(header, rows);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(4); // หัว + 2 แถว + บรรทัดว่างท้ายไฟล์
  });

  it('ค่าที่มีจุลภาค อัญประกาศ หรือขึ้นบรรทัดใหม่ ถูกครอบตาม RFC 4180', () => {
    const csv = toCsv(['a'], [['x, y'], ['say "hi"'], ['line1\nline2']]);
    expect(csv).toContain('"x, y"');
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"line1\nline2"');
  });

  it('⚠️ ค่าที่ขึ้นต้นด้วย = + - @ ถูกกันไม่ให้ Excel รันเป็นสูตร', () => {
    const csv = toCsv(['a'], [['=HYPERLINK("http://evil","x")'], ['@SUM(A1)'], ['+cmd']]);
    expect(csv).toContain(`"'=HYPERLINK`);
    expect(csv).toContain(`'@SUM(A1)`);
    expect(csv).toContain(`'+cmd`);
  });

  it('ตัวเลขติดลบและเปอร์เซ็นต์ไม่ถูกกระทบ', () => {
    const csv = toCsv(['a'], [['-5'], ['-3.5%'], ['+7']]);
    expect(csv).toContain('\r\n-5\r\n');
    expect(csv).toContain('-3.5%');
    expect(csv).not.toContain("'-5");
    expect(csv).not.toContain("'+7");
  });
});

describe('toTsv', () => {
  it('คั่นด้วยแท็บ และแท็บหรือขึ้นบรรทัดในค่าถูกแทนด้วยช่องว่าง (ไม่งั้นคอลัมน์เลื่อน)', () => {
    expect(toTsv(['a', 'b'], [['x\ty', 'p\nq']])).toBe('a\tb\nx y\tp q');
  });
});

describe('columnLetter / sheetName / fileSafeName', () => {
  it.each([
    [0, 'A'],
    [25, 'Z'],
    [26, 'AA'],
    [27, 'AB'],
    [701, 'ZZ'],
    [702, 'AAA'],
  ])('คอลัมน์ %s → %s', (index, letter) => {
    expect(columnLetter(index)).toBe(letter);
  });

  it('⚠️ ชื่อแผ่นงานไม่เกิน 31 ตัว และไม่มีอักขระต้องห้าม (ผิดแล้ว Excel บอกว่าไฟล์เสีย)', () => {
    const name = sheetName('SLA/ແຍກ:ຕາມ?ບໍລິສັດ [ປະຈຳເດືອນ] ກັນຍາ 2569 ສະບັບສົມບູນທັງໝົດ');
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[\\/?*[\]:]/);
  });

  it('ชื่อว่างหลังล้าง → ใช้ค่าสำรอง', () => {
    expect(sheetName('///')).toBe('Report');
  });

  it('ชื่อไฟล์ตัดอักขระต้องห้ามของวินโดวส์ คงภาษาลาว และต่อวันที่', () => {
    expect(fileSafeName('SLA: ແຍກ/ບໍລິສັດ?', new Date(2026, 9, 5))).toBe('SLA-ແຍກ-ບໍລິສັດ-20261005');
    expect(fileSafeName('///', new Date(2026, 9, 5))).toBe('report-20261005');
  });
});

/**
 * ตรวจว่า XML ซ้อนแท็กถูกต้องด้วย stack — แท็กปิดต้องตรงกับแท็กเปิดล่าสุดที่ยังไม่ปิด
 * (ค่าแอตทริบิวต์มี / ได้ เช่น xmlns="http://…" จึงตัดค่าในอัญประกาศออกก่อนแล้วค่อยแยกแท็ก)
 */
function wellFormed(xmlText: string): boolean {
  const body = xmlText.replace(/<\?[\s\S]*?\?>/g, '').replace(/"[^"]*"/g, '""');
  const stack: string[] = [];
  for (const m of body.matchAll(/<(\/?)([A-Za-z][\w:.-]*)[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClosing] = m;
    if (selfClosing) continue;
    if (!closing) {
      stack.push(name as string);
      continue;
    }
    if (stack.pop() !== name) return false;
  }
  return stack.length === 0;
}

/** อ่านไฟล์ zip กลับมา — ตรวจโครงสร้างเองแทนการเชื่อว่าตัวเขียนถูก */
function readZip(bytes: Uint8Array): Map<string, { data: Buffer; crcOk: boolean }> {
  const buf = Buffer.from(bytes);
  const eocd = buf.length - 22;
  expect(buf.readUInt32LE(eocd)).toBe(0x06054b50);

  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, { data: Buffer; crcOk: boolean }>();

  for (let i = 0; i < count; i += 1) {
    expect(buf.readUInt32LE(at)).toBe(0x02014b50);
    const method = buf.readUInt16LE(at + 10);
    const crc = buf.readUInt32LE(at + 16);
    const size = buf.readUInt32LE(at + 24);
    const nameLen = buf.readUInt16LE(at + 28);
    const localAt = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLen).toString('utf8');

    expect(buf.readUInt32LE(localAt)).toBe(0x04034b50);
    const localName = buf.readUInt16LE(localAt + 26);
    const start = localAt + 30 + localName;
    const raw = buf.subarray(start, start + size);
    const data = method === 8 ? inflateRawSync(raw) : raw;

    out.set(name, { data, crcOk: nodeCrc32(data) === crc });
    at += 46 + nameLen;
  }
  return out;
}

describe('crc32 / zipStore', () => {
  it('ตรงกับ crc32 ของ Node (ค่าอ้างอิงมาตรฐาน)', () => {
    const sample = new TextEncoder().encode('The quick brown fox jumps over the lazy dog');
    expect(crc32(sample)).toBe(nodeCrc32(sample));
    expect(crc32(sample)).toBe(0x414fa339);
  });

  it('zip ที่เขียนอ่านกลับได้ครบ และ CRC ของทุกไฟล์ถูก', () => {
    const zip = zipStore([
      { name: 'a.txt', data: new TextEncoder().encode('hello') },
      { name: 'ໄຟລ໌.txt', data: new TextEncoder().encode('ສະບາຍດີ') },
    ]);
    const files = readZip(zip);
    expect([...files.keys()]).toEqual(['a.txt', 'ໄຟລ໌.txt']);
    expect(files.get('a.txt')?.data.toString()).toBe('hello');
    expect(files.get('ໄຟລ໌.txt')?.data.toString()).toBe('ສະບາຍດີ');
    for (const f of files.values()) expect(f.crcOk).toBe(true);
  });
});

describe('toXlsx', () => {
  const xlsx = toXlsx('SLA ແຍກຕາມບໍລິສັດ', header, rows);
  const files = readZip(xlsx);
  const text = (name: string) => files.get(name)?.data.toString('utf8') ?? '';

  it('มีครบทุกส่วนที่ Excel ต้องการ และทุกไฟล์ CRC ถูก', () => {
    for (const required of [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
    ]) {
      expect(files.has(required), required).toBe(true);
    }
    for (const [name, f] of files) expect(f.crcOk, name).toBe(true);
  });

  it('ทุกไฟล์ XML ถูกรูปแบบ — แท็กเปิด/ปิดซ้อนกันถูกต้อง ไม่มีแท็กค้าง', () => {
    for (const [name, f] of files) {
      const body = f.data.toString('utf8');
      expect(body.startsWith('<?xml'), name).toBe(true);
      expect(wellFormed(body), name).toBe(true);
    }
  });

  it('ตัวเลขล้วนเป็นเซลล์ตัวเลข (รวมได้ใน Excel) ส่วนข้อความเป็นข้อความ', () => {
    const sheet = text('xl/worksheets/sheet1.xml');
    expect(sheet).toContain('<c r="B2"><v>17</v></c>');
    expect(sheet).toContain('<c r="B3"><v>1204</v></c>'); // "1,204" → 1204
    expect(sheet).toMatch(/<c r="A2" t="inlineStr"><is><t xml:space="preserve">AIDC-TECH<\/t><\/is><\/c>/);
    // เปอร์เซ็นต์คงเป็นข้อความ เพื่อไม่ให้หน่วยหาย
    expect(sheet).toMatch(/<c r="D2" t="inlineStr"><is><t xml:space="preserve">95\.2%<\/t>/);
  });

  it('หัวตารางเป็นตัวหนา (style 1) และแช่แข็งแถวแรก', () => {
    const sheet = text('xl/worksheets/sheet1.xml');
    expect(sheet).toMatch(/<c r="A1" t="inlineStr" s="1">/);
    expect(sheet).toContain('state="frozen"');
  });

  it('⚠️ ตัวอักษรที่ XML ห้ามมีถูกตัดทิ้ง และ & < > " ถูกหลบ — ไม่งั้น Excel ปฏิเสธเปิดทั้งไฟล์', () => {
    const tricky = readZip(toXlsx('t', ['a'], [['A & B <c> "d"\u0001\u0008x']]));
    const sheet = tricky.get('xl/worksheets/sheet1.xml')?.data.toString('utf8') ?? '';
    expect(sheet).toContain('A &amp; B &lt;c&gt; &quot;d&quot;x');
    expect(sheet).not.toMatch(/[\u0000-\u0008]/);
  });

  it('⚠️ เลข 16 หลักขึ้นไป (เช่นรหัสบัตร) เก็บเป็นข้อความ — เป็นตัวเลขแล้วเลขท้ายจะเพี้ยน', () => {
    const long = readZip(toXlsx('t', ['id'], [['1234567890123456']]));
    const sheet = long.get('xl/worksheets/sheet1.xml')?.data.toString('utf8') ?? '';
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).toContain('1234567890123456');
  });

  it('ชื่อแผ่นงานอยู่ใน workbook.xml', () => {
    expect(text('xl/workbook.xml')).toContain('name="SLA ແຍກຕາມບໍລິສັດ"');
  });

  it('ไฟล์เริ่มด้วยลายเซ็น zip (PK) ที่ Excel ใช้ตรวจชนิดไฟล์', () => {
    expect([xlsx[0], xlsx[1]]).toEqual([0x50, 0x4b]);
  });
});
