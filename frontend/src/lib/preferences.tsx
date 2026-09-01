'use client';

import * as React from 'react';

/**
 * ค่าตั้งส่วนตัวที่เก็บไว้ในเครื่องผู้ใช้ — ธีมและภาษา
 *
 * เก็บใน localStorage ไม่ใช่ฐานข้อมูล เพราะเป็นค่าที่ผูกกับ "เครื่องที่กำลังใช้"
 * ไม่ใช่ผูกกับตัวคน — คนเดียวกันอาจอยากได้โหมดมืดบนมือถือตอนกลางคืน
 * แต่โหมดสว่างบนจอเดสก์ท็อปในออฟฟิศ
 *
 * ⚠️ ต้องอ่านค่าและทาลงบน <html> ก่อนเบราว์เซอร์วาดเฟรมแรก
 *    มิฉะนั้นจะเห็นหน้าขาววาบหนึ่งครั้งก่อนเปลี่ยนเป็นมืด ซึ่งแสบตาในที่มืด
 *    จึงมีสคริปต์ตัวเล็กใน layout ทำงานก่อน React เริ่ม (ดู THEME_INIT_SCRIPT)
 */

export type Theme = 'light' | 'dark';
export type Locale = 'lo' | 'th';

const THEME_KEY = 'aidc.theme';
const LOCALE_KEY = 'aidc.locale';

interface PreferencesValue {
  theme: Theme;
  locale: Locale;
  setTheme: (theme: Theme) => void;
  setLocale: (locale: Locale) => void;
}

const PreferencesContext = React.createContext<PreferencesValue | null>(null);

/**
 * สคริปต์ที่ต้องรันก่อน React — ฝังไว้ใน <head>
 *
 * เขียนเป็นสตริงเพราะต้องทำงานแบบ synchronous ก่อนเนื้อหาถูกวาด
 * ห่อ try/catch ไว้เพราะ localStorage โยน error ได้ในโหมดส่วนตัวบางเบราว์เซอร์
 * ซึ่งถ้าปล่อยให้พังตรงนี้ หน้าจะว่างทั้งหน้า
 */
export const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem('${THEME_KEY}');
  if (!t) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  var l = localStorage.getItem('${LOCALE_KEY}') || 'lo';
  document.documentElement.lang = l;
} catch (e) {}
`.trim();

export function PreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  // ค่าเริ่มต้นต้องตรงกับที่เรนเดอร์ฝั่งเซิร์ฟเวอร์ มิฉะนั้น hydration จะไม่ตรง
  // ค่าจริงจากเครื่องผู้ใช้อ่านใน effect ด้านล่าง หลัง mount แล้ว
  const [theme, setThemeState] = React.useState<Theme>('light');
  const [locale, setLocaleState] = React.useState<Locale>('lo');

  React.useEffect(() => {
    const el = document.documentElement;
    setThemeState((el.dataset.theme as Theme) ?? 'light');
    setLocaleState((el.lang as Locale) ?? 'lo');
  }, []);

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // เขียนไม่ได้ก็ไม่เป็นไร ค่าจะอยู่แค่จนกว่าจะปิดแท็บ
    }
  }, []);

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next);
    // lang บน <html> ไม่ได้มีไว้ให้ดูเฉย ๆ — โปรแกรมอ่านหน้าจอใช้ค่านี้
    // เลือกเสียงอ่านให้ตรงภาษา และเบราว์เซอร์ใช้ตัดบรรทัดให้ถูกหลักภาษา
    document.documentElement.lang = next;
    try {
      localStorage.setItem(LOCALE_KEY, next);
    } catch {
      /* เช่นเดียวกับธีม */
    }
  }, []);

  const value = React.useMemo<PreferencesValue>(
    () => ({ theme, locale, setTheme, setLocale }),
    [theme, locale, setTheme, setLocale],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const context = React.useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences ต้องอยู่ภายใต้ <PreferencesProvider>');
  }
  return context;
}
