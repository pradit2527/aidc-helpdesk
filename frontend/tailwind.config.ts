import type { Config } from 'tailwindcss';

/**
 * Design token ตาม ADR-003 (แนวทาง B) และ 21-ui-ux-design.md §4
 *
 * ทุกสีชี้ไปที่ CSS variable ใน globals.css เพื่อให้
 *   1. เพิ่มโหมดมืดในเฟส 2 ได้โดยไม่ต้องแตะ component แม้แต่ตัวเดียว
 *   2. สลับชุดสีทั้งระบบได้จากไฟล์เดียว
 *
 * ค่า contrast ทุกคู่ตรวจด้วยสูตร WCAG 2.1 relative luminance แล้ว (ดู scripts/check-contrast.py)
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── พื้นผิว ──
        page: 'var(--bg-page)',
        surface: 'var(--bg-surface)',
        subtle: 'var(--bg-subtle)',

        // ── ตัวอักษร ──
        ink: 'var(--text-primary)',
        'ink-2': 'var(--text-secondary)',
        'ink-3': 'var(--text-muted)',
        'ink-inverse': 'var(--text-inverse)',

        // ── เส้นขอบ ──
        // hair = ตกแต่งเท่านั้น · control = ขอบ input ต้องผ่าน 3:1 (WCAG 1.4.11)
        hair: 'var(--border)',
        control: 'var(--border-control)',

        // ── แบรนด์ ──
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
          subtle: 'var(--primary-subtle)',
        },

        // ── ระดับความสำคัญ P1–P4 ──
        p1: { fg: 'var(--p1-fg)', bg: 'var(--p1-bg)', solid: 'var(--p1-solid)' },
        p2: { fg: 'var(--p2-fg)', bg: 'var(--p2-bg)', solid: 'var(--p2-solid)' },
        p3: { fg: 'var(--p3-fg)', bg: 'var(--p3-bg)', solid: 'var(--p3-solid)' },
        p4: { fg: 'var(--p4-fg)', bg: 'var(--p4-bg)', solid: 'var(--p4-solid)' },

        // ── สถานะเรื่อง 7 ค่า ──
        'st-new': { fg: 'var(--st-new-fg)', bg: 'var(--st-new-bg)' },
        'st-assigned': { fg: 'var(--st-assigned-fg)', bg: 'var(--st-assigned-bg)' },
        'st-progress': { fg: 'var(--st-progress-fg)', bg: 'var(--st-progress-bg)' },
        'st-pending': { fg: 'var(--st-pending-fg)', bg: 'var(--st-pending-bg)' },
        'st-resolved': { fg: 'var(--st-resolved-fg)', bg: 'var(--st-resolved-bg)' },
        'st-closed': { fg: 'var(--st-closed-fg)', bg: 'var(--st-closed-bg)' },
        'st-cancelled': { fg: 'var(--st-cancelled-fg)', bg: 'var(--st-cancelled-bg)' },

        // ── สถานะ SLA 4 ค่า ──
        sla: {
          ok: 'var(--sla-ok-fg)',
          'ok-bg': 'var(--sla-ok-bg)',
          risk: 'var(--sla-risk-fg)',
          'risk-bg': 'var(--sla-risk-bg)',
          breach: 'var(--sla-breach-fg)',
          'breach-bg': 'var(--sla-breach-bg)',
          'breach-solid': 'var(--sla-breach-solid)',
          paused: 'var(--sla-paused-fg)',
          'paused-bg': 'var(--sla-paused-bg)',
        },

        // ── ซีรีส์กราฟ (แยกกันได้เมื่อจำลองภาวะตาบอดสี deuteranopia) ──
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
          5: 'var(--chart-5)',
          6: 'var(--chart-6)',
        },
      },

      fontFamily: {
        // ฟอนต์เดียวทั้งระบบ ตรงกับที่ backend ใช้สร้าง PDF (ADR-003)
        sans: ['var(--font-noto-thai)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Cascadia Code', 'monospace'],
      },

      fontSize: {
        // ภาษาไทยต้องการ line-height สูงกว่าอังกฤษ เพราะสระบน/ล่างซ้อนได้ 2 ชั้น
        // เล็กสุดที่ใช้ได้ = 13px · input ต้อง >= 16px เสมอ (กัน iOS ซูมเอง)
        caption: ['0.8125rem', { lineHeight: '1.3rem' }], //  13 / 21
        'body-sm': ['0.875rem', { lineHeight: '1.5rem' }], //  14 / 24
        label: ['0.875rem', { lineHeight: '1.3125rem', fontWeight: '600' }],
        body: ['1rem', { lineHeight: '1.75rem' }], //          16 / 28
        h3: ['1.125rem', { lineHeight: '1.8125rem', fontWeight: '600' }],
        h2: ['1.25rem', { lineHeight: '2rem', fontWeight: '600' }],
        h1: ['1.5rem', { lineHeight: '2.25rem', fontWeight: '700' }],
        display: ['1.875rem', { lineHeight: '2.625rem', fontWeight: '700' }],
      },

      borderRadius: {
        sm: '4px', //  badge, tag
        DEFAULT: '8px', // ค่าเริ่มต้น — ปุ่ม, input, การ์ด
        lg: '12px', // dialog, sheet, popover
      },

      boxShadow: {
        // เงาโทนน้ำเงินอมเทา ไม่ใช่ดำล้วน — สะอาดกว่าบนพื้น #F8FAFC
        card: '0 1px 2px rgb(15 23 42 / 0.06), 0 1px 3px rgb(15 23 42 / 0.10)',
        pop: '0 4px 6px -1px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.06)',
        dialog: '0 10px 15px -3px rgb(15 23 42 / 0.10), 0 4px 6px -4px rgb(15 23 42 / 0.08)',
        sticky: '0 -2px 8px rgb(15 23 42 / 0.08)',
      },

      spacing: {
        // เป้าแตะขั้นต่ำสำหรับมือที่ใส่ถุงมือหรือเปื้อนที่ไซต์งาน (กฎ M-1)
        tap: '2.75rem', // 44px
      },
    },
  },
  plugins: [],
};

export default config;
