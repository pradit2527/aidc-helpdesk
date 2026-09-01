'use client';

import { Languages, Moon, Sun } from 'lucide-react';
import * as React from 'react';

import { translate, type Locale, type MessageKey } from '@/config/i18n';
import { cn } from '@/lib/cn';
import { usePreferences } from '@/lib/preferences';

/** เรียกใช้คำแปลตามภาษาที่ผู้ใช้เลือกอยู่ */
export function useT(): (key: MessageKey) => string {
  const { locale } = usePreferences();
  return React.useCallback((key: MessageKey) => translate(key, locale), [locale]);
}

/**
 * ปุ่มสลับธีมและภาษา
 *
 * ทำเป็นปุ่มสองสถานะ ไม่ใช่ dropdown เพราะมีตัวเลือกฝั่งละสองอย่าง
 * dropdown จะกินสองคลิกเพื่อทำสิ่งที่คลิกเดียวจบได้
 *
 * ทั้งคู่ใช้ aria-pressed ให้โปรแกรมอ่านหน้าจอรู้ว่านี่คือสวิตช์ที่มีสถานะ
 * ไม่ใช่ปุ่มที่กดแล้วไปหน้าอื่น
 */
export function PreferenceControls({
  tone = 'dark',
  className,
}: {
  /** dark = วางบนแถบเมนูพื้นเข้ม · light = วางบนพื้นสว่าง */
  tone?: 'light' | 'dark';
  className?: string | undefined;
}): React.JSX.Element {
  const { theme, locale, setTheme, setLocale } = usePreferences();
  const t = useT();
  const onDark = tone === 'dark';

  const groupClass = cn(
    'flex items-center gap-0.5 rounded p-0.5',
    onDark ? 'bg-white/[0.08]' : 'bg-subtle',
  );

  const itemClass = (active: boolean): string =>
    cn(
      'inline-flex min-h-[34px] flex-1 items-center justify-center gap-1.5 rounded px-2 text-caption font-semibold transition-colors',
      active
        ? onDark
          ? 'bg-white/[0.16] text-[color:var(--side-ink)]'
          : 'bg-surface text-ink shadow-card'
        : onDark
          ? 'text-[color:var(--side-ink-3)] hover:text-[color:var(--side-ink-2)]'
          : 'text-ink-3 hover:text-ink-2',
    );

  const labelClass = cn(
    'mb-1 block text-caption',
    onDark ? 'text-[color:var(--side-ink-3)]' : 'text-ink-3',
  );

  return (
    <div className={cn('space-y-3', className)}>
      <div>
        <span className={labelClass}>{t('pref.appearance')}</span>
        <div className={groupClass} role="group" aria-label={t('pref.appearance')}>
          <button
            type="button"
            aria-pressed={theme === 'light'}
            onClick={() => setTheme('light')}
            className={itemClass(theme === 'light')}
          >
            <Sun className="h-4 w-4 flex-none" aria-hidden="true" />
            {t('pref.themeLight')}
          </button>
          <button
            type="button"
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme('dark')}
            className={itemClass(theme === 'dark')}
          >
            <Moon className="h-4 w-4 flex-none" aria-hidden="true" />
            {t('pref.themeDark')}
          </button>
        </div>
      </div>

      <div>
        <span className={labelClass}>{t('pref.language')}</span>
        <div className={groupClass} role="group" aria-label={t('pref.language')}>
          {(['lo', 'th'] as Locale[]).map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={locale === code}
              onClick={() => setLocale(code)}
              className={itemClass(locale === code)}
            >
              <Languages className="h-4 w-4 flex-none" aria-hidden="true" />
              {code === 'lo' ? t('pref.langLao') : t('pref.langThai')}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * รุ่นย่อสำหรับแถบบน — ปุ่มธีมกับปุ่มภาษาอย่างละหนึ่งปุ่ม สลับไปมา
 * ใช้บนมือถือที่ไม่มีที่ให้วางกลุ่มปุ่มเต็ม
 */
export function PreferenceButtons({ className }: { className?: string }): React.JSX.Element {
  const { theme, locale, setTheme, setLocale } = usePreferences();
  const t = useT();

  const btn =
    'grid h-tap w-tap flex-none place-items-center rounded text-ink-2 hover:bg-subtle hover:text-ink';

  return (
    <div className={cn('flex items-center', className)}>
      <button
        type="button"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className={btn}
        // บอกว่าจะได้อะไรเมื่อกด ไม่ใช่บอกว่าตอนนี้เป็นอะไร
        aria-label={theme === 'dark' ? t('pref.themeLight') : t('pref.themeDark')}
      >
        {theme === 'dark' ? (
          <Sun className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Moon className="h-5 w-5" aria-hidden="true" />
        )}
      </button>

      <button
        type="button"
        onClick={() => setLocale(locale === 'lo' ? 'th' : 'lo')}
        className={cn(btn, 'text-body-sm font-bold')}
        aria-label={locale === 'lo' ? t('pref.langThai') : t('pref.langLao')}
      >
        {locale === 'lo' ? 'ລາວ' : 'ไทย'}
      </button>
    </div>
  );
}
