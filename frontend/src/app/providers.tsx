'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { Toaster } from 'sonner';

import { ApiError } from '@/lib/api';
import { SessionProvider } from '@/lib/session';

/**
 * QueryClient ต้องสร้างใน useState ไม่ใช่ตัวแปรระดับโมดูล
 *
 * บนเซิร์ฟเวอร์ตัวแปรระดับโมดูลจะถูกใช้ร่วมกันข้ามคำขอ
 * ผู้ใช้คนหนึ่งจะได้ข้อมูลที่แคชไว้ของอีกคน ซึ่งเป็นการรั่วข้อมูลข้ามผู้ใช้
 */
export function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // ค่า SLA เปลี่ยนตลอดเวลา แต่ห้ามทำนาฬิกานับถอยหลังฝั่ง client
            // เพราะนาทีทำการหยุดเดินนอกเวลางาน จึงดึงค่าใหม่ทุก 60 วินาทีแทน (FE-07)
            refetchInterval: 60_000,
            refetchOnWindowFocus: true,
            staleTime: 30_000,
            retry: (failureCount, error) => {
              // ลองใหม่ไม่ช่วยอะไรถ้าเป็นเรื่องสิทธิ์หรือข้อมูลไม่ถูกต้อง
              // มีแต่จะทำให้ผู้ใช้รอนานขึ้นก่อนเห็นข้อความจริง
              if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
                return false;
              }
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        {children}
        <Toaster
          position="top-center"
          // ข้อความแจ้งผลต้องอยู่นานพอให้อ่านภาษาลาวจบ ค่าเริ่มต้น 4 วินาทีสั้นไป
          duration={6000}
          toastOptions={{ className: 'text-body-sm' }}
        />
      </SessionProvider>
    </QueryClientProvider>
  );
}
