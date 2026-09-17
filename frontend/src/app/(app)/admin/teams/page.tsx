'use client';

import { Pencil, Plus, UsersRound } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { TeamFormDialog, type TeamFormValues } from '@/components/admin/team-form-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/data-table';
import { Alert, Avatar, PageHeader } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { useCompanies } from '@/lib/queries/master-data';
import {
  useCreateTeam,
  useSupportTeams,
  useTeamCandidates,
  useUpdateTeam,
} from '@/lib/queries/teams';
import { useCan } from '@/lib/session';
import type { SupportTeam } from '@/lib/types';

/**
 * ทีมงาน IT — ใครอยู่ทีมไหน และใครเป็นหัวหน้าที่มอบหมายงานได้
 *
 * หน้านี้เป็นที่มาของสิ่งที่ผู้ใช้เห็นในกล่อง "ມອບໝາຍໃຫ້ທີມງານ" บนหน้ารายละเอียดเรื่อง
 * แก้ที่นี่แล้วรายชื่อผู้รับมอบหมายของทุกเรื่องเปลี่ยนตาม
 *
 * ⚠️ การซ่อนปุ่มแก้ไขเป็นเรื่องประสบการณ์ผู้ใช้ ไม่ใช่มาตรการความปลอดภัย
 *    backend ตรวจ user.assign_role ซ้ำทุกคำขอเขียนอยู่แล้ว ส่วนคนที่มีแค่
 *    ticket.assign เปิดหน้านี้ได้เพื่อดูว่าทีมตัวเองมีใครบ้าง — เซิร์ฟเวอร์
 *    เป็นผู้กรองว่าเห็นทีมไหนได้ หน้าจอแสดงตามที่ได้รับมาเท่านั้น
 */
export default function TeamsPage(): React.JSX.Element {
  const canManage = useCan('user.assign_role');
  const teams = useSupportTeams();

  const [editing, setEditing] = React.useState<SupportTeam | null>(null);
  const [creating, setCreating] = React.useState(false);

  const closeDialog = React.useCallback(() => {
    setCreating(false);
    setEditing(null);
  }, []);

  const rows = teams.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ທີມງານ IT"
        description="ສະມາຊິກທີມ ແລະ ຫົວໜ້າທີມທີ່ມອບໝາຍວຽກໃຫ້ຄົນໃນທີມໄດ້"
        actions={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              ສ້າງທີມໃໝ່
            </Button>
          ) : undefined
        }
      />

      {!canManage && (
        <Alert tone="info" title="ເບິ່ງໄດ້ຢ່າງດຽວ">
          ການເພີ່ມ ຫຼື ແກ້ໄຂທີມເຮັດໄດ້ໂດຍຜູ້ດູແລທີ່ມີສິດຈັດການບົດບາດຜູ້ໃຊ້ເທົ່ານັ້ນ
        </Alert>
      )}

      <Card>
        <QueryBoundary query={teams} loadingLabel="ກຳລັງໂຫຼດລາຍຊື່ທີມ">
          {rows.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="ຍັງບໍ່ມີທີມງານ"
              hint={
                canManage
                  ? 'ສ້າງທີມແລ້ວກຳນົດຫົວໜ້າທີມ ຈຶ່ງຈະມອບໝາຍວຽກໃຫ້ຄົນໃນທີມໄດ້'
                  : 'ໃຫ້ຜູ້ດູແລລະບົບສ້າງທີມ ແລະ ເພີ່ມທ່ານເຂົ້າທີມກ່ອນ'
              }
            />
          ) : (
            <ul className="divide-y divide-hair">
              {rows.map((team) => (
                <TeamRow
                  key={team.id}
                  team={team}
                  canManage={canManage}
                  onEdit={() => setEditing(team)}
                />
              ))}
            </ul>
          )}
        </QueryBoundary>
      </Card>

      {/*
        กล่องแก้ไขถูกประกอบขึ้นเมื่อเปิดเท่านั้น
        รายชื่อผู้ที่เพิ่มเข้าทีมได้กับรายการบริษัทจึงไม่ถูกดึงมาเปล่า ๆ
        ตอนที่คนเข้ามาแค่ดูว่าทีมมีใครบ้าง
      */}
      {canManage && (creating || editing !== null) && (
        <TeamEditor team={editing} onClose={closeDialog} />
      )}
    </div>
  );
}

function TeamRow({
  team,
  canManage,
  onEdit,
}: {
  team: SupportTeam;
  canManage: boolean;
  onEdit: () => void;
}): React.JSX.Element {
  const leads = team.members.filter((m) => m.is_lead);

  return (
    <li className="px-4 py-4 lg:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body font-semibold text-ink">{team.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-ink-3">
            <span className="font-mono">{team.code}</span>
            <span aria-hidden="true">·</span>
            {/* ทีมส่วนกลางรับงานได้ทุกบริษัท ต้องอ่านออกทันทีว่าทีมไหนเป็นแบบไหน */}
            <span>{team.company?.code ?? 'ສ່ວນກາງ'}</span>
          </p>
        </div>

        <div className="flex flex-none items-center gap-2">
          {team.is_active ? (
            <span className="rounded-full bg-sla-ok-bg px-2 py-0.5 text-caption text-sla-ok">
              ໃຊ້ງານ
            </span>
          ) : (
            <span className="rounded-full bg-subtle px-2 py-0.5 text-caption text-ink-3">ປິດ</span>
          )}
          {canManage && (
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">ແກ້ໄຂ {team.name}</span>
            </Button>
          )}
        </div>
      </div>

      {team.description && <p className="mt-1 text-body-sm text-ink-2">{team.description}</p>}

      <dl className="mt-3 space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <dt className="text-caption text-ink-3">ຫົວໜ້າທີມ</dt>
          <dd className="min-w-0 text-body-sm text-ink">
            {leads.length > 0 ? (
              leads.map((l) => l.full_name).join(' · ')
            ) : (
              <span className="text-sla-risk">ຍັງບໍ່ໄດ້ກຳນົດ — ມອບໝາຍວຽກບໍ່ໄດ້</span>
            )}
          </dd>
        </div>

        <div>
          <dt className="tabular text-caption text-ink-3">ສະມາຊິກ {team.members.length} ຄົນ</dt>
          <dd className="mt-1">
            {team.members.length === 0 ? (
              <span className="text-body-sm text-ink-3">ຍັງບໍ່ມີສະມາຊິກ</span>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {team.members.map((member) => (
                  <li
                    key={member.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-hair py-0.5 pl-0.5 pr-2.5"
                  >
                    <Avatar name={member.full_name} size="sm" />
                    <span className="text-body-sm text-ink">{member.full_name}</span>
                    <span className="tabular text-caption text-ink-3">
                      ວຽກຄ້າງ {member.open_tickets}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>
    </li>
  );
}

/**
 * ตัวห่อกล่องแก้ไข — ดึงข้อมูลที่ใช้เฉพาะตอนแก้ไข
 *
 * แยกออกมาเพราะ hook เรียกตามเงื่อนไขไม่ได้ การมีคอมโพเนนต์ที่ถูกประกอบ
 * เฉพาะตอนเปิดกล่อง คือวิธีเดียวที่ทำให้ GET /support-teams/candidates
 * (ซึ่งต้องใช้สิทธิ์ user.assign_role) ไม่ถูกยิงโดยคนที่เข้ามาแค่ดู
 */
function TeamEditor({
  team,
  onClose,
}: {
  team: SupportTeam | null;
  onClose: () => void;
}): React.JSX.Element {
  const companies = useCompanies();
  const candidates = useTeamCandidates(true);
  const create = useCreateTeam();
  const update = useUpdateTeam();

  const handleSubmit = async (values: TeamFormValues): Promise<void> => {
    const name = values.name.trim();
    const code = values.code.trim();
    const body = {
      name,
      description: values.description.trim(),
      company_id: values.company_id,
      lead_ids: values.lead_ids,
      /*
       * หัวหน้าทุกคนต้องอยู่ใน member_ids ด้วย
       *
       * ฟอร์มติ๊กให้แล้วตอนเลือก แต่รวมซ้ำตรงนี้อีกชั้นเพราะรายการทั้งสองชุด
       * แทนที่สมาชิกทั้งทีม ถ้าหลุดไปแม้แต่คนเดียว คนนั้นจะถูกถอดออกจากทีม
       */
      member_ids: Array.from(new Set([...values.member_ids, ...values.lead_ids])),
    };

    if (team) {
      await update.mutateAsync({
        id: team.id,
        ...body,
        ...(code ? { code } : {}),
        is_active: values.is_active,
      });
      toast.success(`ບັນທຶກທີມ ${name} ແລ້ວ`);
      return;
    }

    await create.mutateAsync({ ...body, ...(code ? { code } : {}) });
    toast.success(`ສ້າງທີມ ${name} ແລ້ວ`);
  };

  return (
    <TeamFormDialog
      open
      team={team}
      companies={companies.data ?? []}
      candidates={candidates.data ?? []}
      candidatesLoading={candidates.isPending}
      onClose={onClose}
      onSubmit={handleSubmit}
    />
  );
}
