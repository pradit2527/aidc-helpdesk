'use client';

import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Alert, BackLink, MockNotice, PageHeader } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { formatFileSize } from '@/lib/format';

interface ImportRow {
  line: number;
  username: string;
  full_name: string;
  company: string;
  status: 'ok' | 'error' | 'skipped';
  message: string;
}

/**
 * นำเข้าผู้ใช้จากไฟล์ (FR-06)
 *
 * ผลลัพธ์ต้องรายงาน "รายแถว" ไม่ใช่บอกแค่ว่าสำเร็จกี่คน
 * ไฟล์รายชื่อพนักงานมีหลักร้อยแถว ถ้าบอกแค่ยอดรวม ผู้ดูแลต้องไล่หาเองว่าแถวไหนตก
 */
const SAMPLE_RESULT: ImportRow[] = [
  { line: 2, username: 'somsak.p', full_name: 'ສົມສັກ ພັນທະວົງ', company: 'AIDC-LOG', status: 'ok', message: 'ສ້າງບັນຊີແລ້ວ' },
  { line: 3, username: 'khamla.s', full_name: 'ຄຳລ້າ ສີວິໄລ', company: 'AIDC-LOG', status: 'ok', message: 'ສ້າງບັນຊີແລ້ວ' },
  { line: 4, username: 'phouvong.s', full_name: 'ພູວົງ ສີສຸກ', company: 'AIDC-LOG', status: 'skipped', message: 'ມີຊື່ຜູ້ໃຊ້ນີ້ຢູ່ແລ້ວ ຂ້າມແຖວນີ້' },
  { line: 5, username: 'bounmy.k', full_name: 'ບຸນມີ ແກ້ວມະນີ', company: 'AIDC-XYZ', status: 'error', message: 'ບໍ່ພົບລະຫັດບໍລິສັດ AIDC-XYZ' },
  { line: 6, username: '', full_name: 'ວິໄລ ສຸວັນນະ', company: 'AIDC-CON', status: 'error', message: 'ຊ່ອງ username ວ່າງ' },
];

export default function ImportUsersPage(): React.JSX.Element {
  const [file, setFile] = React.useState<File | null>(null);
  const [result, setResult] = React.useState<ImportRow[] | null>(null);
  const [running, setRunning] = React.useState(false);

  const counts = result
    ? {
        ok: result.filter((r) => r.status === 'ok').length,
        skipped: result.filter((r) => r.status === 'skipped').length,
        error: result.filter((r) => r.status === 'error').length,
      }
    : null;

  const columns: Column<ImportRow>[] = [
    { key: 'line', header: 'ແຖວ', width: '64px', align: 'right', render: (r) => <span className="tabular">{r.line}</span> },
    { key: 'username', header: 'ຊື່ຜູ້ໃຊ້', render: (r) => r.username || <span className="text-ink-3">—</span> },
    { key: 'full_name', header: 'ຊື່', hideBelow: 'sm', render: (r) => r.full_name },
    { key: 'company', header: 'ບໍລິສັດ', hideBelow: 'md', render: (r) => r.company },
    {
      key: 'status',
      header: 'ຜົນ',
      render: (r) => (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-semibold',
            r.status === 'ok' && 'bg-sla-ok-bg text-sla-ok',
            r.status === 'skipped' && 'bg-subtle text-ink-2',
            r.status === 'error' && 'bg-sla-breach-bg text-sla-breach',
          )}
        >
          {r.status === 'ok' && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
          {r.status === 'error' && <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
          {r.status === 'ok' ? 'ສຳເລັດ' : r.status === 'skipped' ? 'ຂ້າມ' : 'ຜິດພາດ'}
        </span>
      ),
    },
    { key: 'message', header: 'ລາຍລະອຽດ', render: (r) => <span className="text-body-sm text-ink-2">{r.message}</span> },
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <BackLink href="/admin/users" label="ກັບໄປລາຍຊື່ຜູ້ໃຊ້" />
      <PageHeader
        title="ນຳເຂົ້າຜູ້ໃຊ້ຈາກໄຟລ໌"
        description="ຮອງຮັບ .xlsx ແລະ .csv"
        actions={
          <Button variant="secondary" onClick={() => toast.info('ດາວໂຫຼດແມ່ແບບ')}>
            <Download className="h-4 w-4" aria-hidden="true" />
            ດາວໂຫຼດແມ່ແບບ
          </Button>
        }
      />

      <MockNotice endpoint="POST /users/import" />

      <Alert tone="info" title="ໂຄງສ້າງໄຟລ໌ທີ່ຕ້ອງການ">
        ແຖວທຳອິດເປັນຫົວຕາຕະລາງ ແລະ ຕ້ອງມີຄໍລຳ{' '}
        <code className="font-mono">username, full_name, email, employee_code, company_code, department</code>
        <br />
        ບັນຊີທີ່ນຳເຂົ້າຈະຖືກຕັ້ງໃຫ້ຕ້ອງປ່ຽນລະຫັດຜ່ານເມື່ອເຂົ້າໃຊ້ຄັ້ງທຳອິດສະເໝີ
      </Alert>

      <Card>
        <CardBody>
          <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed border-control bg-subtle px-4 py-6 text-center hover:border-primary">
            <FileSpreadsheet className="h-8 w-8 text-ink-3" aria-hidden="true" />
            <span className="text-body font-semibold text-ink-2">
              {file ? file.name : 'ເລືອກໄຟລ໌ .xlsx ຫຼື .csv'}
            </span>
            {file && (
              <span className="tabular text-caption text-ink-3">{formatFileSize(file.size)}</span>
            )}
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
              className="sr-only"
            />
          </label>

          <div className="mt-3 flex justify-end">
            <Button
              disabled={!file}
              loading={running}
              onClick={async () => {
                setRunning(true);
                await new Promise((r) => setTimeout(r, 500));
                setResult(SAMPLE_RESULT);
                setRunning(false);
              }}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              ນຳເຂົ້າ
            </Button>
          </div>
        </CardBody>
      </Card>

      {result && counts && (
        <Card>
          <CardHeader>
            <CardTitle>ຜົນການນຳເຂົ້າ</CardTitle>
            <span className="tabular text-body-sm text-ink-2">
              ສຳເລັດ {counts.ok} · ຂ້າມ {counts.skipped} ·{' '}
              <span className={counts.error > 0 ? 'font-semibold text-sla-breach' : undefined}>
                ຜິດພາດ {counts.error}
              </span>
            </span>
          </CardHeader>
          {counts.error > 0 && (
            <div className="px-4 pt-4 lg:px-5">
              <Alert tone="warning" title="ແຖວທີ່ຜິດພາດບໍ່ຖືກນຳເຂົ້າ">
                ແຖວທີ່ສຳເລັດຖືກບັນທຶກໄປແລ້ວ ແກ້ສະເພາະແຖວທີ່ຜິດແລ້ວນຳເຂົ້າໃໝ່ໄດ້ເລີຍ
                ລະບົບຈະຂ້າມບັນຊີທີ່ມີຢູ່ແລ້ວໃຫ້ເອງ
              </Alert>
            </div>
          )}
          <CardBody className="p-0">
            <DataTable
              columns={columns}
              rows={result}
              rowKey={(r) => r.line}
              caption="ຜົນການນຳເຂົ້າລາຍແຖວ"
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
