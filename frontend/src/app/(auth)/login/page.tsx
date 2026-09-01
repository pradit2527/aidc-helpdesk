'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ChevronRight, Eye, EyeOff, Lock, Moon, ShieldCheck, Sun, User } from 'lucide-react';
import * as React from 'react';

/**
 * เข้าสู่ระบบ — โครงหน้า สี และองค์ประกอบตาม prototype/AIDC_Helpdesk_Portal_v2.html
 * (ฟังก์ชัน loginView) ไม่ได้ออกแบบใหม่
 *
 * สองคอลัมน์: แผงแบรนด์พื้นมืดฝั่งซ้าย + ฟอร์มฝั่งขวา
 * บนจอแคบกว่า lg แผงแบรนด์วางบนฟอร์ม และซ่อนย่อหน้าอธิบายยาวไว้
 * เพื่อไม่ให้ฟอร์มถูกดันตกจอ
 *
 * ⚠️ ห้ามบอกแยกว่า "ไม่มีชื่อผู้ใช้นี้" กับ "รหัสผ่านผิด"
 *    ข้อความที่แยกกันทำให้ไล่เดาได้ว่าบัญชีใดมีอยู่จริงในระบบ
 */

const MAX_TRIES = 5;
const LOCK_MINUTES = 30;

/** สถิติบนแผงแบรนด์ — ชุดเดียวกับต้นแบบ */
const STATS = [
  { value: '7', label: 'ບໍລິສັດໃນເຄືອ' },
  { value: '5,240', label: 'ຜູ້ໃຊ້ງານ' },
  { value: '99.94%', label: 'Uptime ລະບົບ Critical' },
];

/** บัญชีตัวอย่างสำหรับทดสอบสิทธิ์แต่ละระดับ — ชุดเดียวกับต้นแบบ */
const ACCOUNTS = [
  {
    initials: 'ກຈ',
    name: 'ກົມລະຊົນ ຈະເລີນວັດ',
    mail: 'kamolchanok.j@aidc-group.com',
    group: 'AIDC-All-Employees',
  },
  {
    initials: 'ນສ',
    name: 'ນັດທະພົນ ສຸກເກສົມ',
    mail: 'nattapon.s@aidc-group.com',
    group: 'AIDC-Support-Agent-HQ',
  },
  {
    initials: 'ພທ',
    name: 'ພີລະພົນ ທະນະກິດ',
    mail: 'peerapol.t@aidc-group.com',
    group: 'AIDC-Central-IT-Admin',
  },
];

export default function LoginPage(): React.JSX.Element {
  const router = useRouter();

  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [remember, setRemember] = React.useState(true);
  const [tries, setTries] = React.useState(0);
  const [locked, setLocked] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [dark, setDark] = React.useState(false);

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (locked) return;

    if (!username.trim() || !password) {
      setError('ກະລຸນາປ້ອນຊື່ຜູ້ໃຊ້ ແລະ ລະຫັດຜ່ານ');
      return;
    }

    setSubmitting(true);
    setError(null);
    // ของจริง: POST /auth/login แล้วอ่านผลจาก response
    //   200 + must_change_password -> /change-password · 200 -> หน้าแรกตามบทบาท
    //   401 -> นับครั้งที่ผิด · 423 -> บัญชีถูกล็อก
    await new Promise((resolve) => setTimeout(resolve, 400));
    setSubmitting(false);

    if (password === 'demo1234') {
      router.push('/');
      return;
    }

    const attempt = tries + 1;
    setTries(attempt);
    if (attempt >= MAX_TRIES) setLocked(true);
    setError('ຊື່ຜູ້ໃຊ້ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ');
  }

  return (
    <div className="proto grid min-h-screen lg:grid-cols-[1.08fr_1fr]">
      {/* ── ฝั่งซ้าย: แผงแบรนด์พื้นมืด ── */}
      <section className="login-hero hatch relative flex flex-col justify-between gap-9 p-7 sm:p-12 lg:p-14 xl:p-16">
        <div className="flex items-center gap-3">
          <span
            className="grid h-8 w-8 flex-none place-items-center text-[15px] font-bold text-white"
            style={{ background: '#ec3013', fontFamily: 'var(--font-archivo)' }}
          >
            A
          </span>
          <div className="leading-none">
            <div
              className="text-[15px] font-extrabold tracking-tight"
              style={{ fontFamily: 'var(--font-archivo)' }}
            >
              AIDC<span style={{ color: '#ff9783' }}>/</span>SERVICE
            </div>
            <div className="eyebrow mt-1.5" style={{ color: 'var(--hero-faint)' }}>
              AI Help Desk &amp; Support Portal
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-center py-2">
          <div className="rule-accent mb-6" />
          <h1 className="display-xl">
            AIDC Tech
            <br />
            Support &amp; Service
          </h1>
          <p
            className="mt-7 hidden max-w-[46ch] text-[15px] leading-[1.72] lg:block"
            style={{ color: 'var(--hero-muted)' }}
          >
            ສູນບໍລິການໄອທີ ແລະ ງານສ້ອມບຳລຸງກາງຂອງກຸ່ມບໍລິສັດ 7 ແຫ່ງ — ສິດການເບິ່ງເຫັນຂໍ້ມູນ
            ແລະ ຂອບເຂດບໍລິສັດໃນເຄືອກຳນົດຈາກ security group ຂອງຜູ້ໃຊ້ໂດຍອັດຕະໂນມັດ
          </p>

          <dl
            className="mt-8 grid grid-cols-3 gap-px"
            style={{ background: 'var(--hero-hair)', border: '1px solid var(--hero-hair)' }}
          >
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="px-3.5 py-4 sm:px-4 sm:py-5"
                style={{ background: 'var(--hero-bg)' }}
              >
                <dt className="stat-md">{stat.value}</dt>
                <dd className="eyebrow mt-2.5" style={{ color: 'var(--hero-faint)' }}>
                  {stat.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col gap-4">
          <div className="logo-plate">
            <Image
              src="/company-logo.jpg"
              width={516}
              height={317}
              priority
              alt="ໂລໂກ້ບໍລິສັດ ເອໄອດີຊີ ເທັກ ຈຳກັດ — ຕົວອັກສອນ AIDC TECH ສີຂາວ ແລະ ຄຳວ່າ Sole Co., Ltd ເທິງພື້ນສີຟ້າເຂັ້ມລາຍແຜງວົງຈອນ ມີກຣາຟິກຈຸດເຊື່ອມສີທອງທາງຊ້າຍ"
            />
            <div className="min-w-0">
              <div className="eyebrow" style={{ color: 'var(--hero-faint)' }}>
                System owner
              </div>
              <p
                className="mt-1.5 text-[12.5px] leading-[1.65]"
                style={{ color: 'var(--hero-muted)' }}
              >
                ບໍລິສັດ ເອໄອດີຊີ ເທັກ ຈຳກັດ
                <br />
                <span style={{ color: 'var(--hero-faint)' }}>AIDC TECH Sole Co., Ltd</span>
              </p>
            </div>
          </div>
          <p className="text-[11.5px] leading-[1.7]" style={{ color: 'var(--hero-faint)' }}>
            AIDC-IT-SLA-001 Rev. 1.1 · ບັງຄັບໃຊ້ 1 ສິງຫາ 2569 · ໃຊ້ພາຍໃນອົງກອນເທົ່ານັ້ນ
          </p>
        </div>
      </section>

      {/* ── ฝั่งขวา: ฟอร์มเข้าสู่ระบบ ── */}
      <section className="flex flex-col justify-center p-7 sm:p-12 lg:p-14">
        <div className="mx-auto w-full max-w-[416px]">
          <div className="eyebrow" style={{ color: 'var(--text-muted)' }}>
            Sign in
          </div>
          <h2 className="display-lg mt-2">ເຂົ້າສູ່ລະບົບ</h2>
          <p className="mt-2 text-[13.5px] leading-[1.72]" style={{ color: 'var(--text-secondary)' }}>
            ໃຊ້ບັນຊີອົງກອນອັນດຽວກັບອີເມວ ແລະ Wi-Fi ຂອງກຸ່ມບໍລິສັດ
          </p>

          <form onSubmit={onSubmit} noValidate className="mt-7 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="luser" className="text-[13.5px] font-semibold">
                ຊື່ຜູ້ໃຊ້ / ອີເມວອົງກອນ
              </label>
              <input
                id="luser"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError(null);
                }}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="peerapol.t ຫຼື ອີເມວອົງກອນ"
                className="field-input"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="lpass" className="text-[13.5px] font-semibold">
                  ລະຫັດຜ່ານ
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setError('ຕິດຕໍ່ Service Desk ພ້ອມລະຫັດພະນັກງານເພື່ອຢືນຢັນຕົວຕົນ ແລະ ຮັບລະຫັດຊົ່ວຄາວ')
                  }
                  className="min-h-[36px] text-[11.5px] font-semibold hover:underline"
                  style={{ color: 'var(--primary-hover)' }}
                >
                  ລືມລະຫັດຜ່ານ
                </button>
              </div>

              <div className="pw-wrap">
                <input
                  id="lpass"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  autoComplete="current-password"
                  placeholder="ລະຫັດຜ່ານບັນຊີອົງກອນ"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'lpass-err' : undefined}
                  className="field-input pr-tap"
                />
                <button
                  type="button"
                  className="pw-toggle"
                  aria-pressed={showPassword}
                  aria-controls="lpass"
                  aria-label={showPassword ? 'ເຊື່ອງລະຫັດຜ່ານ' : 'ສະແດງລະຫັດຜ່ານ'}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? (
                    <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" />
                  ) : (
                    <Eye className="h-[18px] w-[18px]" aria-hidden="true" />
                  )}
                </button>
              </div>

              {error && (
                <p
                  id="lpass-err"
                  role="alert"
                  className="text-[11.5px] font-medium"
                  style={{ color: 'var(--primary-hover)' }}
                >
                  {error}
                </p>
              )}

              {tries > 0 && !locked && (
                <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  ພະຍາຍາມເຂົ້າສູ່ລະບົບຜິດ{' '}
                  <span className="tabular font-semibold" style={{ color: 'var(--primary-hover)' }}>
                    {tries}/{MAX_TRIES}
                  </span>{' '}
                  ຄັ້ງ — ຄົບ {MAX_TRIES} ຄັ້ງບັນຊີຈະຖືກລັອກ {LOCK_MINUTES} ນາທີ
                </p>
              )}
            </div>

            {locked && (
              <div
                className="flex items-start gap-3 p-4"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
              >
                <Lock
                  className="mt-0.5 h-[18px] w-[18px] flex-none"
                  style={{ color: 'var(--primary-hover)' }}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold">ບັນຊີຖືກລັອກຊົ່ວຄາວ</p>
                  <p
                    className="mt-1 text-[12.5px] leading-relaxed"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    ປ້ອນລະຫັດຜ່ານຜິດຄົບ {MAX_TRIES} ຄັ້ງຕາມນະໂຍບາຍລະຫັດຜ່ານໃນເອກະສານ SOP —
                    ລອງໃໝ່ໄດ້ໃນອີກ <span className="tabular font-semibold">{LOCK_MINUTES}</span> ນາທີ
                    ຫຼື ຕິດຕໍ່ Service Desk ພ້ອມລະຫັດພະນັກງານເພື່ອຢືນຢັນຕົວຕົນ
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="check">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <i aria-hidden="true" />
                <span>ຈົດຈຳອຸປະກອນນີ້</span>
              </label>
              <span className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                ໃຊ້ກັບອຸປະກອນທີ່ລົງທະບຽນແລ້ວເທົ່ານັ້ນ
              </span>
            </div>

            <button
              type="submit"
              disabled={locked || submitting}
              className="mt-1 inline-flex min-h-[52px] w-full items-center justify-center gap-2 px-6 text-[15px] font-semibold text-white transition-colors disabled:opacity-50"
              style={{
                background: 'var(--primary)',
                boxShadow: 'inset 0 -2px 0 0 rgba(77,23,14,.42)',
              }}
            >
              <Lock className="h-[18px] w-[18px]" aria-hidden="true" />
              {submitting ? 'ກຳລັງເຂົ້າສູ່ລະບົບ...' : 'ເຂົ້າສູ່ລະບົບ'}
            </button>
          </form>

          <div className="divider-or my-7">ຫຼື</div>

          <button
            type="button"
            onClick={() => router.push('/')}
            className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 px-6 text-[15px] font-semibold transition-colors"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-control)',
              color: 'var(--text-primary)',
            }}
          >
            <ShieldCheck className="h-[18px] w-[18px]" aria-hidden="true" />
            ເຂົ້າສູ່ລະບົບດ້ວຍ Active Directory (SSO)
          </button>

          <details
            className="disc mt-4"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            <summary>
              <User
                className="h-4 w-4 flex-none"
                style={{ color: 'var(--text-muted)' }}
                aria-hidden="true"
              />
              <span>ບັນຊີທີ່ຈົດຈຳໄວ້ເທິງອຸປະກອນນີ້</span>
              <span
                className="tabular px-1.5 text-[11.5px] font-semibold"
                style={{
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  fontFamily: 'var(--font-archivo)',
                }}
              >
                {ACCOUNTS.length}
              </span>
              <ChevronRight className="chev h-4 w-4" aria-hidden="true" />
            </summary>
            <ul className="flex flex-col gap-px" style={{ background: 'var(--border)' }}>
              {ACCOUNTS.map((account) => (
                <li key={account.mail}>
                  <button
                    type="button"
                    onClick={() => setUsername(account.mail.split('@')[0] ?? '')}
                    className="group flex min-h-tap w-full items-center gap-3.5 p-3.5 text-left transition-colors hover:brightness-95"
                    style={{ background: 'var(--bg-surface)' }}
                  >
                    <span
                      className="grid h-10 w-10 flex-none place-items-center text-[13.5px] font-bold"
                      style={{ background: 'var(--text-primary)', color: 'var(--bg-page)' }}
                    >
                      {account.initials}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold">
                        {account.name}
                      </span>
                      <span
                        className="block truncate text-[11.5px]"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {account.mail}
                      </span>
                      <span
                        className="eyebrow mt-1 block truncate"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {account.group}
                      </span>
                    </span>
                    <ChevronRight
                      className="h-4 w-4 flex-none transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </details>

          <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            ຕ້ອງຢືນຢັນ MFA ຜ່ານແອັບຢືນຢັນຕົວຕົນພາຍໃນ 60 ວິນາທີ · ບັນຫາການເຂົ້າລະບົບ
            ເບິ່ງຄູ່ມືໃນຄັງຄວາມຮູ້ ຫຼື ຕິດຕໍ່ IT Hotline (ຮັບສາຍພາຍໃນ 3 ນາທີ ສຳລັບເຫດ P1/P2)
          </p>

          <div className="devnote mt-4">
            <span className="eyebrow" style={{ color: 'var(--primary-hover)' }}>
              Demo build
            </span>
            <p className="mt-1">
              ບັນຊີທົດລອງໃຊ້ລະຫັດຜ່ານ <code>demo1234</code> — ກົດເລືອກຊື່ຜູ້ໃຊ້ຈາກລາຍການ
              “ບັນຊີທີ່ຈົດຈຳໄວ້” ເພື່ອທົດສອບສິດແຕ່ລະລະດັບ
            </p>
          </div>

          <div
            className="mt-7 flex items-center justify-between gap-3 pt-5"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            <span className="eyebrow" style={{ color: 'var(--text-muted)' }}>
              Appearance
            </span>
            <button
              type="button"
              aria-pressed={dark}
              onClick={() => setDark((v) => !v)}
              className="inline-flex min-h-[36px] items-center gap-2 px-3 text-[12.5px] font-semibold"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-control)',
                color: 'var(--text-primary)',
              }}
            >
              {dark ? (
                <Sun className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4" aria-hidden="true" />
              )}
              {dark ? 'ໂໝດແຈ້ງ' : 'ໂໝດມືດ'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
