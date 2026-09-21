'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Info,
  Lock,
  Paperclip,
  RotateCcw,
  Send,
  ShieldCheck,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { PriorityBadge } from '@/components/common/badges';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Avatar, DefRow, PageHeader } from '@/components/ui/misc';
import {
  IMPACT_OPTIONS,
  PRIORITY,
  PRIORITY_MATRIX,
  TICKET_STATUS,
  TICKET_TYPE,
  URGENCY_OPTIONS,
  previewPriority,
} from '@/config/enums';
import { SERVICE_TIER, type ServiceTier } from '@/config/admin';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatFileSize, formatMinutes } from '@/lib/format';
import { masterKeys, useActiveCategories, useCatalogItems } from '@/lib/queries/master-data';
import { useUsers } from '@/lib/queries/operations';
import { useCreateTicket, useUploadAttachments, type CreateTicketInput } from '@/lib/queries/tickets';
import { useCan, useSession } from '@/lib/session';
import type {
  Department,
  ServiceRecord,
  SessionUser,
  SlaPolicy,
  TicketCategory,
} from '@/lib/types';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const SUBJECT_MIN = 10;
const SUBJECT_MAX = 255;
const DESCRIPTION_MIN = 10;
const MASTER_DATA_STALE_MS = 5 * 60_000;

type TicketTypeKey = keyof typeof TICKET_TYPE;

/**
 * การ์ดเลือกประเภทเรื่อง
 *
 * ผู้แจ้งทั่วไปแยกศัพท์ ITIL "เหตุขัดข้อง" กับ "คำขอบริการ" ไม่ออก จึงไม่ใช้ชื่ออย่างเดียว
 * แต่ละใบบอกด้วยภาษาคนทำงานว่าใช้เมื่อไร และเลือกแล้วเกิดอะไรขึ้น
 *
 * ไม่มี Change Request เหมือนต้นแบบ — backend รับได้แค่ incident / service_request
 * ถ้าใส่การ์ดที่ส่งไม่ได้ ผู้ใช้จะกรอกครบแล้วเจอ 422 ตอนกดส่ง
 */
const TYPE_CARDS: readonly {
  value: TicketTypeKey;
  code: string;
  english: string;
  icon: LucideIcon;
  description: string;
  consequence: string;
}[] = [
  {
    value: 'incident',
    code: 'INC',
    english: 'Incident',
    icon: AlertTriangle,
    description: 'ບໍລິການທີ່ໃຊ້ຢູ່ຢຸດຊະງັກ ເຮັດວຽກຜິດປົກກະຕິ ຫຼື ຄຸນນະພາບຫຼຸດລົງ',
    consequence: 'ສະຖານະເລີ່ມຕົ້ນ ໃໝ່ · ເລີ່ມນັບເວລາ SLA ທັນທີທີ່ສົ່ງ',
  },
  {
    value: 'service_request',
    code: 'SR',
    english: 'Service Request',
    icon: ClipboardList,
    description: 'ຂໍບໍລິການຕາມລາຍການ ເຊັ່ນ ຂໍສິດເຂົ້າລະບົບ ຂໍອຸປະກອນ ຂໍຕິດຕັ້ງໂປຣແກຣມ',
    consequence: 'ເລືອກຈາກລາຍການບໍລິການ · ລາຍການທີ່ຕ້ອງອະນຸມັດຈະລໍຖ້າອະນຸມັດກ່ອນ',
  },
];

/**
 * หมวดนี้ใช้กับประเภทเรื่องที่เลือกอยู่ได้ไหม
 *
 * ⚠️ หมวดที่ API ไม่ได้ส่ง ticket_type_scope มาถือว่าใช้ได้ทั้งคู่
 *
 *    ค่าที่หายไปต้อง "ไม่กรอง" ไม่ใช่ "กรองทิ้ง" — ถ้าตีความกลับกัน ระบบที่รัน
 *    frontend รุ่นใหม่คู่กับ backend รุ่นเก่าจะได้ dropdown หมวดว่างเปล่า
 *    ซึ่งแปลว่าไม่มีใครแจ้งเรื่องได้เลยทั้งองค์กร
 */
function categoryAllowsType(category: TicketCategory, ticketType: TicketTypeKey): boolean {
  const scope = category.ticket_type_scope;
  return scope === undefined || scope === 'both' || scope === ticketType;
}

/** คำอธิบายใต้ตัวเลือก — ช่วยให้ผู้แจ้งตอบตรงกับเกณฑ์ในเอกสาร SLA ข้อ 4 */
const IMPACT_DETAIL: Record<string, string> = {
  org_wide: 'ກະທົບທັງບໍລິສັດ ຫຼື ລະບົບສຳຄັນຢຸດໃຫ້ບໍລິການ',
  department: 'ກະທົບຫຼາຍຄົນ ຫຼື ທັງພະແນກ',
  individual: 'ກະທົບຜູ້ໃຊ້ຄົນດຽວ ຫຼື ອຸປະກອນເຄື່ອງດຽວ',
};

const URGENCY_DETAIL: Record<string, string> = {
  high: 'ວຽກຢຸດ ບໍ່ມີທາງລ່ຽງ ຕ້ອງແກ້ດຽວນີ້',
  medium: 'ເຮັດວຽກໄດ້ບາງສ່ວນ ຫຼື ມີທາງລ່ຽງຊົ່ວຄາວ',
  low: 'ລໍຖ້າໄດ້ ບໍ່ກະທົບວຽກຮີບດ່ວນ',
};

/** เรียงหนักไปเบาเหมือนตารางในเอกสารควบคุม */
const IMPACT_ORDER = ['org_wide', 'department', 'individual'] as const;
const URGENCY_ORDER = ['high', 'medium', 'low'] as const;

interface FormState {
  ticket_type: TicketTypeKey;
  company_id: string;
  department_id: string;
  phone: string;
  location: string;
  on_behalf: boolean;
  requester_id: string;
  parent_category_id: string;
  subcategory_id: string;
  catalog_item_id: string;
  service_id: string;
  subject: string;
  description: string;
  asset_tag: string;
  impact: string;
  urgency: string;
}

function initialForm(user: SessionUser): FormState {
  return {
    ticket_type: 'incident',
    company_id: String(user.company.id),
    department_id: user.department ? String(user.department.id) : '',
    phone: '',
    location: '',
    on_behalf: false,
    requester_id: '',
    parent_category_id: '',
    subcategory_id: '',
    catalog_item_id: '',
    service_id: '',
    subject: '',
    description: '',
    asset_tag: '',
    impact: 'individual',
    urgency: 'medium',
  };
}

/**
 * ข้อมูลหลักที่บางบทบาทไม่มีสิทธิ์อ่าน
 *
 * ผู้แจ้งทั่วไปอ่าน /departments, /services, /sla-policies ไม่ได้ — ถ้ายิงไปตรง ๆ
 * จะได้ 403 ทุกครั้งที่เปิดหน้า จึงยิงเฉพาะเมื่อมีสิทธิ์ ส่วนที่เหลือแสดงจากข้อมูลในเซสชันแทน
 * ใช้คีย์แคชเดียวกับ master-data.ts เพื่อแชร์ผลกับหน้าผู้ดูแล
 */
function useOptionalMaster<T>(name: string, path: string, enabled: boolean) {
  return useQuery({
    queryKey: masterKeys.of(name),
    queryFn: () => api.get<T[]>(path),
    staleTime: MASTER_DATA_STALE_MS,
    enabled,
  });
}

/**
 * เปิด Ticket ใหม่ (US-01)
 *
 * ⚠️ ฟอร์มนี้ไม่มีช่องให้เลือก priority และจะไม่มีตลอดไป
 *    ผู้แจ้งตอบสองคำถามคือ "กระทบใครบ้าง" กับ "เร่งด่วนแค่ไหน"
 *    แล้วระบบคำนวณระดับให้ตามเมทริกซ์ (SLA ข้อ 4)
 *    ถ้าส่ง priority ตรง ๆ backend ตอบ 422 — และควรตอบแบบนั้น
 *
 * ⚠️ ทุกช่องต้องถูกบันทึกจริง — ต้นแบบมีช่องที่ backend ยังไม่มีที่เก็บ
 *    (ชั้นความลับ ผู้อนุมัติ แผนย้อนกลับ CI) ช่องเหล่านั้นไม่ใส่ไว้ เพราะฟอร์มนี้อ้างว่าเป็นหลักฐาน
 *    ช่องที่ผู้แจ้งกรอกแต่ backend ไม่มีคอลัมน์ (เบอร์โทร สถานที่) ต่อท้ายไว้ในรายละเอียด
 *    ทีมไอทีจึงเห็นในเรื่องที่แจ้งทุกครั้ง
 *
 * ระดับที่แสดงระหว่างกรอกเป็นเพียง "ตัวอย่าง" ค่าจริงยึดจากที่ backend ส่งกลับ
 */
export default function NewTicketPage(): React.JSX.Element {
  const router = useRouter();
  const { user } = useSession();

  const canCreateForOther = useCan('ticket.create_for_other');
  const canReadUsers = useCan('user.read');
  const canReadDepartments = useCan('department.manage', 'user.read');
  const canReadServices = useCan('service.manage', 'ticket.read');
  const canReadSla = useCan('sla.read', 'sla.manage');

  const [form, setForm] = React.useState<FormState>(() => initialForm(user));
  const [files, setFiles] = React.useState<File[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [dragging, setDragging] = React.useState(false);

  const categories = useActiveCategories();
  const catalogItems = useCatalogItems();
  const departments = useOptionalMaster<Department>('departments', '/departments', canReadDepartments);
  const services = useOptionalMaster<ServiceRecord>('services', '/services', canReadServices);
  const slaPolicies = useOptionalMaster<SlaPolicy>('sla-policies', '/sla-policies', canReadSla);

  const createTicket = useCreateTicket();
  const uploadFiles = useUploadAttachments();
  const submitting = createTicket.isPending || uploadFiles.isPending;

  const companyId = Number(form.company_id);
  // บริษัทที่เลือกได้มาจากขอบเขตสิทธิ์ในเซสชัน — ไม่ต้องขอสิทธิ์อ่าน /companies เพิ่ม
  const companyOptions = React.useMemo(() => {
    const seen = new Map<number, { id: number; code: string; name_th?: string }>();
    seen.set(user.company.id, user.company);
    for (const c of user.scoped_companies) seen.set(c.id, c);
    return [...seen.values()];
  }, [user.company, user.scoped_companies]);

  const forCompany = <T extends { company: { id: number } | null }>(rows: readonly T[]): T[] =>
    rows.filter((row) => row.company === null || row.company.id === companyId);

  const allCategories = forCompany(categories.data ?? []);
  /*
   * หมวดที่เลือกได้จริงสำหรับประเภทที่กำลังเลือกอยู่
   *
   * แยกจาก allCategories เพราะการ "ค้นหาหมวดตาม id" (เติมค่าตั้งต้น และหมวดที่มากับ
   * รายการบริการ) ต้องค้นจากชุดเต็มเสมอ ไม่งั้นหมวดที่ถูกกรองออกไปจะหาไม่เจอ
   * แล้วค่าตั้งต้นของผลกระทบ/ความเร่งด่วนจะเงียบหายไปโดยไม่มีอะไรฟ้อง
   */
  const typedCategories = allCategories.filter((c) => categoryAllowsType(c, form.ticket_type));
  const parentCategories = typedCategories
    .filter((c) => c.parent_id === null)
    .sort((a, b) => a.sort_order - b.sort_order);
  const subcategories = typedCategories
    .filter((c) => form.parent_category_id !== '' && String(c.parent_id) === form.parent_category_id)
    .sort((a, b) => a.sort_order - b.sort_order);
  // นับเฉพาะหมวดย่อยที่ประเภทนี้ใช้ได้ ไม่งั้นป้าย "3 ໝວດຍ່ອຍ" จะไม่ตรงกับที่เปิดออกมาเห็น
  const childCount = new Map<number, number>();
  for (const c of typedCategories) {
    if (c.parent_id !== null) childCount.set(c.parent_id, (childCount.get(c.parent_id) ?? 0) + 1);
  }

  /**
   * สลับการ์ดประเภทเรื่อง
   *
   * หมวดที่เลือกไว้อาจใช้กับประเภทใหม่ไม่ได้ ถ้าปล่อยค้างไว้ ช่องจะแสดงว่าง ๆ
   * (เพราะ option หายไปจาก dropdown) ทั้งที่ค่าใน state ยังอยู่ แล้วผู้แจ้งจะกดส่ง
   * ด้วยหมวดที่มองไม่เห็นและไม่ถูกต้อง — ได้ 422 จากเซิร์ฟเวอร์โดยไม่รู้ว่าผิดตรงไหน
   * จึงล้างเฉพาะค่าที่ใช้ไม่ได้แล้ว และเก็บค่าที่ยังใช้ได้ไว้ ไม่ต้องเลือกซ้ำโดยไม่จำเป็น
   */
  function changeTicketType(next: TicketTypeKey): void {
    const stillValid = (id: string): boolean => {
      if (id === '') return false;
      const category = allCategories.find((c) => String(c.id) === id);
      return category !== undefined && categoryAllowsType(category, next);
    };
    const keepParent = stillValid(form.parent_category_id);
    const keepSub = keepParent && stillValid(form.subcategory_id);

    setForm((prev) => ({
      ...prev,
      ticket_type: next,
      // รายการบริการเป็นของคำขอบริการเท่านั้น สลับไป incident แล้วต้องไม่ติดไปด้วย
      catalog_item_id: '',
      parent_category_id: keepParent ? prev.parent_category_id : '',
      subcategory_id: keepSub ? prev.subcategory_id : '',
    }));
    setErrors((prev) => {
      const nextErrors = { ...prev };
      delete nextErrors.catalog_item_id;
      delete nextErrors.parent_category_id;
      delete nextErrors.subcategory_id;
      return nextErrors;
    });
    if (!keepParent && form.parent_category_id !== '') {
      toast.info(`ໝວດໝູ່ທີ່ເລືອກໄວ້ໃຊ້ກັບ «${TICKET_TYPE[next]}» ບໍ່ໄດ້ ກະລຸນາເລືອກໃໝ່`);
    }
  }
  const selectedParent = parentCategories.find((c) => String(c.id) === form.parent_category_id) ?? null;
  const selectedSub = subcategories.find((c) => String(c.id) === form.subcategory_id) ?? null;
  // หมวดที่ไม่มีหมวดย่อยเลือกเป็นปลายทางได้เอง ไม่บังคับให้เลือกช่องที่ว่างเปล่า
  const categoryId =
    form.subcategory_id || (form.parent_category_id && subcategories.length === 0 ? form.parent_category_id : '');

  const activeCatalog = forCompany(catalogItems.data ?? []).filter((item) => item.is_active);
  const selectedCatalog = activeCatalog.find((item) => String(item.id) === form.catalog_item_id) ?? null;
  const departmentOptions = forCompany(departments.data ?? []).filter((d) => d.is_active);
  const serviceOptions = forCompany(services.data ?? []).filter((s) => s.is_active);
  const selectedService = serviceOptions.find((s) => String(s.id) === form.service_id) ?? null;

  const priority = previewPriority(form.impact, form.urgency);
  const policy = React.useMemo(() => {
    const list = slaPolicies.data ?? [];
    return (
      list.find((p) => p.company?.id === companyId && p.is_default) ??
      list.find((p) => p.company === null && p.is_default) ??
      list[0] ??
      null
    );
  }, [slaPolicies.data, companyId]);
  const target = priority ? (policy?.targets.find((t) => t.priority === priority) ?? null) : null;

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  }

  /** เติมผลกระทบและความเร่งด่วนตั้งต้นของหมวด แต่ผู้แจ้งแก้ได้เสมอ */
  function applyCategoryDefaults(id: string): void {
    const category = allCategories.find((c) => String(c.id) === id);
    if (category) {
      setForm((prev) => ({ ...prev, impact: category.default_impact, urgency: category.default_urgency }));
    }
  }

  function addFiles(picked: File[]): void {
    const tooBig = picked.filter((f) => f.size > MAX_UPLOAD_BYTES);
    if (tooBig.length > 0) {
      toast.error(`ໄຟລ໌ໃຫຍ່ເກີນ 20 MB: ${tooBig.map((f) => f.name).join(', ')}`);
    }
    setFiles((prev) => [...prev, ...picked.filter((f) => f.size <= MAX_UPLOAD_BYTES)]);
  }

  /** รายการช่องบังคับ — ใช้ทั้งตรวจตอนส่งและมาตรวัดความครบถ้วนด้านขวา */
  const checks: { key: string; label: string; ok: boolean; message: string }[] = [
    {
      key: 'phone',
      label: 'ເບີໂທຕິດຕໍ່ກັບ',
      ok: form.phone.trim().length >= 4,
      message: 'ກະລຸນາລະບຸເບີໂທຕິດຕໍ່ກັບ',
    },
    {
      key: 'location',
      label: 'ສະຖານທີ່ / ຈຸດເກີດເຫດ',
      ok: form.location.trim().length >= 3,
      message: 'ກະລຸນາລະບຸສະຖານທີ່ ຫຼື ຈຸດເກີດເຫດ',
    },
    ...(form.on_behalf
      ? [
          {
            key: 'requester_id',
            label: 'ຜູ້ໄດ້ຮັບຜົນກະທົບ',
            ok: form.requester_id !== '',
            message: 'ກະລຸນາເລືອກຜູ້ໄດ້ຮັບຜົນກະທົບ',
          },
        ]
      : []),
    ...(form.ticket_type === 'service_request'
      ? [
          {
            key: 'catalog_item_id',
            label: 'ລາຍການບໍລິການ',
            ok: form.catalog_item_id !== '',
            message: 'ຄຳຂໍບໍລິການຕ້ອງເລືອກລາຍການບໍລິການ',
          },
        ]
      : []),
    {
      key: 'parent_category_id',
      label: 'ໝວດໝູ່',
      ok: form.parent_category_id !== '',
      message: 'ກະລຸນາເລືອກໝວດໝູ່',
    },
    {
      key: 'subcategory_id',
      label: 'ໝວດໝູ່ຍ່ອຍ',
      ok: form.parent_category_id === '' || categoryId !== '',
      message: 'ກະລຸນາເລືອກໝວດໝູ່ຍ່ອຍ',
    },
    {
      key: 'subject',
      label: 'ຫົວຂໍ້ເລື່ອງ',
      ok: form.subject.trim().length >= SUBJECT_MIN,
      message: `ຫົວຂໍ້ຕ້ອງຍາວຢ່າງໜ້ອຍ ${SUBJECT_MIN} ຕົວອັກສອນ`,
    },
    {
      key: 'description',
      label: 'ລາຍລະອຽດ',
      ok: form.description.trim().length >= DESCRIPTION_MIN,
      message: `ກະລຸນາອະທິບາຍບັນຫາຢ່າງໜ້ອຍ ${DESCRIPTION_MIN} ຕົວອັກສອນ`,
    },
  ];
  const missing = checks.filter((c) => !c.ok);
  const done = checks.length - missing.length;

  const dirty =
    files.length > 0 ||
    JSON.stringify(form) !== JSON.stringify(initialForm(user));

  function resetForm(): void {
    if (dirty && !window.confirm('ລ້າງຂໍ້ມູນທີ່ກອກໄວ້ທັງໝົດບໍ?')) return;
    setForm(initialForm(user));
    setFiles([]);
    setErrors({});
  }

  /**
   * รายละเอียดที่ส่งจริง — ต่อข้อมูลติดต่อท้ายข้อความของผู้แจ้ง
   *
   * backend ยังไม่มีคอลัมน์เบอร์โทรและสถานที่ ถ้าไม่ต่อไว้ตรงนี้ ข้อมูลที่ผู้แจ้งตั้งใจกรอก
   * จะหายไปเงียบ ๆ ทั้งที่ทีมไอทีต้องใช้โทรกลับหรือเดินไปหน้างาน
   */
  function composeDescription(): string {
    return [
      form.description.trim(),
      '',
      '— ຂໍ້ມູນຕິດຕໍ່ —',
      `ເບີໂທຕິດຕໍ່ກັບ: ${form.phone.trim()}`,
      `ສະຖານທີ່ / ຈຸດເກີດເຫດ: ${form.location.trim()}`,
      ...(user.email ? [`ອີເມວ: ${user.email}`] : []),
    ].join('\n');
  }

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (missing.length > 0) {
      setErrors(Object.fromEntries(missing.map((c) => [c.key, c.message])));
      toast.error(`ຍັງກອກບໍ່ຄົບ ${missing.length} ຊ່ອງ`);
      // โฟกัสไปช่องแรกที่ผิด ไม่ให้ผู้ใช้ต้องไล่หาเองบนฟอร์มยาว
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }

    try {
      /*
       * อัปโหลดไฟล์ก่อน แล้วค่อยสร้างเรื่องพร้อม id ที่ได้ (B-08)
       *
       * ถ้าสร้างเรื่องก่อนแล้วอัปโหลดล้มเหลว จะได้เรื่องที่ไม่มีหลักฐานแนบโดยผู้แจ้งไม่รู้ตัว
       * ลำดับนี้ถ้าอัปโหลดล้มเหลว ผู้ใช้ยังอยู่ที่ฟอร์มพร้อมข้อมูลครบ กดใหม่ได้ทันที
       */
      const uploaded = files.length > 0 ? await uploadFiles.mutateAsync(files) : [];
      const mobile = window.matchMedia('(max-width: 767px)').matches;

      const input: CreateTicketInput = {
        ticket_type: form.ticket_type,
        subject: form.subject.trim(),
        description: composeDescription(),
        category_id: Number(categoryId),
        impact: form.impact,
        urgency: form.urgency,
        channel: 'portal',
        source_device: mobile ? 'mobile_web' : 'web',
        // ส่งบริษัทเฉพาะเมื่อเลือกต่างจากต้นสังกัด — ค่าเริ่มต้นฝั่ง backend คือบริษัทของผู้เรียกอยู่แล้ว
        ...(companyId !== user.company.id ? { company_id: companyId } : {}),
        ...(form.department_id ? { department_id: Number(form.department_id) } : {}),
        ...(form.service_id ? { service_id: Number(form.service_id) } : {}),
        ...(form.ticket_type === 'service_request' && form.catalog_item_id
          ? { catalog_item_id: Number(form.catalog_item_id) }
          : {}),
        ...(form.asset_tag.trim() ? { asset_tag: form.asset_tag.trim() } : {}),
        ...(form.on_behalf && form.requester_id ? { requester_id: Number(form.requester_id) } : {}),
        ...(uploaded.length > 0 ? { attachment_ids: uploaded.map((a) => a.id) } : {}),
      };
      const ticket = await createTicket.mutateAsync(input);

      // แสดงเลขที่จริงที่ backend ออกให้ ผู้แจ้งใช้เลขนี้อ้างอิงตอนโทรตาม
      toast.success(`ສົ່ງເລື່ອງແຈ້ງແລ້ວ — ເລກທີ ${ticket.ticket_no}`);
      router.push(`/tickets/${ticket.id}`);
    } catch (err) {
      // ผูกข้อความจากเซิร์ฟเวอร์กลับเข้าช่องที่ผิด ไม่ให้ผู้ใช้ต้องเดา
      const apiError = err instanceof ApiError ? err : null;
      if (apiError?.fields) {
        const fields = { ...apiError.fields };
        // ข้อผิดพลาดของหมวดชี้ไปช่องที่ผู้ใช้ต้องแก้จริง — ถ้ามีหมวดย่อยให้เลือก ปัญหาอยู่ที่ช่องหมวดย่อย
        if (fields.category_id) {
          if (subcategories.length > 0) fields.subcategory_id = fields.category_id;
          else fields.parent_category_id = fields.category_id;
        }
        setErrors(fields);
      }
      toast.error(apiError?.message ?? 'ສົ່ງເລື່ອງບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່');
    }
  }

  const typeMeta = TYPE_CARDS.find((t) => t.value === form.ticket_type);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="ເປີດ Ticket ໃໝ່"
        description="ແບບຟອມແຈ້ງເຫດຂັດຂ້ອງ ແລະ ຄຳຂໍບໍລິການ — ກອກຂໍ້ມູນໃຫ້ຄົບ ລະບົບຈະຄຳນວນລະດັບຄວາມສຳຄັນ ແລະ ກຳນົດເວລາຕາມ SLA ໃຫ້ອັດຕະໂນມັດ"
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={resetForm}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            ລ້າງແບບຟອມ
          </Button>
        }
      />

      <form onSubmit={onSubmit} noValidate>
        {/*
          มือถือเรียงคอลัมน์เดียวตามลำดับ DOM: ฟอร์ม → สรุปที่ระบบบันทึก → ปุ่มส่ง
          ผู้แจ้งจึงเห็นระดับความสำคัญและช่องที่ยังขาดก่อนถึงปุ่มส่ง ไม่ใช่หลังกดไปแล้ว
          จอใหญ่วางสรุปเป็นคอลัมน์ขวาที่ตามเลื่อน ส่วนปุ่มส่งกลับไปอยู่ใต้ฟอร์ม
        */}
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
          <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1">
            <div className="flex gap-3 rounded border border-hair border-l-4 border-l-primary bg-surface px-4 py-3">
              <Info className="mt-0.5 h-5 w-5 flex-none text-primary" aria-hidden="true" />
              <div className="text-body-sm text-ink-2">
                <p className="font-semibold text-ink">ຂໍ້ມູນທີ່ກອກຈະຖືກບັນທຶກເປັນຫຼັກຖານຕາມລະບົບບໍລິຫານຄຸນນະພາບ</p>
                ທຸກຊ່ອງໃນແບບຟອມນີ້ຖືກຈັດເກັບເປັນເອກະສານ (Documented Information) ຕາມ ISO/IEC 20000-1:2018 ຂໍ້ 7.5
                ແລະ ສອບກັບໄດ້ຕາມ ISO 9001:2015 ຂໍ້ 8.5.2
              </div>
            </div>

            {/* ── 1 ผู้แจ้ง ───────────────────────────────────────── */}
            <Section step={1} title="ຂໍ້ມູນຜູ້ແຈ້ງ ແລະ ຜູ້ໄດ້ຮັບຜົນກະທົບ" hint="ດຶງຈາກບັນຊີຜູ້ໃຊ້ທີ່ເຂົ້າສູ່ລະບົບ">
              <div className="space-y-1.5">
                <p className="text-label text-ink">ຜູ້ແຈ້ງເລື່ອງ (Reported by)</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-dashed border-control bg-subtle px-3 py-2.5">
                  <Avatar name={user.full_name} size="sm" />
                  <span className="text-body-sm font-semibold text-ink">{user.full_name}</span>
                  <span className="min-w-0 text-caption text-ink-2 [overflow-wrap:anywhere]">
                    {[user.email, user.username, user.job_title].filter(Boolean).join(' · ')}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary-subtle px-2 py-0.5 text-caption font-semibold text-primary">
                    <Lock className="h-3 w-3" aria-hidden="true" />
                    ອ່ານຢ່າງດຽວ
                  </span>
                </div>
                <p className="text-caption text-ink-3">
                  ຂໍ້ມູນຜູ້ແຈ້ງຜູກກັບບັນຊີທີ່ເຂົ້າສູ່ລະບົບ ແກ້ໄຂບໍ່ໄດ້ ເພື່ອຮັກສາຄວາມຖືກຕ້ອງຂອງຫຼັກຖານ
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="ບໍລິສັດໃນເຄືອ" htmlFor="company_id" required>
                  <Select
                    value={form.company_id}
                    disabled={companyOptions.length < 2}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        company_id: e.target.value,
                        // หมวด แผนก และรายการบริการผูกกับบริษัท — เปลี่ยนบริษัทแล้วค่าเดิมอาจใช้ไม่ได้
                        department_id: '',
                        parent_category_id: '',
                        subcategory_id: '',
                        catalog_item_id: '',
                        service_id: '',
                        requester_id: '',
                      }))
                    }
                  >
                    {companyOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name_th ? `${c.code} — ${c.name_th}` : c.code}
                      </option>
                    ))}
                  </Select>
                </Field>

                {canReadDepartments ? (
                  <Field label="ພະແນກ / ໜ່ວຍງານ" htmlFor="department_id">
                    <Select value={form.department_id} onChange={(e) => set('department_id', e.target.value)}>
                      <option value="">— ເລືອກພະແນກ —</option>
                      {departmentOptions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <Field label="ພະແນກ / ໜ່ວຍງານ" htmlFor="department_ro">
                    <Input value={user.department?.name ?? '—'} readOnly disabled />
                  </Field>
                )}

                <Field label="ເບີໂທຕິດຕໍ່ກັບ" htmlFor="phone" required error={errors.phone}>
                  <Input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={form.phone}
                    maxLength={50}
                    onChange={(e) => set('phone', e.target.value)}
                    placeholder="ເຊັ່ນ 020 5555 1234 ຫຼື ຕໍ່ 1204"
                  />
                </Field>

                <Field label="ອີເມວຕິດຕໍ່" htmlFor="email_ro">
                  <Input value={user.email ?? '—'} readOnly disabled />
                </Field>

                <Field
                  label="ສະຖານທີ່ນັ່ງເຮັດວຽກ / ຈຸດເກີດເຫດ"
                  htmlFor="location"
                  required
                  error={errors.location}
                  className="md:col-span-2"
                >
                  <Input
                    value={form.location}
                    maxLength={200}
                    onChange={(e) => set('location', e.target.value)}
                    placeholder="ເຊັ່ນ ອາຄານ HQ ຊັ້ນ 3 ຫ້ອງບັນຊີ / ສາງ 2 ໂຊນຮັບສິນຄ້າ"
                  />
                </Field>
              </div>

              {canCreateForOther && canReadUsers && (
                <div className="rounded border border-hair bg-subtle/60 px-3 py-3">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={form.on_behalf}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, on_behalf: e.target.checked, requester_id: '' }));
                        setErrors((prev) => {
                          const next = { ...prev };
                          delete next.requester_id;
                          return next;
                        });
                      }}
                      className="mt-1 h-5 w-5 flex-none accent-[var(--primary)]"
                    />
                    <span>
                      <span className="block text-body-sm font-semibold text-ink">ແຈ້ງແທນຜູ້ອື່ນ (On behalf of)</span>
                      <span className="block text-caption text-ink-2">
                        ໃຊ້ເມື່ອແຈ້ງແທນເພື່ອນຮ່ວມງານທີ່ແຈ້ງເອງບໍ່ໄດ້ ລະບົບຈະບັນທຶກທັງຜູ້ແຈ້ງ ແລະ ຜູ້ໄດ້ຮັບຜົນກະທົບ
                      </span>
                    </span>
                  </label>
                  {form.on_behalf && (
                    <OnBehalfPicker
                      companyId={companyId}
                      selfId={user.id}
                      value={form.requester_id}
                      error={errors.requester_id}
                      onChange={(id) => set('requester_id', id)}
                    />
                  )}
                </div>
              )}
            </Section>

            {/* ── 2 การจำแนกและข้อมูลปัญหา ─────────────────────────── */}
            <Section step={2} title="ການຈຳແນກປະເພດ ແລະ ຂໍ້ມູນບັນຫາ" hint="ISO/IEC 20000-1 ຂໍ້ 8.6.1 / 8.6.2 / 8.5.1">
              <fieldset>
                <legend className="mb-2 text-label text-ink">
                  ປະເພດເລື່ອງ <span className="text-sla-breach" aria-hidden="true">*</span>
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {TYPE_CARDS.map((card) => {
                    const checked = form.ticket_type === card.value;
                    const Icon = card.icon;
                    return (
                      <label
                        key={card.value}
                        className={cn(
                          'flex cursor-pointer flex-col gap-2 rounded border px-3.5 py-3 transition-colors',
                          checked
                            ? 'border-primary bg-primary-subtle ring-1 ring-primary'
                            : 'border-control bg-surface hover:border-primary/60',
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="ticket_type"
                            value={card.value}
                            checked={checked}
                            onChange={() => changeTicketType(card.value)}
                            className="h-4 w-4 flex-none accent-[var(--primary)]"
                          />
                          <Icon className="h-4 w-4 flex-none text-ink-2" aria-hidden="true" />
                          <span className="text-body-sm font-semibold text-ink">{card.english}</span>
                          <span className="ml-auto rounded-sm border border-hair bg-surface px-1.5 text-caption font-semibold text-ink-2">
                            {card.code}
                          </span>
                        </span>
                        <span className="text-caption text-ink-2">
                          <b className="text-ink">{TICKET_TYPE[card.value]}</b> — {card.description}
                        </span>
                        <span className="border-t border-hair pt-2 text-caption text-ink-3">› {card.consequence}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid gap-4 md:grid-cols-2">
                {form.ticket_type === 'service_request' && (
                  <Field
                    label="ລາຍການບໍລິການທີ່ຂໍ (Service Catalogue)"
                    htmlFor="catalog_item_id"
                    required
                    error={errors.catalog_item_id}
                    hint="ລາຍການບໍລິການມີເປົ້າໝາຍເວລາ ແລະ ຂັ້ນຕອນຂອງຕົນເອງ"
                    className="md:col-span-2"
                  >
                    <Select
                      value={form.catalog_item_id}
                      onChange={(e) => {
                        const item = activeCatalog.find((i) => String(i.id) === e.target.value);
                        set('catalog_item_id', e.target.value);
                        // ลายการที่ผูกหมวดไว้ เติมหมวดให้เลย ผู้แจ้งไม่ต้องเดาซ้ำ
                        if (item?.category) {
                          const cat = allCategories.find((c) => c.id === item.category?.id);
                          if (cat) {
                            const parent = cat.parent_id === null ? String(cat.id) : String(cat.parent_id);
                            const sub = cat.parent_id === null ? '' : String(cat.id);
                            setForm((prev) => ({
                              ...prev,
                              catalog_item_id: e.target.value,
                              parent_category_id: parent,
                              subcategory_id: sub,
                              impact: cat.default_impact,
                              urgency: cat.default_urgency,
                            }));
                          }
                        }
                      }}
                    >
                      <option value="">— ເລືອກລາຍການບໍລິການ —</option>
                      {activeCatalog.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name_th}
                          {item.requires_approval ? ' · ຕ້ອງອະນຸມັດ' : ''}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}

                {/*
                  รายการที่ต้องอนุมัติเปลี่ยนสิ่งที่จะเกิดขึ้นหลังกดส่งไปทั้งหมด —
                  เรื่องจะไม่เข้าคิวทีมไอที แต่ไปจอดรอผู้อนุมัติก่อน ซึ่งผู้ขอต้องรู้
                  "ก่อน" กดส่ง ไม่ใช่มางงทีหลังว่าทำไมไม่มีใครรับเรื่องสักที
                  จึงเป็นกล่องที่เห็นชัด ไม่ใช่ hint สีจางใต้ช่อง
                */}
                {form.ticket_type === 'service_request' && selectedCatalog?.requires_approval && (
                  <div
                    role="status"
                    className="flex gap-3 rounded border border-st-pending-fg/30 bg-st-pending-bg px-4 py-3 md:col-span-2"
                  >
                    <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-st-pending-fg" aria-hidden="true" />
                    <div className="min-w-0 text-body-sm text-st-pending-fg">
                      <p className="font-semibold">ລາຍການນີ້ຕ້ອງຜ່ານການອະນຸມັດກ່ອນ</p>
                      <p className="mt-0.5">
                        ເມື່ອກົດສົ່ງ ເລື່ອງຈະຢູ່ໃນສະຖານະ «{TICKET_STATUS.pending_approval.label}»
                        ແລະ ທີມງານຈະເລີ່ມດຳເນີນການໄດ້ຫຼັງຜູ້ອະນຸມັດພິຈາລະນາແລ້ວເທົ່ານັ້ນ
                        {selectedCatalog.approval_chain ? ` · ສາຍອະນຸມັດ ${selectedCatalog.approval_chain}` : ''}
                      </p>
                      <p className="mt-0.5 text-caption">ຂະນະລໍຖ້າອະນຸມັດ ໂມງ SLA ຈະຢຸດນັບ</p>
                    </div>
                  </div>
                )}

                <Field
                  label="ໝວດໝູ່ (Category)"
                  htmlFor="parent_category_id"
                  required
                  error={errors.parent_category_id}
                  // รายการเปลี่ยนตามการ์ดประเภทด้านบน ต้องบอกไว้ ไม่งั้นผู้แจ้งที่จำได้ว่า
                  // "เมื่อกี้มีหมวดนี้" จะคิดว่าระบบเสียแทนที่จะมองขึ้นไปสลับประเภท
                  hint={
                    parentCategories.length === 0
                      ? `ຍັງບໍ່ມີໝວດໝູ່ສຳລັບ «${TICKET_TYPE[form.ticket_type]}» — ຕິດຕໍ່ຜູ້ດູແລລະບົບ`
                      : `${parentCategories.length} ໝວດສຳລັບ «${TICKET_TYPE[form.ticket_type]}»`
                  }
                >
                  <Select
                    value={form.parent_category_id}
                    onChange={(e) => {
                      const value = e.target.value;
                      setForm((prev) => ({ ...prev, parent_category_id: value, subcategory_id: '' }));
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.parent_category_id;
                        delete next.subcategory_id;
                        return next;
                      });
                      applyCategoryDefaults(value);
                    }}
                  >
                    <option value="">— ເລືອກໝວດໝູ່ —</option>
                    {parentCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name_th}
                        {childCount.get(c.id) ? ` · ${childCount.get(c.id)} ໝວດຍ່ອຍ` : ''}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field
                  label="ໝວດໝູ່ຍ່ອຍ (Subcategory)"
                  htmlFor="subcategory_id"
                  required={subcategories.length > 0}
                  error={errors.subcategory_id}
                  hint={
                    !selectedParent
                      ? 'ເລືອກໝວດໝູ່ກ່ອນ ລາຍການຈະປ່ຽນຕາມໝວດທີ່ເລືອກ'
                      : subcategories.length === 0
                        ? 'ໝວດນີ້ບໍ່ມີໝວດຍ່ອຍ — ໃຊ້ໝວດຫຼັກໄດ້ເລີຍ'
                        : `${subcategories.length} ໝວດຍ່ອຍໃນ «${selectedParent.name_th}»`
                  }
                >
                  <Select
                    value={form.subcategory_id}
                    disabled={subcategories.length === 0}
                    onChange={(e) => {
                      set('subcategory_id', e.target.value);
                      applyCategoryDefaults(e.target.value);
                    }}
                  >
                    <option value="">
                      {!selectedParent
                        ? '— ເລືອກໝວດໝູ່ກ່ອນ —'
                        : subcategories.length === 0
                          ? '— ບໍ່ມີໝວດຍ່ອຍ —'
                          : '— ເລືອກໝວດໝູ່ຍ່ອຍ —'}
                    </option>
                    {subcategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name_th}
                      </option>
                    ))}
                  </Select>
                </Field>

                {/* ซ่อนเมื่อทะเบียนบริการยังว่าง — dropdown ที่มีแค่ "ບໍ່ລະບຸ" ทำให้ผู้แจ้งสงสัยว่าระบบเสีย */}
                {canReadServices && serviceOptions.length > 0 && (
                  <Field
                    label="ລະບົບ / ບໍລິການທີ່ກ່ຽວຂ້ອງ (Service)"
                    htmlFor="service_id"
                    hint="ອ້າງອີງທະບຽນບໍລິການກາງ ຕາມ ISO/IEC 20000-1 ຂໍ້ 8.2.4 — ລະດັບຊັ້ນບໍລິການມີຜົນຕໍ່ການຈັດລຳດັບວຽກ"
                    className="md:col-span-2"
                  >
                    <Select value={form.service_id} onChange={(e) => set('service_id', e.target.value)}>
                      <option value="">— ບໍ່ລະບຸ —</option>
                      {serviceOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name_th} · {SERVICE_TIER[s.service_tier as ServiceTier]?.label ?? s.service_tier}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}

                <Field
                  label="ຫົວຂໍ້ເລື່ອງ (Subject)"
                  htmlFor="subject"
                  required
                  error={errors.subject}
                  hint={`${form.subject.trim().length} / ${SUBJECT_MAX} ຕົວອັກສອນ (ຢ່າງໜ້ອຍ ${SUBJECT_MIN})`}
                  className="md:col-span-2"
                >
                  <Input
                    value={form.subject}
                    maxLength={SUBJECT_MAX}
                    onChange={(e) => set('subject', e.target.value)}
                    placeholder="ສະຫຼຸບບັນຫາ ຫຼື ຄຳຂໍໃນແຖວດຽວ ເຊັ່ນ ເຂົ້າລະບົບ SAP ບໍ່ໄດ້ຕັ້ງແຕ່ເຊົ້າ"
                  />
                </Field>

                <Field
                  label="ລາຍລະອຽດ (Description)"
                  htmlFor="description"
                  required
                  error={errors.description}
                  hint={`${form.description.trim().length} ຕົວອັກສອນ (ຢ່າງໜ້ອຍ ${DESCRIPTION_MIN})`}
                  className="md:col-span-2"
                >
                  <Textarea
                    rows={7}
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    placeholder={
                      'ກະລຸນາລະບຸຕາມໂຄງນີ້ ເພື່ອໃຫ້ທີມງານວິເຄາະໄດ້ໄວຂຶ້ນ\n\n' +
                      '1) ອາການທີ່ພົບ : ເຊັ່ນ ຂຶ້ນຂໍ້ຄວາມ "Connection timeout" ທຸກເທື່ອທີ່ກົດເມນູລາຍງານ\n' +
                      '2) ເວລາທີ່ເກີດ : ເຊັ່ນ ເລີ່ມພົບຕັ້ງແຕ່ 08:45 ມື້ນີ້ ແລະ ເກີດຊ້ຳທຸກເທື່ອ\n' +
                      '3) ຂັ້ນຕອນທີ່ເຮັດໃຫ້ເກີດ : ເຊັ່ນ ເຂົ້າລະບົບ > ເມນູລາຍງານ > ກົດຄົ້ນຫາ\n' +
                      '4) ສິ່ງທີ່ລອງແກ້ແລ້ວ : ເຊັ່ນ ປິດເປີດເຄື່ອງໃໝ່ ປ່ຽນ Wi-Fi ແລ້ວຍັງບໍ່ຫາຍ'
                    }
                  />
                </Field>

                <Field
                  label="ເລກຊັບສິນ (Asset tag)"
                  htmlFor="asset_tag"
                  hint="ເລກທີ່ຕິດຢູ່ເຄື່ອງ ຫຼື ອຸປະກອນ — ຖ້າມີ"
                  className="md:col-span-2"
                >
                  <Input
                    value={form.asset_tag}
                    maxLength={100}
                    onChange={(e) => set('asset_tag', e.target.value)}
                    placeholder="ເຊັ່ນ NB-HQ-0231"
                  />
                </Field>
              </div>

              <div className="space-y-1.5">
                <p className="text-label text-ink">ໄຟລ໌ແນບປະກອບ (Attachments)</p>
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    addFiles(Array.from(e.dataTransfer.files));
                  }}
                  className={cn(
                    'flex min-h-[96px] cursor-pointer flex-col items-center justify-center gap-1 rounded border border-dashed px-4 py-4 text-center transition-colors',
                    dragging
                      ? 'border-primary bg-primary-subtle'
                      : 'border-control bg-subtle hover:border-primary',
                  )}
                >
                  <Upload className="h-5 w-5 text-ink-2" aria-hidden="true" />
                  <span className="text-body-sm font-semibold text-ink">
                    {/* จอสัมผัสลากไฟล์มาวางไม่ได้ — บอกสิ่งที่ทำได้จริงบนเครื่องนั้น */}
                    <span className="sm:hidden">ແຕະເພື່ອຖ່າຍຮູບ ຫຼື ເລືອກໄຟລ໌</span>
                    <span className="hidden sm:inline">ລາກໄຟລ໌ມາວາງບ່ອນນີ້ ຫຼື ກົດເພື່ອເລືອກໄຟລ໌</span>
                  </span>
                  <span className="text-caption text-ink-3">ຮອງຮັບ ຮູບພາບ · PDF · Word · Excel — ບໍ່ເກີນ 20 MB ຕໍ່ໄຟລ໌</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                    onChange={(e) => {
                      addFiles(Array.from(e.target.files ?? []));
                      e.target.value = '';
                    }}
                    className="sr-only"
                  />
                </label>
                {files.length > 0 && (
                  <ul className="space-y-2 pt-1">
                    {files.map((file, index) => (
                      <li
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between gap-3 rounded border border-hair bg-surface px-3 py-2 text-body-sm"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Paperclip className="h-4 w-4 flex-none text-ink-3" aria-hidden="true" />
                          <span className="truncate">{file.name}</span>
                        </span>
                        <span className="flex flex-none items-center gap-2">
                          <span className="tabular text-caption text-ink-3">{formatFileSize(file.size)}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`ລົບ ${file.name}`}
                            onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Section>

            {/* ── 3 ระดับความสำคัญ ─────────────────────────────────── */}
            <Section step={3} title="ການປະເມີນລະດັບຄວາມສຳຄັນ" hint="Priority = Impact × Urgency ຕາມ AIDC-IT-SLA-001">
              <div className="grid gap-4 md:grid-cols-2">
                <ChoiceGroup
                  legend="ຜົນກະທົບ (Impact)"
                  name="impact"
                  value={form.impact}
                  onChange={(v) => set('impact', v)}
                  options={IMPACT_ORDER.map((value) => ({
                    value,
                    title: IMPACT_OPTIONS.find((o) => o.value === value)?.label ?? value,
                    detail: IMPACT_DETAIL[value] ?? '',
                  }))}
                />
                <ChoiceGroup
                  legend="ຄວາມຮີບດ່ວນ (Urgency)"
                  name="urgency"
                  value={form.urgency}
                  onChange={(v) => set('urgency', v)}
                  options={URGENCY_ORDER.map((value) => ({
                    value,
                    title: URGENCY_OPTIONS.find((o) => o.value === value)?.label ?? value,
                    detail: URGENCY_DETAIL[value] ?? '',
                  }))}
                />
              </div>

              <div className="border-t border-hair pt-4">
                <p className="mb-2 text-label text-ink">ຕາຕະລາງທຽບລະດັບຄວາມສຳຄັນ (Priority Matrix)</p>
                <div className="overflow-x-auto rounded border border-hair">
                  <table className="w-full min-w-[400px] border-collapse text-body-sm sm:min-w-[480px]">
                    <caption className="sr-only">ຕາຕະລາງທຽບຜົນກະທົບກັບຄວາມຮີບດ່ວນເພື່ອກຳນົດລະດັບຄວາມສຳຄັນ</caption>
                    <thead>
                      <tr className="bg-subtle text-left text-caption text-ink-2">
                        <th scope="col" className="px-3 py-2 font-semibold">
                          ຜົນກະທົບ \ ຄວາມຮີບດ່ວນ
                        </th>
                        {URGENCY_ORDER.map((u) => (
                          <th key={u} scope="col" className="px-3 py-2 text-center font-semibold">
                            {URGENCY_OPTIONS.find((o) => o.value === u)?.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {IMPACT_ORDER.map((i) => (
                        <tr key={i} className="border-t border-hair">
                          <th scope="row" className="px-3 py-2 text-left font-normal text-ink-2">
                            {IMPACT_OPTIONS.find((o) => o.value === i)?.label}
                          </th>
                          {URGENCY_ORDER.map((u) => {
                            const cell = PRIORITY_MATRIX[i]?.[u];
                            const on = form.impact === i && form.urgency === u;
                            return (
                              <td key={u} className="px-2 py-1.5 text-center">
                                <span
                                  aria-current={on || undefined}
                                  className={cn(
                                    'inline-flex min-w-[52px] justify-center rounded-sm px-2 py-1 font-semibold',
                                    on && cell ? cn(PRIORITY[cell].className, 'ring-2 ring-primary') : 'text-ink-3',
                                  )}
                                >
                                  {cell}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {priority && (
                <div className="rounded border border-primary/30 bg-primary-subtle px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-body-sm font-semibold text-ink">ລະດັບຄວາມສຳຄັນທີ່ລະບົບຄຳນວນໄດ້:</span>
                    <PriorityBadge priority={priority} />
                  </div>
                  {target && (
                    <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-3">
                      <Stat label="ເວລາຕອບຮັບ" value={formatTarget(target.response_minutes, target.clock_mode)} />
                      <Stat label="ເວລາແກ້ໄຂ" value={formatTarget(target.resolution_minutes, target.clock_mode)} />
                      <Stat label="ການນັບເວລາ" value={clockLabel(target.clock_mode)} />
                    </dl>
                  )}
                  <p className="mt-2 text-caption text-ink-2">
                    ຄຳນວນຈາກ ຜົນກະທົບ × ຄວາມຮີບດ່ວນ ຕາມຕາຕະລາງຂ້າງເທິງ — ແກ້ເອງບໍ່ໄດ້ ຄ່າຈິງລະບົບຈະຢືນຢັນຕອນບັນທຶກ
                  </p>
                </div>
              )}
            </Section>
          </div>

          {/*
            ── ด้านขวา: สิ่งที่ระบบบันทึกให้ ──
            แท็บเล็ตวางสองการ์ดคู่กัน · จอใหญ่เป็นคอลัมน์ขวาที่ตามเลื่อน
            top ต้องพ้นแถบหัวที่ติดบน (72px) และจำกัดความสูงไว้ ไม่งั้นส่วนล่างของแผงเลื่อนไปไม่ถึง
          */}
          <aside
            className="grid min-w-0 items-start gap-4 md:grid-cols-2 lg:sticky lg:top-[88px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:flex lg:max-h-[calc(100vh-104px)] lg:flex-col lg:overflow-y-auto"
            aria-label="ຂໍ້ມູນທີ່ລະບົບບັນທຶກອັດຕະໂນມັດ"
          >
            <Section step={4} title="ລະບົບບັນທຶກອັດຕະໂນມັດ">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-caption">
                  <span className="font-semibold text-ink-2">ຄວາມຄົບຖ້ວນຂອງຂໍ້ມູນ</span>
                  <span className="tabular text-ink-2">
                    {done}/{checks.length} ຊ່ອງ
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-subtle"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={checks.length}
                  aria-valuenow={done}
                  aria-label="ຄວາມຄົບຖ້ວນຂອງຂໍ້ມູນ"
                >
                  <div
                    className={cn('h-full rounded-full transition-all', missing.length === 0 ? 'bg-sla-ok' : 'bg-primary')}
                    style={{ width: `${(done / checks.length) * 100}%` }}
                  />
                </div>
                <p className="mt-1.5 flex items-center gap-1 text-caption text-ink-3">
                  {missing.length === 0 ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-sla-ok" aria-hidden="true" />
                      ຂໍ້ມູນຈຳເປັນຄົບແລ້ວ ພ້ອມສົ່ງ
                    </>
                  ) : (
                    `ຍັງເຫຼືອ ${missing.length} ຊ່ອງ ເຊັ່ນ ${missing[0]?.label}`
                  )}
                </p>
              </div>

              <dl className="divide-y divide-hair border-t border-hair">
                <DefRow label="ເລກທີເລື່ອງ">
                  <span className="text-ink-3">ອອກໃຫ້ຫຼັງກົດສົ່ງ</span>
                </DefRow>
                <DefRow label="ປະເພດ">
                  {typeMeta ? `${TICKET_TYPE[typeMeta.value]} (${typeMeta.code})` : '—'}
                </DefRow>
                <DefRow label="ໝວດໝູ່">
                  {selectedParent ? (
                    <>
                      {selectedParent.name_th}
                      {selectedSub && (
                        <span className="block text-caption text-ink-2">› {selectedSub.name_th}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </DefRow>
                <DefRow label="ສະຖານະເລີ່ມຕົ້ນ">
                  {form.ticket_type === 'service_request' && selectedCatalog?.requires_approval
                    ? TICKET_STATUS.pending_approval.label
                    : TICKET_STATUS.new.label}
                </DefRow>
                <DefRow label="ລະດັບຄວາມສຳຄັນ">
                  {priority ? <PriorityBadge priority={priority} withMeter={false} /> : '—'}
                </DefRow>
                {target && (
                  <>
                    <DefRow label="ກຳນົດຕອບຮັບ">{formatTarget(target.response_minutes, target.clock_mode)}</DefRow>
                    <DefRow label="ກຳນົດແກ້ໄຂ">{formatTarget(target.resolution_minutes, target.clock_mode)}</DefRow>
                  </>
                )}
                <DefRow label="ຊ່ອງທາງຮັບແຈ້ງ">ລະບົບອອນລາຍ</DefRow>
                <DefRow label="ຜູ້ບັນທຶກ">{user.full_name}</DefRow>
                <DefRow label="ຜູ້ໄດ້ຮັບຜົນກະທົບ">{form.on_behalf ? 'ແຈ້ງແທນຜູ້ອື່ນ' : 'ຜູ້ແຈ້ງເອງ'}</DefRow>
                <DefRow label="ບໍລິການທີ່ຜູກ">
                  {selectedService?.name_th ?? selectedCatalog?.name_th ?? <span className="text-ink-3">—</span>}
                </DefRow>
                <DefRow label="ໄຟລ໌ແນບ">{files.length > 0 ? `${files.length} ໄຟລ໌` : '—'}</DefRow>
              </dl>
            </Section>

            {policy && policy.targets.length > 0 && (
              <Card>
                <CardHeader className="justify-start">
                  <CardTitle className="text-body font-semibold">ຂໍ້ຕົກລົງລະດັບບໍລິການທີ່ບັງຄັບໃຊ້</CardTitle>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-body-sm">
                    <thead>
                      <tr className="bg-subtle text-left text-caption text-ink-2">
                        <th scope="col" className="px-4 py-2 font-semibold">
                          ລະດັບ
                        </th>
                        <th scope="col" className="px-2 py-2 font-semibold">
                          ຕອບຮັບ
                        </th>
                        <th scope="col" className="px-2 py-2 font-semibold">
                          ແກ້ໄຂ
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...policy.targets]
                        .sort((a, b) => a.priority.localeCompare(b.priority))
                        .map((t) => (
                          <tr
                            key={t.priority}
                            className={cn('border-t border-hair', t.priority === priority && 'bg-primary-subtle')}
                          >
                            <td className="px-4 py-2 font-semibold">{t.priority}</td>
                            <td className="whitespace-nowrap px-2 py-2">
                              {formatTarget(t.response_minutes, t.clock_mode)}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2">
                              {formatTarget(t.resolution_minutes, t.clock_mode)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-hair px-4 py-2 text-caption text-ink-3">
                  ອ້າງອີງ {policy.doc_ref} v{policy.doc_version} · P1 ນັບຕໍ່ເນື່ອງ 24×7 · P2–P4 ນັບສະເພາະເວລາເຮັດວຽກ
                </p>
              </Card>
            )}
          </aside>

          <Card className="min-w-0 lg:col-start-1 lg:row-start-2">
            <CardBody className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              {/* ข้อความปุ่มภาษาลาวยาว — มือถือให้ปุ่มเต็มกว้างและตัดบรรทัดได้ ไม่ดันจอให้เลื่อนข้าง */}
              <Button
                type="submit"
                size="lg"
                loading={submitting}
                className="w-full !whitespace-normal text-center sm:w-auto"
              >
                <Send className="h-4 w-4 flex-none" aria-hidden="true" />
                ສົ່ງເລື່ອງ ແລະ ບັນທຶກເປັນຫຼັກຖານ
              </Button>
              <Button type="button" variant="secondary" size="lg" onClick={resetForm} className="w-full sm:w-auto">
                ລ້າງແບບຟອມ
              </Button>
              <span className="text-caption text-ink-3 sm:min-w-[220px] sm:flex-1">
                ເມື່ອກົດສົ່ງ ລະບົບຈະອອກເລກທີເລື່ອງ ເລີ່ມນັບເວລາ SLA ແລະ ບັນທຶກລາຍການທຳອິດໃນ audit trail ທັນທີ
              </span>
            </CardBody>
          </Card>
        </div>
      </form>
    </div>
  );
}

function Section({
  step,
  title,
  hint,
  children,
}: {
  step: number;
  title: string;
  hint?: string | undefined;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Card>
      <CardHeader className="justify-start gap-2.5">
        <span
          aria-hidden="true"
          className="grid h-6 w-6 flex-none place-items-center rounded-sm bg-primary text-caption font-bold text-white"
        >
          {step}
        </span>
        <CardTitle className="text-body font-semibold">{title}</CardTitle>
        {/* มือถือขึ้นบรรทัดใหม่ใต้ชื่อหมวดแทนการซ่อน — ข้ออ้างอิงมาตรฐานยังต้องเห็นได้ทุกจอ */}
        {hint && <span className="basis-full text-caption text-ink-3 md:ml-auto md:basis-auto">{hint}</span>}
      </CardHeader>
      <CardBody className="space-y-4">{children}</CardBody>
    </Card>
  );
}

function ChoiceGroup({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: string;
  options: { value: string; title: string; detail: string }[];
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <fieldset>
      <legend className="mb-2 text-label text-ink">
        {legend} <span className="text-sla-breach" aria-hidden="true">*</span>
      </legend>
      <div className="flex flex-col gap-2">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded border px-3 py-2.5 transition-colors',
                checked ? 'border-primary bg-primary-subtle' : 'border-control bg-surface hover:border-primary/60',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="mt-1 h-4 w-4 flex-none accent-[var(--primary)]"
              />
              <span className="min-w-0">
                <span className="block text-body-sm font-semibold text-ink">{option.title}</span>
                <span className="block text-caption text-ink-2">{option.detail}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** ค้นหาผู้ได้รับผลกระทบ — ยิง /users เฉพาะตอนเปิดสวิตช์แจ้งแทน ไม่ใช่ทุกครั้งที่เปิดหน้า */
function OnBehalfPicker({
  companyId,
  selfId,
  value,
  error,
  onChange,
}: {
  companyId: number;
  selfId: number;
  value: string;
  error: string | undefined;
  onChange: (id: string) => void;
}): React.JSX.Element {
  const [search, setSearch] = React.useState('');
  const query = React.useDeferredValue(search.trim());
  const users = useUsers({ q: query || undefined, company_id: companyId, is_active: 'true' });
  const rows = (users.data?.items ?? []).filter((u) => u.id !== selfId);

  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <Field label="ຄົ້ນຫາຜູ້ໃຊ້" htmlFor="requester_search">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ພິມຊື່ ຫຼື ຊື່ຜູ້ໃຊ້"
        />
      </Field>
      <Field label="ຜູ້ໄດ້ຮັບຜົນກະທົບ (Affected user)" htmlFor="requester_id" required error={error}>
        <Select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{users.isLoading ? 'ກຳລັງໂຫຼດ…' : '— ເລືອກຜູ້ໃຊ້ —'}</option>
          {rows.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name} ({u.username})
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div>
      <dt className="text-caption text-ink-2">{label}</dt>
      <dd className="text-body-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}

function formatTarget(minutes: number, clockMode: string): string {
  return formatMinutes(minutes, clockMode === 'calendar_24x7' ? 'calendar_minutes' : 'business_minutes');
}

function clockLabel(clockMode: string): string {
  return clockMode === 'calendar_24x7' ? 'ນັບຕໍ່ເນື່ອງ 24×7' : 'ນັບສະເພາະເວລາເຮັດວຽກ';
}
