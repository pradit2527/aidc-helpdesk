/**
 * ตรวจอัตราคอนทราสต์ของ design token ทุกคู่ที่สำคัญ (WCAG 2.1)
 *
 *   node scripts/check-contrast.mjs
 *
 * หัวไฟล์ globals.css อ้างถึงสคริปต์ตรวจคอนทราสต์มาตลอด แต่ไม่เคยมีไฟล์นั้นอยู่จริง
 * ตัวเลขที่เขียนกำกับไว้ข้าง ๆ token จึงไม่มีอะไรยืนยัน — พอเปลี่ยนสีทีหนึ่ง
 * ก็ไม่มีทางรู้ว่าคู่ไหนตกเกณฑ์ไปแล้วบ้าง นอกจากเปิดดูด้วยตา ซึ่งจับไม่ได้
 *
 * อ่านค่าจาก globals.css โดยตรง ไม่ประกาศสีซ้ำในนี้ — สีที่เขียนไว้สองที่
 * จะเพี้ยนออกจากกันเสมอ แล้วสคริปต์จะกลายเป็นตัวยืนยันสิ่งที่ไม่ได้ใช้จริง
 */

import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');

/** ดึงบล็อกที่เริ่มจาก selector ที่ระบุ ไปจนถึงวงเล็บปิดตัวแรกที่ระดับเดียวกัน */
function block(startRe) {
  const m = startRe.exec(css);
  if (!m) throw new Error(`หาบล็อก ${startRe} ไม่เจอ`);
  const from = css.indexOf('{', m.index) + 1;
  let depth = 1;
  let i = from;
  while (depth > 0 && i < css.length) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    i++;
  }
  return css.slice(from, i - 1);
}

function tokens(text) {
  const out = {};
  for (const m of text.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

const light = tokens(block(/^:root\s*\{/m));
const dark = tokens(block(/\[data-theme=['"]dark['"]\]\s*\{/));

function toLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/*
 * คู่ที่ต้องตรวจ พร้อมเกณฑ์ขั้นต่ำ
 *   4.5 = ตัวอักษรขนาดปกติ (AA)
 *   3.0 = ขอบของช่องกรอกและองค์ประกอบที่ไม่ใช่ตัวอักษร (WCAG 1.4.11)
 */
const PAIRS = [
  ['ตัวอักษรหลักบนการ์ด', '--text-primary', '--bg-surface', 4.5],
  ['ตัวอักษรหลักบนพื้นหน้า', '--text-primary', '--bg-page', 4.5],
  ['ตัวอักษรรองบนการ์ด', '--text-secondary', '--bg-surface', 4.5],
  ['ตัวอักษรจางบนการ์ด', '--text-muted', '--bg-surface', 4.5],
  ['ตัวอักษรจางบนพื้นรอง', '--text-muted', '--bg-subtle', 4.5],
  ['ตัวอักษรบนปุ่มหลัก', '--on-accent', '--primary', 4.5],
  ['ตัวอักษรบนปุ่มหลักตอนชี้', '--on-accent', '--primary-hover', 4.5],
  ['ตัวอักษรบนพื้นเน้นอ่อน', '--primary-subtle-ink', '--primary-subtle', 4.5],
  ['ขอบช่องกรอกบนการ์ด', '--border-control', '--bg-surface', 3.0],
  ['ขอบช่องกรอกบนพื้นหน้า', '--border-control', '--bg-page', 3.0],
  ['วงโฟกัสบนการ์ด', '--focus-ring', '--bg-surface', 3.0],
  ['พื้นสีเน้นบนการ์ด', '--accent-fill', '--bg-surface', 3.0],
];

let failed = 0;
for (const [themeName, t] of [['สว่าง', light], ['มืด', dark]]) {
  console.log(`\nโหมด${themeName}`);
  for (const [label, fg, bg, min] of PAIRS) {
    if (!t[fg] || !t[bg]) {
      console.log(`  ?  ${label.padEnd(26)} ไม่พบ token ${!t[fg] ? fg : bg}`);
      continue;
    }
    const r = ratio(t[fg], t[bg]);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(
      `  ${ok ? '✓' : '✗'}  ${label.padEnd(26)} ${r.toFixed(2).padStart(6)}:1  ` +
        `(ต้องไม่ต่ำกว่า ${min.toFixed(1)})  ${t[fg]} บน ${t[bg]}`,
    );
  }
}

console.log(failed === 0 ? '\nผ่านทุกคู่\n' : `\nตกเกณฑ์ ${failed} คู่\n`);
process.exitCode = failed === 0 ? 0 : 1;
