'use client';

import { AlertOctagon, Moon, Plus, Repeat, UserPlus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import {
  RecordFormDialog,
  type FieldSpec,
  type FieldValue,
} from '@/components/admin/record-form-dialog';
import { PriorityBadge } from '@/components/common/badges';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, EmptyState, type Column } from '@/components/ui/data-table';
import { Alert, BackLink, PageHeader, Tabs } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { BLOCKING_CONTACT_KEYS, CONTACT_KEY, TRIGGER_TYPE, type ContactKey } from '@/config/admin';
import { cn } from '@/lib/cn';
import { formatMinutes } from '@/lib/format';
import {
  useCompanies,
  useCreateMaster,
  useEscalationContacts,
  useEscalationRules,
  useUpdateMaster,
} from '@/lib/queries/master-data';
import type { EscalationContact, EscalationRule } from '@/lib/types';

/**
 * กฎยกระดับและผู้รับแจ้ง (docs/04-rbac-sla.md §4.3)
 *
 * เก็บกฎในตารางแทนที่จะฝังในโค้ด เพื่อให้แก้กฎได้โดยไม่ต้อง deploy ใหม่
 *
 * หน้านี้จับคู่ "กฎ" กับ "ผู้รับแจ้ง" ไว้ด้วยกันโดยตั้งใจ
 * เพราะกฎที่อ้างถึงผู้รับแจ้งที่ยังไม่มีตัวตน จะประเมินผลได้แต่ส่งไม่ถึงใคร
 * ถ้าแยกเป็นสองหน้า จะไม่มีจุดไหนที่มองเห็นความไม่ครบนี้พร้อมกัน
 */
export default function EscalationPage(): React.JSX.Element {
  const [tab, setTab] = React.useState<'rules' | 'contacts'>('rules');
  const rulesQuery = useEscalationRules();
  const contactsQuery = useEscalationContacts();

  const rules = React.useMemo(() => rulesQuery.data ?? [], [rulesQuery.data]);
  const contacts = React.useMemo(() => contactsQuery.data ?? [], [contactsQuery.data]);

  const activeKeys = React.useMemo(
    () => new Set(contacts.filter((c) => c.is_active).map((c) => c.contact_key)),
    [contacts],
  );
  const missingKeys = BLOCKING_CONTACT_KEYS.filter((k) => !activeKeys.has(k));

  const companies = useCompanies();
  const createRule = useCreateMaster('/escalation-rules');
  const updateRule = useUpdateMaster('/escalation-rules');
  const [creating, setCreating] = React.useState(false);

  /** เปิด/ปิดกฎจากปุ่มในตาราง — กฎที่ปิดยังอยู่ในระบบ แค่ไม่ถูกประเมิน */
  const toggleRule = async (rule: EscalationRule): Promise<void> => {
    try {
      await updateRule.mutateAsync({ id: rule.id, is_active: !rule.is_active });
      toast.success(`${rule.is_active ? 'ປິດ' : 'ເປີດ'}ກົດ ${rule.code} ແລ້ວ`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ບັນທຶກບໍ່ສຳເລັດ');
    }
  };

  const ruleFields: FieldSpec[] = [
    { kind: 'text', name: 'code', label: 'ລະຫັດກົດ', required: true, placeholder: 'ES_13' },
    {
      kind: 'select',
      name: 'trigger_type',
      label: 'ເງື່ອນໄຂກະຕຸ້ນ',
      required: true,
      options: Object.entries(TRIGGER_TYPE).map(([value, label]) => ({
        value,
        label: String(label),
      })),
    },
    {
      kind: 'select',
      name: 'priority',
      label: 'ໃຊ້ກັບລະດັບ',
      hint: 'ວ່າງໄວ້ = ທຸກລະດັບ',
      options: [
        { value: 'P1', label: 'P1' },
        { value: 'P2', label: 'P2' },
        { value: 'P3', label: 'P3' },
        { value: 'P4', label: 'P4' },
      ],
    },
    { kind: 'number', name: 'threshold_minutes', label: 'ເກນເວລາ (ນາທີ)' },
    {
      kind: 'select',
      name: 'threshold_clock_mode',
      label: 'ນັບເວລາແບບ',
      options: [
        { value: 'business_hours', label: 'ນາທີເຮັດວຽກ' },
        { value: 'calendar_24x7', label: 'ນາທີປະຕິທິນ (24x7)' },
      ],
    },
    {
      kind: 'text',
      name: 'notify_contact_keys',
      label: 'ຜູ້ຮັບແຈ້ງ',
      required: true,
      placeholder: 'head_of_it,incident_manager',
      hint: `ຄັ່ນດ້ວຍ , — ໃຊ້ໄດ້: ${Object.keys(CONTACT_KEY).join(', ')}`,
    },
    { kind: 'text', name: 'notify_roles', label: 'ບົດບາດທີ່ແຈ້ງເພີ່ມ', placeholder: 'agent,company_admin' },
    { kind: 'number', name: 'repeat_interval_minutes', label: 'ແຈ້ງຊ້ຳທຸກ (ນາທີ)' },
    {
      kind: 'checkbox',
      name: 'notify_outside_business_hours',
      label: 'ແຈ້ງນອກເວລາເຮັດວຽກໄດ້',
      hint: 'SLA 3.1 ໃຫ້ On-call ຄຸ້ມສະເພາະ P1',
    },
    {
      kind: 'select',
      name: 'company_id',
      label: 'ຂອບເຂດ',
      options: [
        { value: '', label: 'ທັງກຸ່ມ' },
        ...(companies.data ?? []).map((c) => ({ value: String(c.id), label: c.code })),
      ],
    },
    { kind: 'checkbox', name: 'is_active', label: 'ເປີດໃຊ້ງານ' },
  ];

  const handleRuleSubmit = async (values: Record<string, FieldValue>): Promise<void> => {
    const num = (v: FieldValue | undefined): number | null =>
      v === '' || v === null || v === undefined ? null : Number(v);
    await createRule.mutateAsync({
      code: String(values.code ?? ''),
      trigger_type: String(values.trigger_type ?? ''),
      notify_contact_keys: String(values.notify_contact_keys ?? ''),
      notify_roles: String(values.notify_roles ?? ''),
      priority: String(values.priority ?? ''),
      threshold_minutes: num(values.threshold_minutes),
      threshold_clock_mode: String(values.threshold_clock_mode ?? 'business_hours'),
      repeat_interval_minutes: num(values.repeat_interval_minutes),
      notify_outside_business_hours: values.notify_outside_business_hours === true,
      company_id: values.company_id ? Number(values.company_id) : null,
      is_active: values.is_active === true,
    });
    toast.success(`ເພີ່ມກົດ ${values.code} ແລ້ວ`);
  };

  /*
   * กฎที่อ้างผู้รับแจ้งที่ยังไม่มีตัวตน — ส่งแจ้งเตือนไม่ถึงใครเลย
   *
   * คำนวณได้ก็ต่อเมื่อโหลดผู้รับแจ้งสำเร็จแล้ว มิฉะนั้นรายการว่างระหว่างโหลด
   * จะทำให้ทุกกฎถูกตีเป็น "เงียบ" แล้วขึ้นคำเตือนผิด ๆ ชั่วขณะ
   */
  const mutedRules = contactsQuery.isSuccess
    ? rules.filter((rule) => {
        const keys = rule.notify_contact_keys.split(',').filter(Boolean);
        return keys.length > 0 && keys.every((k) => !activeKeys.has(k));
      })
    : [];

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/admin" label="ກັບໄປສູນຄວບຄຸມ" />
      <PageHeader
        title="ກົດຍົກລະດັບ ແລະ ຜູ້ຮັບແຈ້ງ"
        description="ES-01…ES-12 ຕາມ AIDC-IT-SLA-001 — ແກ້ໄດ້ໂດຍບໍ່ຕ້ອງ deploy ໃໝ່"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            ເພີ່ມກົດ
          </Button>
        }
      />

      {missingKeys.length > 0 && (
        <Alert tone="danger" title="ຍັງກຳນົດຜູ້ຮັບແຈ້ງບໍ່ຄົບ — ບລັອກການເປີດໃຊ້ງານຈິງ (Q-07)">
          ຍັງບໍ່ຮູ້ວ່າໃຜເປັນ {missingKeys.map((k) => CONTACT_KEY[k]).join(' · ')} ຈຶ່ງຜູກຄົນຈິງບໍ່ໄດ້
          {mutedRules.length > 0 && (
            <>
              {' '}
              ຜົນຄື <span className="font-semibold">{mutedRules.length} ກົດ</span> (
              {mutedRules.map((r) => r.code).join(', ')}) ຍັງປະເມີນຜົນໄດ້
              ແຕ່ສົ່ງແຈ້ງເຕືອນບໍ່ເຖິງໃຜເລີຍ
            </>
          )}
        </Alert>
      )}

      <Card>
        <div className="px-4 pt-1 lg:px-5">
          <Tabs
            tabs={[
              { key: 'rules' as const, label: 'ກົດຍົກລະດັບ', count: rules.length },
              { key: 'contacts' as const, label: 'ຜູ້ຮັບແຈ້ງ', count: contacts.length },
            ]}
            value={tab}
            onChange={setTab}
            label="ສ່ວນຂອງການຍົກລະດັບ"
          />
        </div>
        <CardBody className="p-0">
          {tab === 'rules' ? (
            <QueryBoundary query={rulesQuery}>
              <RulesTable
                activeKeys={activeKeys}
                rules={rules}
                onToggle={(r) => void toggleRule(r)}
              />
            </QueryBoundary>
          ) : (
            <QueryBoundary query={contactsQuery}>
              <ContactsTable activeKeys={activeKeys} contacts={contacts} />
            </QueryBoundary>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ກະຕິກາກັນການລົບກວນເກີນຈຳເປັນ</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2 text-body-sm text-ink-2">
          <p>
            <strong className="text-ink">ແຈ້ງຄັ້ງດຽວຕໍ່ເລື່ອງຕໍ່ກົດ</strong> ຍົກເວັ້ນ ES-02 ແລະ ES-09
            (P1) ທີ່ແຈ້ງຊ້ຳທຸກຊົ່ວໂມງ ແລະ ES-06 ທີ່ແຈ້ງຊ້ຳໄດ້ມື້ລະຄັ້ງ
          </p>
          <p>
            <strong className="text-ink">ບໍ່ສົ່ງນອກເວລາເຮັດວຽກ</strong> ຍົກເວັ້ນ P1 ແລະ ES-03
            ເພາະ SLA 3.1 ລະບຸວ່າທີມ On-call ຄຸ້ມຄອງສະເພາະ P1
          </p>
          <p>
            <strong className="text-ink">ລະງັບການແຈ້ງທັງໝົດ</strong> ສຳລັບເລື່ອງທີ່ຢູ່ສະຖານະ
            ລໍຖ້າຜູ້ແຈ້ງ ບໍ່ວ່າດ້ວຍເຫດຜົນໃດ
          </p>
        </CardBody>
      </Card>
      <RecordFormDialog
        open={creating}
        title="ເພີ່ມກົດຍົກລະດັບ"
        description="ກົດເກັບໃນຕາຕະລາງ ບໍ່ໄດ້ຝັງໃນໂຄດ ຈຶ່ງແກ້ໄດ້ໂດຍບໍ່ຕ້ອງ deploy ໃໝ່"
        fields={ruleFields}
        initial={{
          code: '',
          trigger_type: '',
          priority: '',
          threshold_minutes: null,
          threshold_clock_mode: 'business_hours',
          notify_contact_keys: '',
          notify_roles: '',
          repeat_interval_minutes: null,
          notify_outside_business_hours: false,
          company_id: '',
          is_active: true,
        }}
        onClose={() => setCreating(false)}
        onSubmit={handleRuleSubmit}
      />

    </div>
  );
}

function RulesTable({
  activeKeys,
  rules,
  onToggle,
}: {
  onToggle: (rule: EscalationRule) => void;
  activeKeys: Set<string>;
  rules: EscalationRule[];
}): React.JSX.Element {
  const columns: Column<EscalationRule>[] = [
    {
      key: 'code',
      header: 'ລະຫັດ',
      width: '84px',
      render: (r) => <span className="tabular font-mono text-body-sm font-semibold">{r.code}</span>,
    },
    {
      key: 'trigger',
      header: 'ເງື່ອນໄຂ',
      render: (r) => (
        <span>
          <span className="block text-body-sm">{TRIGGER_TYPE[r.trigger_type] ?? r.trigger_type}</span>
          {r.threshold_minutes !== null && r.threshold_minutes > 0 && (
            <span className="block text-caption text-ink-3">
              ເກີນ{' '}
              {formatMinutes(
                r.threshold_minutes,
                r.threshold_clock_mode === 'calendar_24x7' ? 'calendar_minutes' : 'business_minutes',
              )}
              {r.threshold_clock_mode === 'business_hours' ? ' (ເວລາເຮັດວຽກ)' : ' (ປະຕິທິນ)'}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'priority',
      header: 'ລະດັບ',
      hideBelow: 'md',
      render: (r) =>
        r.priority ? (
          <PriorityBadge priority={r.priority} withMeter={false} />
        ) : (
          <span className="text-caption text-ink-3">ທຸກລະດັບ</span>
        ),
    },
    {
      key: 'notify',
      header: 'ຜູ້ຮັບແຈ້ງ',
      render: (r) => {
        const keys = r.notify_contact_keys.split(',').filter(Boolean);
        if (keys.length === 0 && !r.notify_roles) {
          return <span className="text-caption text-ink-3">ຜູ້ຮັບຜິດຊອບຂອງເລື່ອງເທົ່ານັ້ນ</span>;
        }
        return (
          <span className="flex flex-wrap gap-1">
            {keys.map((key) => {
              const known = activeKeys.has(key);
              return (
                <span
                  key={key}
                  title={known ? undefined : 'ຍັງບໍ່ໄດ້ຜູກຄົນຈິງ — ສົ່ງບໍ່ເຖິງ'}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-caption',
                    known
                      ? 'bg-subtle text-ink-2'
                      : 'bg-sla-breach-bg font-semibold text-sla-breach',
                  )}
                >
                  {!known && <AlertOctagon className="h-3 w-3" aria-hidden="true" />}
                  {CONTACT_KEY[key as ContactKey] ?? key}
                </span>
              );
            })}
            {r.notify_roles && (
              <span className="rounded-sm bg-subtle px-1.5 py-0.5 text-caption text-ink-2">
                ບົດບາດ {r.notify_roles}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: 'behaviour',
      header: 'ພຶດຕິກຳ',
      hideBelow: 'lg',
      render: (r) => (
        <span className="flex flex-wrap gap-2 text-caption text-ink-2">
          {r.notify_outside_business_hours && (
            <span className="inline-flex items-center gap-1" title="ສົ່ງນອກເວລາເຮັດວຽກໄດ້">
              <Moon className="h-3.5 w-3.5" aria-hidden="true" />
              ນອກເວລາ
            </span>
          )}
          {r.repeat_interval_minutes !== null && (
            <span className="inline-flex items-center gap-1">
              <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
              ຊ້ຳທຸກ {formatMinutes(r.repeat_interval_minutes, 'calendar_minutes')}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'active',
      header: 'ສະຖານະ',
      align: 'right',
      render: (r) => (
        <button
          type="button"
          onClick={() => onToggle(r)}
          className={cn(
            // เป็นปุ่มกดจริง ไม่ใช่ป้ายสถานะ จึงต้องสูงพอให้แตะด้วยนิ้วได้ (กฎ M-1)
            'inline-flex min-h-[36px] items-center rounded-full px-3 text-caption font-semibold',
            r.is_active ? 'bg-sla-ok-bg text-sla-ok' : 'bg-subtle text-ink-3',
          )}
        >
          {r.is_active ? 'ເປີດໃຊ້' : 'ປິດ'}
        </button>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rules}
      rowKey={(r) => r.id}
      caption="ກົດຍົກລະດັບ ES-01 ເຖິງ ES-12"
    />
  );
}

function ContactsTable({
  activeKeys,
  contacts,
}: {
  activeKeys: Set<string>;
  contacts: EscalationContact[];
}): React.JSX.Element {
  const missing = BLOCKING_CONTACT_KEYS.filter((k) => !activeKeys.has(k));

  const columns: Column<EscalationContact>[] = [
    {
      key: 'key',
      header: 'ລະດັບຜູ້ຮັບແຈ້ງ',
      render: (c) => (
        <span>
          <span className="block text-body-sm font-semibold">
            {CONTACT_KEY[c.contact_key as ContactKey] ?? c.contact_key}
          </span>
          <span className="block font-mono text-caption text-ink-3">{c.contact_key}</span>
        </span>
      ),
    },
    { key: 'user', header: 'ຜູ້ຮັບຜິດຊອບ', render: (c) => c.user.full_name },
    {
      key: 'scope',
      header: 'ຂອບເຂດ',
      render: (c) => (
        <span className="text-caption text-ink-2">{c.company ? c.company.code : 'ທັງກຸ່ມ'}</span>
      ),
    },
    {
      key: 'primary',
      header: 'ຫຼັກ',
      align: 'center',
      hideBelow: 'md',
      render: (c) =>
        c.is_primary ? (
          <span className="rounded-full bg-primary-subtle px-2 py-0.5 text-caption font-semibold text-primary">
            ຫຼັກ
          </span>
        ) : (
          <span className="text-caption text-ink-3">ສຳຮອງ</span>
        ),
    },
  ];

  return (
    <div>
      {missing.length > 0 && (
        <div className="border-b border-hair bg-sla-breach-bg/40 px-4 py-3 lg:px-5">
          <p className="text-body-sm font-semibold text-ink">
            ຍັງຂາດຜູ້ຮັບແຈ້ງ {missing.length} ລະດັບ
          </p>
          <ul className="mt-2 space-y-2">
            {missing.map((key) => (
              <li
                key={key}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-dashed border-sla-breach/40 bg-surface px-3 py-2"
              >
                <span>
                  <span className="block text-body-sm font-semibold">{CONTACT_KEY[key]}</span>
                  <span className="block font-mono text-caption text-ink-3">{key}</span>
                </span>
                <Button
                  size="sm"
                  disabled
                  title="ຍັງບໍ່ມີ endpoint ສຳລັບຜູກຜູ້ຮັບແຈ້ງ"
                  onClick={() => undefined}
                >
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  ຜູກຄົນ
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end border-b border-hair px-4 py-3 lg:px-5">
        <Button
          size="sm"
          variant="secondary"
          disabled
          title="ຍັງບໍ່ມີ endpoint ສຳລັບຜູກຜູ້ຮັບແຈ້ງ"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          ເພີ່ມຜູ້ຮັບແຈ້ງ
        </Button>
      </div>

      {contacts.length === 0 ? (
        <EmptyState
          icon={AlertOctagon}
          title="ຍັງບໍ່ມີຜູ້ຮັບແຈ້ງໃນລະບົບ"
          hint="ກົດຍົກລະດັບທຸກຂໍ້ຈະສົ່ງແຈ້ງເຕືອນບໍ່ໄດ້ຈົນກວ່າຈະຜູກຄົນຈິງ"
        />
      ) : (
        <DataTable
          columns={columns}
          rows={contacts}
          rowKey={(c) => c.id}
          caption="ຜູ້ຮັບແຈ້ງຂອງກົດຍົກລະດັບ"
        />
      )}
    </div>
  );
}
