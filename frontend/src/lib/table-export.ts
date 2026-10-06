/**
 * ส่งออกข้อมูลตารางรายงาน — ข้อความคัดลอก · CSV · Excel (.xlsx จริง) · พิมพ์
 *
 * ทุกตัวรับข้อมูลชุดเดียวกัน: หัวคอลัมน์ + แถวที่เป็นข้อความล้วน ผู้เรียกเป็นคนตัดสินว่าแถวไหนเข้าไฟล์
 * (ตารางส่งแถวที่ "ผ่านการค้นหาแล้ว ทุกหน้า" ไม่ใช่เฉพาะหน้าที่เห็นอยู่ — ไฟล์ที่ส่งออกต้องครบ)
 */

export type Cells = readonly string[];

// ── CSV / ข้อความคัดลอก ───────────────────────────────────────────────────

/**
 * ครอบค่าตามกติกา RFC 4180 และกัน CSV injection
 *
 * ค่าที่ขึ้นต้นด้วย = + - @ ถูก Excel ตีความเป็นสูตร (เช่น =HYPERLINK(...)) ข้อมูลในรายงานมาจาก
 * ชื่อและหัวข้อที่ผู้ใช้พิมพ์เอง จึงต้องถือว่าควบคุมเนื้อหาไม่ได้ — เติม ' นำหน้าให้เป็นข้อความ
 * ตัวเลขติดลบ (-5) ต้องไม่ถูกกระทบ จึงยกเว้นค่าที่เป็นตัวเลขล้วน
 */
function csvCell(value: string): string {
  const looksNumeric = /^[+-]?\d[\d,]*(?:\.\d+)?%?$/.test(value.trim());
  const safe = !looksNumeric && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * BOM + CRLF — สองอย่างนี้ต้องมาคู่กัน Excel บนวินโดวส์ไทย/ลาวเดาการเข้ารหัสจากโค้ดเพจของเครื่อง
 * ไม่ได้เดาเป็น UTF-8 ไฟล์ที่ถูกต้องทุกไบต์จึงเปิดมาเป็นตัวต่างดาว แล้วผู้ใช้สรุปว่ารายงานเสีย
 */
export function toCsv(header: Cells, rows: readonly Cells[]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** ข้อความแบบคั่นด้วยแท็บ — วางลง Excel / Google Sheets แล้วแยกคอลัมน์ให้เอง */
export function toTsv(header: Cells, rows: readonly Cells[]): string {
  // แท็บและขึ้นบรรทัดใหม่ในค่าจะทำให้คอลัมน์เลื่อน จึงแทนด้วยช่องว่าง
  const clean = (v: string) => v.replace(/[\t\r\n]+/g, ' ');
  return [header, ...rows].map((r) => r.map(clean).join('\t')).join('\n');
}

// ── Excel (.xlsx) ──────────────────────────────────────────────────────────
//
// เขียนเองโดยไม่พึ่งไลบรารี: ไฟล์ .xlsx คือ zip ของไฟล์ XML ไม่กี่ไฟล์ และไลบรารีสร้าง Excel ที่นิยม
// มีขนาดหลายร้อย KB ซึ่งต้องโหลดลงเบราว์เซอร์ทุกหน้ารายงาน เพื่อฟีเจอร์ที่กดไม่กี่ครั้งต่อวัน
// zip ใช้วิธี STORE (ไม่บีบอัด) — ไฟล์รายงานมีหลักร้อยแถว ไม่คุ้มกับความซับซ้อนของ deflate

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) crc = (CRC_TABLE[(crc ^ (data[i] as number)) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** สร้างไฟล์ zip แบบ STORE — คืนไบต์ทั้งไฟล์ */
export function zipStore(entries: readonly ZipEntry[], now: Date = new Date()): Uint8Array {
  // เวลาและวันที่แบบ MS-DOS (Excel ไม่ใช้ แต่ฟิลด์ต้องมีและถูกช่วง)
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // bit 11 = ชื่อไฟล์เป็น UTF-8
    local.setUint16(8, 0, true); // method 0 = STORE
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, entry.data.length, true);
    local.setUint32(22, entry.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);

    chunks.push(new Uint8Array(local.buffer), name, entry.data);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true); // version made by
    dir.setUint16(6, 20, true); // version needed
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true);
    dir.setUint16(12, dosTime, true);
    dir.setUint16(14, dosDate, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, entry.data.length, true);
    dir.setUint32(24, entry.data.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true); // ตำแหน่งของ local header
    central.push(new Uint8Array(dir.buffer), name);

    offset += 30 + name.length + entry.data.length;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of all) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** ตัวอักษรควบคุมที่ XML 1.0 ห้ามมี — ใส่ลงไปแล้ว Excel จะปฏิเสธเปิดทั้งไฟล์ ว่า "ไฟล์เสีย" */
const XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

function xml(text: string): string {
  return text
    .replace(XML_ILLEGAL, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** ชื่อคอลัมน์แบบ Excel: 0→A · 25→Z · 26→AA */
export function columnLetter(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * ชื่อแผ่นงานของ Excel: ไม่เกิน 31 ตัวอักษร และห้ามมี \ / ? * [ ] : — ผิดข้อใดข้อหนึ่ง
 * Excel จะบอกว่าไฟล์เสียแล้วซ่อมโดยลบแผ่นงานทิ้ง
 */
export function sheetName(title: string): string {
  const cleaned = title.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31);
  return cleaned || 'Report';
}

const PLAIN_NUMBER = /^[+-]?\d[\d,]*(?:\.\d+)?$|^[+-]?\.\d+$/;

function cellXml(ref: string, value: string, header: boolean): string {
  if (!header && PLAIN_NUMBER.test(value.trim())) {
    const n = Number(value.trim().replace(/,/g, ''));
    // ตัวเลขที่ยาวเกินความแม่นของ double (เช่นรหัส 16 หลัก) ต้องเก็บเป็นข้อความ ไม่งั้นเลขท้ายเพี้ยน
    if (Number.isFinite(n) && Number.isSafeInteger(Math.trunc(n)) && value.replace(/\D/g, '').length <= 15) {
      return `<c r="${ref}"><v>${n}</v></c>`;
    }
  }
  const style = header ? ' s="1"' : '';
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

/** สร้างไฟล์ .xlsx หนึ่งแผ่นงาน: หัวตัวหนา แช่แข็งแถวหัว ความกว้างคอลัมน์ตามเนื้อหา */
export function toXlsx(title: string, header: Cells, rows: readonly Cells[], now: Date = new Date()): Uint8Array {
  const widths = header.map((h, c) => {
    const longest = Math.max(h.length, ...rows.map((r) => (r[c] ?? '').length));
    // ภาษาลาวกว้างกว่าอักษรละตินต่อตัว จึงเผื่อ แต่ไม่เกิน 60 กันคอลัมน์ข้อความยาวกินทั้งหน้า
    return Math.min(60, Math.max(8, Math.ceil(longest * 1.2) + 2));
  });

  const sheetRows = [header, ...rows]
    .map((cells, r) => {
      const rowNumber = r + 1;
      const inner = cells.map((value, c) => cellXml(`${columnLetter(c)}${rowNumber}`, value, r === 0)).join('');
      return `<row r="${rowNumber}">${inner}</row>`;
    })
    .join('');

  const header1 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

  const sheet =
    `${header1}<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0">` +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${sheetRows}</sheetData></worksheet>`;

  const styles =
    `${header1}<styleSheet xmlns="${ns}">` +
    '<fonts count="2"><font><sz val="11"/><name val="Leelawadee UI"/></font>' +
    '<font><b/><sz val="11"/><name val="Leelawadee UI"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  const workbook =
    `${header1}<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${xml(sheetName(title))}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const relNs = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const relType = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  const files: ZipEntry[] = [
    {
      name: '[Content_Types].xml',
      data: encoder.encode(
        `${header1}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
          '</Types>',
      ),
    },
    {
      name: '_rels/.rels',
      data: encoder.encode(
        `${header1}<Relationships xmlns="${relNs}"><Relationship Id="rId1" Type="${relType}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    },
    { name: 'xl/workbook.xml', data: encoder.encode(workbook) },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: encoder.encode(
        `${header1}<Relationships xmlns="${relNs}">` +
          `<Relationship Id="rId1" Type="${relType}/worksheet" Target="worksheets/sheet1.xml"/>` +
          `<Relationship Id="rId2" Type="${relType}/styles" Target="styles.xml"/></Relationships>`,
      ),
    },
    { name: 'xl/styles.xml', data: encoder.encode(styles) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheet) },
  ];

  return zipStore(files, now);
}

// ── ดาวน์โหลด / พิมพ์ (ใช้ DOM จึงไม่มีในเทสต์) ────────────────────────────

/** ชื่อไฟล์ที่ปลอดภัยบนวินโดวส์ — ตัดอักขระต้องห้าม คงภาษาลาวไว้ */
export function fileSafeName(title: string, now: Date = new Date()): string {
  const day = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('');
  const base = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return `${base || 'report'}-${day}`;
}

export function downloadBytes(data: BlobPart, mime: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // ปล่อยหน่วยความจำคืน — ไม่งั้นไฟล์ค้างอยู่ในแท็บจนกว่าจะปิด
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * พิมพ์ตารางเดียว (ทุกแถวที่ผ่านการค้นหา ไม่ใช่เฉพาะหน้าที่เห็น) ผ่าน iframe ที่ซ่อนไว้
 *
 * ไม่เปิดหน้าต่างใหม่ — ตัวบล็อกป๊อปอัปของเบราว์เซอร์มักทำให้ปุ่มพิมพ์ "ไม่เกิดอะไรขึ้น"
 * ก๊อปสไตล์ของหน้าจริงเข้าไป เพื่อให้ฟอนต์ลาวตรงกับที่เห็นบนจอ (หน้า about:blank ไม่มีฟอนต์ของเรา)
 */
export function printTable(title: string, header: Cells, rows: readonly Cells[]): void {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const head = header.map((h) => `<th>${esc(h)}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');

  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML).join('');
  const printed = new Date().toLocaleString('lo-LA');

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) {
    frame.remove();
    return;
  }

  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>${styles}` +
      '<style>body{background:#fff;color:#000;margin:16px;font-family:var(--font-noto-lao),"Leelawadee UI",sans-serif}' +
      'h1{font-size:16px;margin:0 0 4px}p{font-size:11px;margin:0 0 12px;color:#444}' +
      'table{width:100%;border-collapse:collapse;font-size:11px}' +
      'th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}' +
      'th{background:#eee}tr:nth-child(even) td{background:#f7f7f7}' +
      '@page{size:A4 landscape;margin:12mm}</style></head>' +
      `<body><h1>${esc(title)}</h1><p>${esc(printed)} · ${rows.length} ແຖວ</p>` +
      `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`,
  );
  doc.close();

  const win = frame.contentWindow;
  const run = () => {
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), 1500);
  };
  // รอสไตล์/ฟอนต์โหลดก่อนพิมพ์ ไม่งั้นได้กระดาษที่ฟอนต์ยังไม่มา
  if (doc.readyState === 'complete') setTimeout(run, 300);
  else frame.onload = () => setTimeout(run, 300);
}
