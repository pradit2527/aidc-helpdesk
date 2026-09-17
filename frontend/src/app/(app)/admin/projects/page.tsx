'use client';

import { AlertTriangle, CheckCircle2, CircleSlash, Globe, Link2, Pencil, Plus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { EmbedSnippet } from '@/components/admin/embed-snippet';
import {
  SupportProjectFormDialog,
  type SupportProjectFormValues,
} from '@/components/admin/support-project-form-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/data-table';
import { Alert, PageHeader } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { useCategories, useCompanies } from '@/lib/queries/master-data';
import {
  embedSnippet,
  useCreateSupportProject,
  useSupportProjects,
  useUpdateSupportProject,
  type SupportProject,
} from '@/lib/queries/support-projects';
import { useSupportTeams } from '@/lib/queries/teams';
import { useCan, useSession } from '@/lib/session';

/**
 * ໂຄງການທີ່ຮັບຊັບພອດ — เว็บของบริษัทที่ฝังปุ่มแชทของ Helpdesk ไว้
 *
 * หนึ่งแถวในหน้านี้ = หนึ่งเว็บ = หนึ่ง inbox ใน Chatwoot แชทที่เข้ามาจากเว็บนั้น
 * จะไปโผล่ในกล่องแชทเดียวกับที่ทีมไอทีใช้อยู่แล้ว ติดป้ายรหัสโครงการไว้
 *
 * เป้าหมายของหน้านี้คือทำให้ทีมอื่น "ติดตั้งเองได้" — ผู้ดูแลลงทะเบียนโครงการ
 * แล้วส่งสคริปต์บรรทัดเดียวให้เขาไปวาง ไม่ต้องอธิบายว่า Chatwoot คืออะไร
 *
 * ⚠️ การซ่อนปุ่มแก้ไขเป็นเรื่องประสบการณ์ผู้ใช้ ไม่ใช่มาตรการความปลอดภัย
 *    backend ตรวจ user.assign_role ซ้ำทุกคำขอเขียนอยู่แล้ว
 */
export default function SupportProjectsPage(): React.JSX.Element {
  const canManage = useCan('user.assign_role');
  const projects = useSupportProjects();

  const [editing, setEditing] = React.useState<SupportProject | null>(null);
  const [creating, setCreating] = React.useState(false);

  /*
   * origin ของสคริปต์อ่านตอนรันในเบราว์เซอร์เท่านั้น
   *
   * ระหว่าง render ครั้งแรกฝั่งเซิร์ฟเวอร์ไม่มี window และ Next จะเทียบผลสองฝั่ง
   * แล้วเตือน hydration mismatch ถ้าเราเดาค่าไว้ล่วงหน้า — ปล่อยว่างไว้ก่อน
   * แล้วเติมทีหลังจึงเป็นทางเดียวที่ได้ค่าจริงโดยไม่ทำให้หน้าพัง
   */
  const [origin, setOrigin] = React.useState('');
  React.useEffect(() => setOrigin(window.location.origin), []);

  const closeDialog = React.useCallback(() => {
    setCreating(false);
    setEditing(null);
  }, []);

  const rows = projects.data ?? [];
  /*
   * "ใช้งานไม่ได้" มีสองสาเหตุที่หน้าตาเหมือนกันเป๊ะสำหรับคนที่เอาสคริปต์ไปวาง
   * คือยังไม่เชื่อม Chatwoot กับถูกปิดไว้ — ทั้งสองอย่างจบลงที่ "ปุ่มแชทไม่ขึ้น"
   * นับรวมกันตรงนี้ เพราะผู้ดูแลต้องรู้จำนวนเว็บที่ตอนนี้ยังไม่ได้ให้บริการจริง
   */
  const notWorking = rows.filter((p) => p.chatwoot.inbox_id === null || !p.is_active).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ໂຄງການທີ່ຮັບຊັບພອດ"
        description="ເວັບຂອງບໍລິສັດທີ່ຝັງປຸ່ມແຊັດຂອງ Helpdesk ໄວ້ — ແຊັດຈາກເວັບເຫຼົ່ານີ້ເຂົ້າມາທີ່ກ່ອງແຊັດດຽວກັນ"
        actions={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              ເພີ່ມໂຄງການ
            </Button>
          ) : undefined
        }
      />

      {!canManage && (
        <Alert tone="info" title="ເບິ່ງໄດ້ຢ່າງດຽວ">
          ການເພີ່ມ ຫຼື ແກ້ໄຂໂຄງການເຮັດໄດ້ໂດຍຜູ້ດູແລທີ່ມີສິດຈັດການບົດບາດຜູ້ໃຊ້ເທົ່ານັ້ນ
        </Alert>
      )}

      {notWorking > 0 && (
        <Alert tone="warning" title={`ຍັງໃຊ້ງານບໍ່ໄດ້ຢູ່ ${notWorking} ໂຄງການ`}>
          ໂຄງການທີ່ຍັງບໍ່ເຊື່ອມ Chatwoot ຫຼື ຖືກປິດໄວ້ ຈະບໍ່ມີປຸ່ມແຊັດຂຶ້ນໃນເວັບຂອງມັນ
          ເຖິງວ່າຈະຕິດຕັ້ງສະຄຣິບຖືກຕ້ອງແລ້ວກໍ່ຕາມ
        </Alert>
      )}

      <Card>
        <QueryBoundary query={projects} loadingLabel="ກຳລັງໂຫຼດລາຍການໂຄງການ">
          {rows.length === 0 ? (
            <EmptyState
              icon={Globe}
              title="ຍັງບໍ່ມີໂຄງການທີ່ຮັບຊັບພອດ"
              hint={
                canManage
                  ? 'ເພີ່ມໂຄງການ ແລ້ວສົ່ງສະຄຣິບບັນທັດດຽວໃຫ້ທີມທີ່ດູແລເວັບນັ້ນເອົາໄປວາງ'
                  : 'ໃຫ້ຜູ້ດູແລລະບົບເພີ່ມໂຄງການຂອງເວັບທ່ານກ່ອນ'
              }
            />
          ) : (
            <ul className="divide-y divide-hair">
              {rows.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  origin={origin}
                  canManage={canManage}
                  onEdit={() => setEditing(project)}
                />
              ))}
            </ul>
          )}
        </QueryBoundary>
      </Card>

      {/*
        กล่องแก้ไขถูกประกอบขึ้นเมื่อเปิดเท่านั้น รายการบริษัท หมวดหมู่ และทีม
        จึงไม่ถูกดึงมาเปล่า ๆ ตอนที่คนเข้ามาแค่ดูว่ามีโครงการอะไรบ้าง
      */}
      {canManage && (creating || editing !== null) && (
        <ProjectEditor project={editing} onClose={closeDialog} />
      )}
    </div>
  );
}

function ProjectRow({
  project,
  origin,
  canManage,
  onEdit,
}: {
  project: SupportProject;
  origin: string;
  canManage: boolean;
  onEdit: () => void;
}): React.JSX.Element {
  const linked = project.chatwoot.inbox_id !== null;
  /* "พร้อมให้ติดตั้ง" = เชื่อม Chatwoot แล้ว และเปิดใช้งานอยู่ ขาดข้อใดข้อหนึ่ง widget ก็ไม่โหลด */
  const ready = linked && project.is_active;

  return (
    <li className="px-4 py-4 lg:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body font-semibold text-ink">{project.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-3">
            <span className="font-mono">{project.code}</span>
            <span aria-hidden="true">·</span>
            {/* โครงการส่วนกลางใช้ได้ทุกบริษัท ต้องอ่านออกทันทีว่าอันไหนเป็นแบบไหน */}
            <span>{project.company?.code ?? 'ສ່ວນກາງ'}</span>
            {project.website_url && (
              <>
                <span aria-hidden="true">·</span>
                <a
                  href={project.website_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="min-w-0 truncate hover:text-primary hover:underline"
                >
                  {project.website_url}
                </a>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-none items-center gap-2">
          {/*
            ป้ายเปิด/ปิดต้องอ่านออกโดยไม่ต้องเห็นสี
            "ปิดอยู่" ไม่ใช่สถานะเฉย ๆ แต่แปลว่า widget ในเว็บนั้นไม่ทำงานเลย
            เท่ากับรหัสที่ไม่มีอยู่จริง จึงเขียนคำเต็มคู่ไอคอน ไม่ใช่แค่คำว่า "ປິດ" จาง ๆ
          */}
          {project.is_active ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-sla-ok-bg px-2 py-0.5 text-caption text-sla-ok">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              ໃຊ້ງານຢູ່
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-subtle px-2 py-0.5 text-caption text-ink-2">
              <CircleSlash className="h-3.5 w-3.5" aria-hidden="true" />
              ປິດໃຊ້ງານຢູ່
            </span>
          )}
          {canManage && (
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">ແກ້ໄຂ {project.name}</span>
            </Button>
          )}
        </div>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <dt className="text-caption text-ink-3">ໝວດໝູ່ຕັ້ງຕົ້ນ</dt>
          <dd className="min-w-0 text-body-sm text-ink">
            {project.default_category?.name ?? <span className="text-ink-3">ບໍ່ກຳນົດ</span>}
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <dt className="text-caption text-ink-3">ທີມທີ່ຮັບຜິດຊອບ</dt>
          <dd className="min-w-0 text-body-sm text-ink">
            {project.team?.name ?? <span className="text-ink-3">ບໍ່ກຳນົດ</span>}
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <dt className="text-caption text-ink-3">ສະຖານະການເຊື່ອມ</dt>
          <dd className="min-w-0 text-body-sm text-ink">
            {/*
              ป้าย "ยังไม่เชื่อม" ต้องอ่านออกโดยไม่ต้องเห็นสี — มีทั้งไอคอนและข้อความ
              เพราะนี่คือสาเหตุอันดับหนึ่งของ "ติดตั้งแล้วปุ่มแชทไม่ขึ้น"
            */}
            {linked ? (
              <span className="inline-flex items-center gap-1">
                <Link2 className="h-4 w-4 text-ink-3" aria-hidden="true" />
                inbox #{project.chatwoot.inbox_id}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-sla-risk">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                ຍັງບໍ່ເຊື່ອມ Chatwoot
              </span>
            )}
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <dt className="text-caption text-ink-3">ແຊັດທີ່ກຳລັງສົນທະນາ</dt>
          <dd className="tabular min-w-0 text-body-sm text-ink">{project.open_chats}</dd>
        </div>
      </dl>

      {/*
        สคริปต์ติดตั้งแสดงเฉพาะโครงการที่ "ใช้ได้จริงเดี๋ยวนี้" เท่านั้น

        ถ้าโชว์ตั้งแต่ยังไม่เชื่อมหรือยังปิดอยู่ จะมีคนส่งให้ทีมอื่นไปวาง แล้วทั้งสองฝ่าย
        ไปเสียเวลาหาสาเหตุว่าทำไมปุ่มไม่ขึ้น ทั้งที่สาเหตุอยู่ตรงนี้เอง
        จึงแสดง "สิ่งที่ยังขาด" แทนที่จะแสดงสคริปต์ที่วางไปแล้วก็ไม่ทำงาน
      */}
      {ready && origin !== '' ? (
        <div className="mt-3 space-y-1.5">
          <EmbedSnippet
            snippet={embedSnippet(project.code, origin)}
            label={`ສະຄຣິບຂອງ ${project.code}`}
          />
          <p className="text-caption text-ink-3">
            ສຳລັບເວັບທີ່ມີການເຂົ້າສູ່ລະບົບ: ເອີ້ນ{' '}
            <code className="font-mono text-ink-2">AIDCSupport.identify(&#123;...&#125;)</code>{' '}
            ຫຼັງຜູ້ໃຊ້ລ໋ອກອິນ ເພື່ອໃຫ້ທີມໄອທີເຫັນວ່າກຳລັງຄຸຍກັບໃຜ —
            ວິທີຄິດຄ່າ hash ຢູ່ໃນ README ຂອງ packages/support-kit
          </p>
        </div>
      ) : (
        <div className="mt-3 rounded border border-hair bg-subtle px-3 py-2">
          <p className="flex items-center gap-1.5 text-body-sm font-semibold text-ink">
            <AlertTriangle className="h-4 w-4 flex-none" aria-hidden="true" />
            ຍັງບໍ່ພ້ອມໃຫ້ຕິດຕັ້ງ
          </p>
          <ul className="mt-1 list-inside list-disc text-caption text-ink-2">
            {!linked && <li>ຍັງບໍ່ໄດ້ເຊື່ອມກັບ inbox ຂອງ Chatwoot</li>}
            {!project.is_active && (
              <li>
                ໂຄງການຖືກປິດໄວ້ — widget ຈະບໍ່ໂຫຼດເລີຍ ຄືກັນກັບລະຫັດທີ່ບໍ່ມີໃນລະບົບ
              </li>
            )}
          </ul>
        </div>
      )}
    </li>
  );
}

/**
 * ตัวห่อกล่องแก้ไข — ดึงข้อมูลที่ใช้เฉพาะตอนแก้ไข
 *
 * แยกออกมาเพราะ hook เรียกตามเงื่อนไขไม่ได้ การมีคอมโพเนนต์ที่ถูกประกอบ
 * เฉพาะตอนเปิดกล่อง คือวิธีเดียวที่ทำให้รายการบริษัท หมวดหมู่ และทีม
 * ไม่ถูกดึงโดยคนที่เข้ามาแค่ดู
 */
function ProjectEditor({
  project,
  onClose,
}: {
  project: SupportProject | null;
  onClose: () => void;
}): React.JSX.Element {
  const { user } = useSession();
  const companies = useCompanies();
  const categories = useCategories();
  const teams = useSupportTeams();
  const create = useCreateSupportProject();
  const update = useUpdateSupportProject();

  const handleSubmit = async (values: SupportProjectFormValues): Promise<void> => {
    const name = values.name.trim();
    const website = values.website_url.trim();
    const inboxId = values.chatwoot_inbox_id.trim();
    const token = values.chatwoot_website_token.trim();

    /* ช่องที่ผู้ใช้ล้างทิ้งต้องส่งเป็น null ไม่ใช่สตริงว่าง — null คือ "ไม่มีค่า" ที่ backend เข้าใจ */
    const body = {
      name,
      website_url: website === '' ? null : website,
      company_id: values.company_id,
      default_category_id: values.default_category_id,
      team_id: values.team_id,
      chatwoot_inbox_id: inboxId === '' ? null : Number(inboxId),
      chatwoot_website_token: token === '' ? null : token,
      locale: values.locale,
    };

    if (project) {
      await update.mutateAsync({ id: project.id, ...body, is_active: values.is_active });
      toast.success(`ບັນທຶກໂຄງການ ${name} ແລ້ວ`);
      return;
    }

    await create.mutateAsync({ ...body, code: values.code });
    toast.success(`ເພີ່ມໂຄງການ ${name} ແລ້ວ`);
  };

  return (
    <SupportProjectFormDialog
      open
      project={project}
      companies={companies.data ?? []}
      categories={categories.data ?? []}
      teams={teams.data ?? []}
      canCreateCentral={user.roles.includes('super_admin')}
      onClose={onClose}
      onSubmit={handleSubmit}
    />
  );
}
