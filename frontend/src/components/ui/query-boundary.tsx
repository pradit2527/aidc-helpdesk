'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { UseQueryResult } from '@tanstack/react-query';
import * as React from 'react';

import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';

/**
 * ห่อผลลัพธ์ของคิวรีหนึ่งอัน แล้วแสดงสถานะกำลังโหลดหรือผิดพลาดให้เอง
 *
 * มีไว้เพื่อไม่ให้ทุกหน้าจอเขียน if (isLoading) ... if (isError) ... ซ้ำกัน
 * ซึ่งนอกจากยาวแล้ว ยังทำให้แต่ละหน้าแสดงข้อความผิดพลาดคนละแบบ
 * จนผู้ใช้บอกไม่ได้ว่าอันไหนคือปัญหาเดียวกัน
 *
 * ⚠️ ไม่ซ่อนเนื้อหาเดิมตอนกำลังโหลดซ้ำ (isFetching)
 *    ถ้าซ่อน ตารางจะกะพริบทุก 60 วินาทีตอน refetch อัตโนมัติ
 *    ซึ่งรบกวนสายตาและทำให้ผู้ใช้เสียตำแหน่งที่กำลังอ่านอยู่
 */
export function QueryBoundary<T>({
  query,
  children,
  loadingLabel = 'ກຳລັງໂຫຼດຂໍ້ມູນ',
}: {
  query: UseQueryResult<T, Error>;
  children: React.ReactNode;
  loadingLabel?: string | undefined;
}): React.JSX.Element {
  if (query.isPending) {
    return (
      <div
        className="flex min-h-32 items-center justify-center gap-3 text-body-sm text-muted"
        role="status"
        aria-live="polite"
      >
        <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
        {loadingLabel}...
      </div>
    );
  }

  if (query.isError) {
    return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  }

  return <>{children}</>;
}

/**
 * ข้อความผิดพลาดที่บอกผู้ใช้ว่าต้องทำอะไรต่อ ไม่ใช่แค่ว่าอะไรพัง
 *
 * แสดงรหัสอ้างอิงคำขอด้วยเมื่อเป็นความผิดพลาดฝั่งเซิร์ฟเวอร์ —
 * ผู้ใช้ที่โทรแจ้ง Service Desk พร้อมรหัสนี้ ทีมจะค้น log เจอทันที
 * แทนที่จะต้องไล่ถามว่ากดอะไรตอนกี่โมง
 */
function QueryError({ error, onRetry }: { error: Error; onRetry: () => void }): React.JSX.Element {
  const apiError = error instanceof ApiError ? error : null;
  const isServerFault = !apiError || apiError.status >= 500 || apiError.status === 0;

  return (
    <div className="flex min-h-32 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <AlertTriangle className="h-6 w-6 text-danger" aria-hidden="true" />

      <p className="text-body-sm text-ink-2">
        {apiError?.message ?? 'ເກີດຂໍ້ຜິດພາດທີ່ບໍ່ຄາດຄິດ'}
      </p>

      {isServerFault && apiError?.requestId && (
        <p className="text-caption text-ink-3">
          ລະຫັດອ້າງອີງ: <code className="font-mono">{apiError.requestId}</code>
        </p>
      )}

      <Button variant="secondary" size="sm" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        ລອງໃໝ່
      </Button>
    </div>
  );
}
