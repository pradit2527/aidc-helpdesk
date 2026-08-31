# Component Specification — AIDC Helpdesk

| หัวข้อ | รายละเอียด |
|---|---|
| รหัสเอกสาร | FE-003 |
| เวอร์ชัน | 1.0 |
| วันที่ | 2026-08-31 |
| ผู้จัดทำ | Senior Frontend |
| เอกสารอ้างอิง | `20-frontend-architecture.md`, `21-ui-ux-design.md`, `03-api-spec.md`, `04-rbac-sla.md` |

---

## 1. Component Inventory

### 1.1 Primitive — `src/components/ui/` (จาก shadcn/ui คัดลอกเข้าโปรเจกต์)

ไม่รู้จัก domain ของ helpdesk เลย · ไม่เรียก API · ไม่ใช้ `useAuth`

| Component | หน้าที่ | หมายเหตุการปรับจาก shadcn |
|---|---|---|
| `Button` | ปุ่ม | เพิ่ม variant `danger`; ทุกขนาดสูง ≥ 44px บนมือถือ; รับ `isLoading` |
| `Input` / `Textarea` | ช่องกรอก | บังคับ `text-base` (16px) เสมอ; ขอบ `--border-control` |
| `Select` / `Combobox` | เลือกค่า | Combobox รองรับค้นหาฝั่ง server + debounce |
| `Checkbox` / `RadioGroup` / `Switch` | | |
| `Dialog` / `Sheet` | modal | `<Sheet side="bottom">` เป็นค่าเริ่มต้นบนมือถือ |
| `DropdownMenu` / `Popover` / `Tooltip` | | Tooltip ต้องมีทางเข้าถึงอื่นเสมอ (มือถือไม่มี hover) |
| `Tabs` / `Accordion` | | Tabs บนมือถือเลื่อนแนวนอนได้ |
| `Badge` | ป้ายทั่วไป | เป็นฐานของ `StatusBadge` / `PriorityBadge` |
| `Card` / `Separator` / `Avatar` / `Progress` | | |
| `Skeleton` | โครงโหลด | รับ `delayMs` (ค่าเริ่มต้น 200) |
| `Toaster` (sonner) | toast | |
| `Label` / `FormField` | ผูก label/error/`aria-describedby` | wrapper บาง ๆ ของ react-hook-form |

```ts
// ตัวอย่าง signature ของ primitive ที่ปรับเอง
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'link';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  /** ข้อความแทนระหว่างโหลด เช่น "กำลังส่ง…" */
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /** ให้ render เป็น element อื่น เช่น <Link> */
  asChild?: boolean;
}
```

### 1.2 Composite — `src/components/common/`

ประกอบจาก primitive · ยังไม่รู้จัก domain · รับข้อมูลผ่าน props ล้วน

| Component | Props signature |
|---|---|
| `PageHeader` | `{ title: string; description?: string; breadcrumbs?: Crumb[]; actions?: ReactNode; backTo?: string }` |
| `DataTable<TData>` | ดู §2.2 (ฐานของ `TicketTable`) |
| `Pagination` | `{ page: number; totalPages: number; total: number; pageSize: number; pageSizeOptions?: number[]; onPageChange: (page: number) => void; onPageSizeChange?: (size: number) => void }` |
| `EmptyState` | `{ icon?: LucideIcon; title: string; description?: string; primaryAction?: ActionProps; secondaryAction?: ActionProps }` |
| `ErrorState` | `{ error: ApiError; onRetry?: () => void; compact?: boolean }` — แสดง `request_id` พร้อมปุ่มคัดลอกเมื่อ `code === 'INTERNAL_ERROR'` |
| `LoadingSkeleton` | `{ variant: 'table' \| 'card-list' \| 'detail' \| 'dashboard' \| 'form'; rows?: number; delayMs?: number }` |
| `ConfirmDialog` | ดู §2.11 |
| `SearchInput` | `{ value: string; onChange: (v: string) => void; placeholder?: string; debounceMs?: number; isSearching?: boolean; onClear?: () => void }` |
| `DateRangePicker` | `{ from: string \| null; to: string \| null; onChange: (r: { from: string \| null; to: string \| null }) => void; presets?: DatePreset[]; maxRangeDays?: number }` — ค่าออกเป็น `YYYY-MM-DD` (ISO) แต่แสดงเป็น พ.ศ. |
| `ThaiDate` | `{ value: string; format?: 'short' \| 'long' \| 'datetime' \| 'relative'; withTooltip?: boolean }` — `<time dateTime={value}>` เสมอ |
| `CopyableText` | `{ value: string; label?: string; mono?: boolean }` |
| `FilterChips` | `{ filters: ActiveFilter[]; onRemove: (key: string, value?: string) => void; onClearAll: () => void }` |
| `SectionCard` | `{ title: string; description?: string; actions?: ReactNode; children: ReactNode; isLoading?: boolean; error?: ApiError \| null }` |
| `VirtualRows<TData>` | `{ rows: TData[]; estimateSize?: number; renderRow: (row: TData, index: number) => ReactNode; threshold?: number }` |

### 1.3 Feature — `src/features/*/components/`

รู้จัก domain · เรียก hook ของ feature ตัวเอง · เป็นเจ้าของ mutation

| Feature | Component | บทบาท |
|---|---|---|
| `auth` | `LoginForm`, `Can`, `ChangePasswordForm` | §2 |
| `tickets` | `TicketForm`, `TicketTable`, `TicketCardList`, `TicketFilterBar`, `TicketDetail` (+`TicketDetailHeader`, `TicketTimeline`, `TicketCommentBox`, `TicketActionPanel`), `StatusBadge`, `PriorityBadge`, `SlaIndicator`, `StatusChangeDialog`, `AssigneePicker`, `CategoryPicker`, `PrioritySelector`, `TicketBulkActionBar` | §2 |
| `attachments` | `FileUploader`, `AttachmentList`, `AttachmentThumbnail`, `ImageLightbox` | §2.7 |
| `kb` | `KbSearchBar`, `KbArticleList`, `KbArticleViewer`, `KbArticleEditor`, `KbCategoryTree`, `KbFeedbackButtons` | §2.9 |
| `dashboard` | `StatCard`, `TicketChart`, `AssigneeWorkloadTable`, `DashboardFilterBar` | §2.10, §2.11 |
| `reports` | `SlaComplianceTable`, `ReportTabs`, `ExportMenu`, `ExportJobTracker` | |
| `notifications` | `NotificationBell`, `NotificationList`, `NotificationChannelSettings` | |
| `admin/users` | `UserTable`, `UserForm`, `RoleScopeEditor`, `UserImportWizard`, `DeactivateUserDialog` | §2.12 |
| `admin/*` | `SlaTargetForm`, `BusinessHoursForm`, `HolidayTable`, `CategoryTreeEditor`, `AuditLogTable`, `PermissionMatrix` | |
| ระดับแอป | `CompanySwitcher` | §2.8 |

---

## 2. Spec ละเอียดของ Component สำคัญ

### 2.1 `TicketForm`

ฟอร์มแจ้งปัญหา ใช้ทั้งสร้างใหม่และแก้ไข (`ticket.update` แก้ได้เฉพาะ subject/description/category/department)

```ts
export interface TicketFormProps {
  mode: 'create' | 'edit';
  /** โหมด edit ต้องส่ง ticket ปัจจุบันมา */
  ticket?: Ticket;
  /** ค่าตั้งต้น เช่นมาจากหน้า KB ("แจ้งปัญหาเรื่องนี้") */
  defaultValues?: Partial<TicketFormValues>;
  /** สร้างแทนผู้อื่นได้หรือไม่ — จาก permission ticket.create_for_other */
  canCreateForOther?: boolean;
  /** เลือกบริษัทได้หรือไม่ (agent ที่ดูแลหลายบริษัท) */
  selectableCompanyIds?: number[];
  onSuccess: (ticket: Ticket) => void;
  onCancel?: () => void;
}

export interface TicketFormValues {
  subject: string;
  description: string;
  category_id: number | null;
  priority: TicketPriority;
  company_id: number | null;
  department_id: number | null;
  requester_id: number | null;
  attachment_ids: number[];
}
```

| หัวข้อ | ข้อกำหนด |
|---|---|
| ฟิลด์บังคับ | `subject`, `description`, `category_id`, `priority` — 4 ฟิลด์ตาม NFR-33 |
| ค่าเริ่มต้นอัตโนมัติ | `company_id` = บริษัทของผู้ใช้; `department_id` = แผนกของผู้ใช้; `requester_id` = ตนเอง; `source` = `mobile_web` เมื่อ viewport < 768 px มิฉะนั้น `web` |
| ผลจากการเลือกหมวดหมู่ | เติม `priority` ด้วย `category.default_priority` **เฉพาะเมื่อผู้ใช้ยังไม่แตะช่อง priority เอง** (ใช้ `formState.dirtyFields.priority` ตรวจ) |
| แนะนำ KB | เมื่อ `subject.length ≥ 8` และ blur → `GET /kb/articles?q=<subject>&page_size=3` แสดงเป็นลิงก์ ไม่บล็อกการส่ง (UX-02) |
| ไฟล์แนบ | ใช้ `<FileUploader>`; อัปโหลดสำเร็จแล้วเก็บ `attachment_ids` ลงในฟอร์ม; ปุ่มส่ง**ไม่ถูกบล็อก**ระหว่างอัปโหลด แต่จะเตือนถ้ายังมีไฟล์ค้าง |
| กันกดซ้ำ | สร้าง `Idempotency-Key` (UUID) หนึ่งครั้งตอน mount และส่งไปกับทุกครั้งที่กดส่ง |
| ร่างอัตโนมัติ | debounce 2 วินาที → `sessionStorage['aidc.ticket-draft']`; เคลียร์เมื่อสร้างสำเร็จ; ตอนเปิดหน้าใหม่ถามว่า "พบร่างที่ยังไม่ส่ง ต้องการใช้ต่อไหม?" |
| ผลลัพธ์ 422 | map `details[].field` → `setError(field, { message })`; ฟิลด์ที่ไม่รู้จักไปรวมที่ `root`; **ไม่ล้างข้อมูลที่กรอก** (US-01 AC-4); เลื่อนจอไปฟิลด์แรกที่ผิด |
| หลังสำเร็จ | ไปหน้ายืนยันที่แสดง `ticket_no` ตัวใหญ่ + `resolution_due_at` + ปุ่ม "ดูเรื่องนี้" / "แจ้งเรื่องใหม่" |
| a11y | `<form noValidate>` + สรุป error ใน `role="alert"`; ทุกฟิลด์มี `<Label htmlFor>`; ฟิลด์บังคับ `aria-required` |

### 2.2 `TicketTable`

```ts
export type TicketTableColumnKey =
  | 'select' | 'ticket_no' | 'subject' | 'company' | 'department' | 'category'
  | 'status' | 'priority' | 'sla' | 'requester' | 'assignee'
  | 'created_at' | 'updated_at' | 'actions';

export interface TicketTableProps {
  tickets: TicketListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isLoading: boolean;
  /** true = กำลังโหลดชุดใหม่ทับของเดิม → หรี่ตารางแทนแสดง skeleton */
  isRefreshing?: boolean;
  error?: ApiError | null;

  sort: string;                       // เช่น '-priority,resolution_due_at'
  onSortChange: (sort: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;

  columns?: TicketTableColumnKey[];   // ค่าเริ่มต้นต่างกันตามหน้า
  /** เปิด bulk action (คิว agent เท่านั้น) */
  selectable?: boolean;
  selectedIds?: number[];
  onSelectionChange?: (ids: number[]) => void;
  bulkActions?: BulkAction[];

  onRowClick?: (ticket: TicketListItem) => void;
  emptyState?: ReactNode;
  /** virtualize เมื่อแถวเกินค่านี้ (ค่าเริ่มต้น 50) */
  virtualizeThreshold?: number;
}

export interface BulkAction {
  key: 'claim' | 'assign' | 'change_priority' | 'change_status';
  label: string;
  icon?: LucideIcon;
  requiresPermission: PermissionCode;
  variant?: 'default' | 'danger';
  onExecute: (ticketIds: number[]) => Promise<BulkResult>;
}

export interface BulkResult {
  succeeded: number[];
  failed: Array<{ id: number; ticket_no: string; message: string }>;
}
```

**Filter** — `TicketFilterBar` เป็นตัวคุมสถานะทั้งหมด และ **sync กับ query string เสมอ** (ผู้ใช้ส่งลิงก์ตัวกรองให้กันได้ / กด Back แล้วกลับสภาพเดิม)

| ตัวกรอง | ชนิด | ค่าที่ส่ง API | หมายเหตุ |
|---|---|---|---|
| สถานะ | multi-select | `status=new,assigned` | |
| ความเร่งด่วน | multi-select | `priority=critical,high` | |
| บริษัท | single (จาก scope) | `company_id=7` | ถ้าอยู่นอกขอบเขต backend จะตัดทิ้งเงียบ ๆ (US-07 AC-2) — FE จึงแสดงเฉพาะบริษัทในขอบเขตอยู่แล้ว |
| หมวดหมู่ | tree-select | `category_id=78` | |
| ผู้รับผิดชอบ | combobox (ค้นจาก server) | `assignee_id=88` | มีตัวเลือกพิเศษ "ยังไม่มีผู้รับผิดชอบ" |
| สถานะ SLA | multi-select | `sla_status=at_risk,breached` | |
| ช่วงวันที่สร้าง | date range | `created_from`, `created_to` | preset: วันนี้ / 7 วัน / เดือนนี้ / เดือนที่แล้ว |
| คำค้น | text (debounce 300 ms) | `q=` | ค้นเลขที่/หัวข้อ/รายละเอียด (FR-17) |

**Sort** — คลิกหัวคอลัมน์วน `asc → desc → ไม่เรียง`; รองรับ multi-sort ด้วย Shift+คลิก; ส่งเป็น `sort=-priority,resolution_due_at`; หัวคอลัมน์ที่เรียงอยู่มี `aria-sort`

**Pagination** — `page` เริ่มที่ 1, `page_size` เลือกได้ 20/50/100 (สูงสุด 100 ตาม `03-api-spec.md` §1.4); จำ `page_size` ไว้ใน `localStorage` ต่อผู้ใช้

**Bulk action** — จำกัด **20 ใบต่อครั้ง** (ยังไม่มี endpoint bulk — ดู `20-frontend-architecture.md` §9 FE-06) ยิงต่อเนื่องทีละใบพร้อม progress `"กำลังดำเนินการ 7 จาก 12"` แล้วสรุปผลรายใบ: ใบที่ล้มเหลวแสดงเลขที่ + เหตุผล พร้อมปุ่ม "ลองเฉพาะที่ล้มเหลว"

**Responsive** — `< 768 px` render `TicketCardList` แทนโดยอัตโนมัติ (`useMediaQuery`) ไม่ใช่ตารางที่ scroll แนวนอน

### 2.3 `TicketDetail` + `TicketTimeline`

```ts
export interface TicketDetailProps {
  ticketId: number;
}

export interface TicketTimelineProps {
  ticketId: number;
  comments: TicketComment[];
  history: TicketStatusHistory[];
  /** ผู้ใช้เห็นคอมเมนต์ภายในได้หรือไม่ (ใช้แค่ซ่อนแท็บ — backend กรองให้แล้ว) */
  canSeeInternal: boolean;
  filter: TimelineFilter;
  onFilterChange: (filter: TimelineFilter) => void;
  isLoading: boolean;
}

export type TimelineFilter = 'all' | 'conversation' | 'history';

export interface TimelineEntry {
  id: string;                       // 'comment-123' | 'history-456'
  kind: 'comment' | 'status' | 'assignee' | 'priority' | 'system';
  at: string;                       // ISO 8601
  actorName: string | null;         // null = ระบบ
  isInternal: boolean;
  body?: string;
  from?: string;
  to?: string;
  reason?: string | null;
  attachments?: Attachment[];
  isFirstResponse?: boolean;
}
```

| หัวข้อ | ข้อกำหนด |
|---|---|
| การรวมข้อมูล | รวม `comments` + `history` เป็น `TimelineEntry[]` แล้วเรียงตาม `at` **จากเก่าไปใหม่** (อ่านเป็นเรื่องราว) — ฟังก์ชัน `buildTimeline()` อยู่ใน `features/tickets/lib/` และมี unit test |
| คอมเมนต์ภายใน | พื้น `#FEF3C7` + เส้นขอบประ + ป้าย `🔒 ภายในทีม` — **ไม่มีทางแสดงให้ end_user เพราะ API ไม่ส่งมา** (US-02 AC-3) ไม่ใช่เพราะ CSS ซ่อน |
| การตอบครั้งแรก | คอมเมนต์สาธารณะแรกจาก agent มีป้าย `✓ นับเป็นการตอบรับครั้งแรก` (อธิบายว่าทำไม SLA ตอบรับถึงถูกนับ) |
| การเปลี่ยนสถานะ | แสดงเป็น "เปลี่ยนสถานะจาก **กำลังดำเนินการ** เป็น **รอผู้แจ้ง**" + เหตุผล (ถ้ามี) |
| ผู้กระทำเป็นระบบ | `changed_by = null` → แสดง "ระบบ" พร้อมไอคอนต่างจากคน |
| การแก้ไขคอมเมนต์ | ปุ่มแก้ไขแสดงเฉพาะคอมเมนต์ของตนเองที่อายุ < 15 นาที + นับถอยหลังเวลาที่เหลือ; `409 EDIT_WINDOW_EXPIRED` → ปิดโหมดแก้ไข + refetch |
| ยาวเกิน | เกิน 100 รายการ → พับส่วนกลางเป็น "แสดงอีก N รายการ" |
| a11y | `<ol>` จริง; แต่ละรายการมี `<time dateTime>`; ตัวกรองเป็น `role="tablist"` |

`TicketActionPanel` — ปุ่มการกระทำที่แสดงตาม state machine (`02-data-model.md` §4.1) **และ** permission:

```ts
/** ปลายทางที่อนุญาตตาม state machine — ตรวจซ้ำที่ backend เสมอ (409 ถ้าผิด) */
export const ALLOWED_TRANSITIONS: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  new:          ['assigned', 'cancelled'],
  assigned:     ['in_progress', 'pending_user', 'cancelled'],
  in_progress:  ['pending_user', 'resolved', 'cancelled'],
  pending_user: ['in_progress', 'resolved'],
  resolved:     ['closed', 'in_progress'],
  closed:       ['in_progress'],   // เปิดซ้ำภายใน 7 วัน
  cancelled:    [],
} as const;
```

| การกระทำ | เงื่อนไขที่ต้องครบ |
|---|---|
| รับงาน | `status === 'new'` && `assignee === null` && `ticket.assign_self` |
| มอบหมาย | `ticket.assign` && สถานะไม่ใช่ `closed`/`cancelled` |
| เปลี่ยนสถานะ | `ticket.change_status` && ปลายทางอยู่ใน `ALLOWED_TRANSITIONS[status]` |
| ยืนยันปิดงาน | `status === 'resolved'` && (เป็นผู้แจ้ง && `ticket.close_own`) |
| ยังไม่หาย (กลับไปแก้) | `status === 'resolved'` && เป็นผู้แจ้ง |
| เปิดเรื่องซ้ำ | `status === 'closed'` && ภายใน 7 วันหลัง `closed_at` && `ticket.reopen` |
| ยกเลิก | `ticket.cancel` && (agent+ หรือ (เป็นผู้แจ้ง && `assignee === null`)) — **ต้องกรอกเหตุผล** |
| เปลี่ยนความเร่งด่วน | `ticket.change_priority` — **ต้องกรอกเหตุผล**; ปรับขึ้นเป็น `critical` แสดงคำเตือนว่าจะแจ้ง company_admin |

`StatusChangeDialog` บังคับฟิลด์ตามปลายทาง: `pending_user` → `reason` + `comment` (บังคับ ตาม `04-rbac-sla.md` §4.1) · `resolved` → `resolution_note` (บังคับ) · `cancelled` → `reason` (บังคับ) · `closed` → คะแนนความพึงพอใจ 1–5 (ถ้า SA เพิ่มฟิลด์ตาม FE-04)

### 2.4 `StatusBadge`

```ts
export interface StatusBadgeProps {
  status: TicketStatus;
  size?: 'sm' | 'md';
  /** ซ่อนข้อความเหลือแต่ไอคอน — ห้ามใช้ในตาราง/รายการ ใช้ได้เฉพาะที่มีข้อความกำกับอยู่แล้ว */
  iconOnly?: boolean;
  className?: string;
}
```

| ข้อกำหนด | รายละเอียด |
|---|---|
| แสดง 3 อย่างเสมอ | สีพื้น + ไอคอน + ข้อความไทย (ตาราง `21-ui-ux-design.md` §4.3) |
| `iconOnly` | ต้องมี `aria-label` เป็นข้อความไทยของสถานะ และ **มี `title`**; ห้ามใช้ในตาราง |
| `cancelled` | เพิ่ม `border-dashed` แยกจาก `closed` เมื่อพิมพ์ขาวดำ |
| แหล่งข้อมูล | `config/enums.ts` ตัวเดียว — ห้ามฮาร์ดโค้ดสี/ข้อความในไฟล์อื่น |

```ts
// src/config/enums.ts
import { Circle, UserCheck, Settings, PauseCircle, CheckCircle2, Archive, XCircle,
         AlertTriangle, ArrowUp, Minus, ArrowDown, Clock, AlertOctagon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const TICKET_STATUSES = [
  'new', 'assigned', 'in_progress', 'pending_user', 'resolved', 'closed', 'cancelled',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export interface StatusMeta {
  label: string;
  icon: LucideIcon;
  /** class ของ Tailwind ที่ผูกกับ CSS variable ใน tokens.css */
  className: string;
  /** อธิบายให้ผู้ใช้ทั่วไปเข้าใจ ใช้ใน tooltip และหน้า KB "ความหมายของแต่ละสถานะ" */
  description: string;
}

export const STATUS_META: Readonly<Record<TicketStatus, StatusMeta>> = {
  new: {
    label: 'ใหม่', icon: Circle,
    className: 'bg-status-new-bg text-status-new-fg',
    description: 'ระบบรับเรื่องแล้ว กำลังรอเจ้าหน้าที่รับงาน',
  },
  assigned: {
    label: 'มอบหมายแล้ว', icon: UserCheck,
    className: 'bg-status-assigned-bg text-status-assigned-fg',
    description: 'มีเจ้าหน้าที่รับผิดชอบแล้ว',
  },
  in_progress: {
    label: 'กำลังดำเนินการ', icon: Settings,
    className: 'bg-status-in-progress-bg text-status-in-progress-fg',
    description: 'เจ้าหน้าที่กำลังแก้ปัญหาให้',
  },
  pending_user: {
    label: 'รอผู้แจ้ง', icon: PauseCircle,
    className: 'bg-status-pending-user-bg text-status-pending-user-fg',
    description: 'รอข้อมูลหรือคำตอบจากคุณ — เวลาแก้ไขหยุดนับชั่วคราว',
  },
  resolved: {
    label: 'แก้ไขเสร็จ', icon: CheckCircle2,
    className: 'bg-status-resolved-bg text-status-resolved-fg',
    description: 'แก้ไขเสร็จแล้ว รอคุณยืนยันปิดเรื่อง',
  },
  closed: {
    label: 'ปิดแล้ว', icon: Archive,
    className: 'bg-status-closed-bg text-status-closed-fg',
    description: 'เรื่องนี้จบเรียบร้อยแล้ว',
  },
  cancelled: {
    label: 'ยกเลิก', icon: XCircle,
    className: 'border border-dashed border-status-cancelled-fg bg-status-cancelled-bg text-status-cancelled-fg',
    description: 'เรื่องนี้ถูกยกเลิก ไม่ดำเนินการต่อ',
  },
};

export const TICKET_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export interface PriorityMeta extends StatusMeta {
  /** ความหนาแถบซ้ายของแถว — สื่อลำดับโดยไม่พึ่งสี */
  barWidthPx: 1 | 2 | 3 | 4;
  /** ลำดับสำหรับเรียง (สูง = เร่งด่วนกว่า) */
  rank: number;
}

export const PRIORITY_META: Readonly<Record<TicketPriority, PriorityMeta>> = {
  critical: { label: 'วิกฤต',    icon: AlertTriangle, className: 'bg-priority-critical-bg text-priority-critical-fg', description: 'ธุรกิจหยุดชะงัก ไม่มีทางเลี่ยง',            barWidthPx: 4, rank: 4 },
  high:     { label: 'สูง',      icon: ArrowUp,       className: 'bg-priority-high-bg text-priority-high-fg',         description: 'ทำงานไม่ได้แต่มีทางเลี่ยงชั่วคราว',        barWidthPx: 3, rank: 3 },
  medium:   { label: 'ปานกลาง',  icon: Minus,         className: 'bg-priority-medium-bg text-priority-medium-fg',     description: 'ทำงานได้แต่ติดขัด กระทบรายบุคคล',          barWidthPx: 2, rank: 2 },
  low:      { label: 'ต่ำ',      icon: ArrowDown,     className: 'bg-priority-low-bg text-priority-low-fg',           description: 'คำขอทั่วไป ไม่กระทบการทำงาน',              barWidthPx: 1, rank: 1 },
};

export const SLA_STATUSES = ['on_track', 'at_risk', 'breached', 'paused'] as const;
export type SlaStatus = (typeof SLA_STATUSES)[number];

export const SLA_META: Readonly<Record<SlaStatus, StatusMeta>> = {
  on_track: { label: 'ตรงเวลา',            icon: CheckCircle2,  className: 'bg-sla-on-track-bg text-sla-on-track-fg', description: 'ยังอยู่ในกำหนดเวลา' },
  at_risk:  { label: 'ใกล้ครบกำหนด',       icon: Clock,         className: 'bg-sla-at-risk-bg text-sla-at-risk-fg',   description: 'เหลือเวลาไม่ถึง 20% ของกำหนด' },
  breached: { label: 'เกินกำหนด',          icon: AlertOctagon,  className: 'bg-sla-breached-bg text-sla-breached-fg', description: 'เกินเวลาที่กำหนดไว้แล้ว' },
  paused:   { label: 'หยุดนับชั่วคราว',    icon: PauseCircle,   className: 'bg-sla-paused-bg text-sla-paused-fg',     description: 'รอผู้แจ้งตอบกลับ นาฬิกาหยุดเดิน' },
};
```

```tsx
// src/features/tickets/components/StatusBadge.tsx
import { STATUS_META, type TicketStatus } from '@/config/enums';
import { cn } from '@/lib/cn';

export interface StatusBadgeProps {
  status: TicketStatus;
  size?: 'sm' | 'md';
  iconOnly?: boolean;
  className?: string;
}

export function StatusBadge({ status, size = 'md', iconOnly = false, className }: StatusBadgeProps) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm font-medium whitespace-nowrap',
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm',
        meta.className,
        className,
      )}
      title={iconOnly ? meta.label : meta.description}
      aria-label={iconOnly ? `สถานะ: ${meta.label}` : undefined}
    >
      <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden="true" />
      {!iconOnly && <span>{meta.label}</span>}
    </span>
  );
}
```

### 2.5 `PriorityBadge`

```ts
export interface PriorityBadgeProps {
  priority: TicketPriority;
  size?: 'sm' | 'md';
  /** แสดงคำอธิบายเกณฑ์เป็น tooltip (ใช้ในฟอร์มแจ้งปัญหา) */
  withHint?: boolean;
  className?: string;
}

/** แถบสีซ้ายของแถวตาราง/การ์ด — ความหนาไล่ตามความเร่งด่วน */
export interface PriorityBarProps {
  priority: TicketPriority;
  className?: string;
}
```

โครงเหมือน `StatusBadge` ต่างที่ใช้ `PRIORITY_META` และ `PriorityBar` render `<span aria-hidden="true">` ที่มี `style={{ width: meta.barWidthPx }}` (เป็นสัญญาณเสริม ไม่ใช่ข้อมูลเดี่ยว)

### 2.6 `SlaIndicator`

```ts
export interface SlaIndicatorProps {
  sla: TicketSla;
  /** 'inline' = ในตาราง (บรรทัดเดียว) · 'detail' = ในหน้ารายละเอียด (มีแถบ + สองบรรทัด) */
  variant?: 'inline' | 'detail';
  /** end_user จะไม่เห็นตัวเลขเป้าและคำว่า "เกินกำหนด" (UX-03) */
  audience?: 'agent' | 'requester';
  className?: string;
}
```

| หัวข้อ | ข้อกำหนด |
|---|---|
| แหล่งค่า | `sla.status`, `sla.remaining_minutes`, `sla.resolution_due_at`, `sla.first_response_at`, `sla.is_*_breached` — **ทั้งหมดจาก backend** |
| **ห้ามทำ countdown** | `remaining_minutes` เป็นนาที**ทำการ** เดินฝั่ง client ไม่ได้ (ดู `20-frontend-architecture.md` §9 FE-07) — แสดงค่าคงที่แล้วให้ query refetch ทุก 60 วินาทีในหน้าที่เปิดค้าง |
| การจัดรูปนาที | `formatBusinessMinutes(240)` → `"4 ชม."`, `(42)` → `"42 นาที"`, `(386)` → `"6 ชม. 26 นาที"`, `(2700)` → `"5 วันทำการ"` (÷540) |
| ข้อความต่อท้าย | ต่อท้าย "(เวลาทำการ)" ทุกครั้งที่แสดงระยะเวลา (UX-04) |
| แถบความคืบหน้า | `variant='detail'` แสดง `<Progress>` ที่ `value = (1 - remaining/target) * 100`; `paused` = ลายเส้นประ; `breached` = เต็มแถบ + ลายทแยง |
| `audience='requester'` | แสดงเฉพาะ "กำหนดแก้ไขเสร็จโดยประมาณ: 31 ส.ค. 13:15 น."; ถ้า breach แสดง "ทีมงานกำลังเร่งดำเนินการ" ไม่ใช่ "เกินกำหนด" |
| ตอบรับแล้ว | ถ้า `first_response_at !== null` แสดงบรรทัด "ตอบรับแล้ว ✓ ตรงเวลา" หรือ "✕ เกินกำหนดตอบรับ" |
| a11y | `<time dateTime={resolution_due_at}>` + ข้อความสถานะเป็นตัวอักษรจริง ไม่ใช่แค่สีแถบ |

### 2.7 `FileUploader`

```ts
export interface FileUploaderProps {
  /** ผูกกับอะไร — ส่งไปกับ POST /attachments */
  target: { ticket_id?: number; comment_id?: number; kb_article_id?: number };
  value: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  maxFiles?: number;                  // ค่าเริ่มต้น 5
  maxFileSizeBytes?: number;          // ค่าเริ่มต้น 20 * 1024 * 1024
  accept?: string;                    // ค่าเริ่มต้นจาก ALLOWED_MIME
  /** true = เปิดกล้องหลังตรงบนมือถือ (capture="environment") */
  enableCamera?: boolean;
  /** จำนวนไฟล์ที่อัปโหลดพร้อมกัน (ค่าเริ่มต้น 2 — เน็ตหน้างานแคบ) */
  concurrency?: number;
  disabled?: boolean;
}

export interface UploadedFile {
  /** id ชั่วคราวฝั่ง client ก่อนอัปโหลดสำเร็จ */
  clientId: string;
  /** id จาก POST /attachments เมื่อสำเร็จ */
  attachmentId: number | null;
  fileName: string;
  originalBytes: number;
  uploadedBytes: number;
  mimeType: string;
  status: 'pending' | 'compressing' | 'uploading' | 'done' | 'error';
  progressPercent: number;
  /** ผลการบีบอัด (FR-13) */
  compressedBytes: number | null;
  errorMessage: string | null;
  previewUrl: string | null;          // object URL — ต้อง revoke ตอน unmount
}
```

| ขั้น | ข้อกำหนด |
|---|---|
| 1 ตรวจก่อน | จำนวนรวม ≤ `maxFiles`, นามสกุลอยู่ใน allowlist (`03-api-spec.md` §2.6), ขนาดดิบ ≤ 20 MB — ผิดข้อไหนแสดง error รายไฟล์ทันทีโดยไม่ใช้เน็ต |
| 2 บีบอัด | `compressImageIfNeeded()` (`20-frontend-architecture.md` §7.3) — สถานะ `compressing` แสดง "กำลังบีบอัด…" |
| 3 อัปโหลด | คิวแบบจำกัด `concurrency` ไฟล์พร้อมกัน; `onUploadProgress` → `progressPercent` |
| 4 แสดงผล | บอกผลบีบอัดให้เห็น "8.1 MB → 1.4 MB ✓" (ผู้ใช้หน้างานเห็นว่าประหยัดเน็ต) |
| 5 ล้มเหลว | 413 → "ไฟล์ใหญ่เกิน 20 MB"; 415 → "ไม่รองรับไฟล์ประเภทนี้"; network → ปุ่ม **ลองใหม่** รายไฟล์ |
| 6 ลบ | ก่อนสร้าง ticket ลบได้ทันที (client เท่านั้น); หลังผูกกับ ticket แล้วเรียก `DELETE /attachments/{id}` และถามยืนยัน L1 (undo ได้ 5 วินาที) |
| 7 หน่วยความจำ | `URL.revokeObjectURL()` ทุก preview ตอน unmount (มือถือหน่วยความจำน้อย) |
| 8 a11y | drop zone มี `role="button"` + `tabIndex={0}` + รองรับ Enter/Space; progress ใช้ `role="progressbar"`; ปุ่มลบมี `aria-label` ระบุชื่อไฟล์ |

> **หมายเหตุไฟล์กำพร้า:** ไฟล์ถูกอัปโหลดก่อนสร้าง ticket ถ้าผู้ใช้ปิดหน้าไปจะเหลือ attachment ที่ไม่ผูกกับอะไร — เป็นงานของ backend ที่ต้องมี job ล้างไฟล์กำพร้า (แจ้ง SA แล้ว)

### 2.8 `CompanySwitcher`

```ts
export interface CompanySwitcherProps {
  /** true = มีตัวเลือก "ทุกบริษัทในขอบเขต" (ค่า null) */
  allowAll?: boolean;
  variant?: 'topbar' | 'inline';
  className?: string;
}
```

| หัวข้อ | ข้อกำหนด |
|---|---|
| แหล่งรายการ | `user.scoped_companies` จาก `/auth/me` (super_admin ได้ทั้ง 7 จาก `GET /companies`) |
| **ซ่อนเมื่อไร** | มีบริษัทในขอบเขตเพียง 1 บริษัท → **ไม่แสดง component นี้เลย** แสดงเป็นข้อความชื่อบริษัทแทน (end_user ส่วนใหญ่ตกเคสนี้) |
| ค่าที่เลือก | เก็บที่ `useAuth().activeCompanyId` + `localStorage` — เป็นส่วนหนึ่งของ query key ทุกหน้า cache จึงแยกกันอัตโนมัติ |
| ผลเมื่อเปลี่ยน | ทุก query ที่มี `company_id` refetch เอง; ตัวกรองในหน้าที่เปิดอยู่ถูกรีเซ็ตเฉพาะ `category_id`/`assignee_id` (ผูกกับบริษัท) |
| คำเตือน | มี tooltip "ตัวเลือกนี้กรองสิ่งที่คุณเห็นเท่านั้น สิทธิ์การเข้าถึงถูกกำหนดโดยผู้ดูแลระบบ" |
| a11y | `<Select>` ของ Radix พร้อม `aria-label="เลือกบริษัทที่ต้องการดู"`; แสดงทั้งรหัสและชื่อไทย |

### 2.9 `KbArticleViewer`

```ts
export interface KbArticleViewerProps {
  article: KbArticle;
  /** ให้คะแนนได้หรือไม่ (โหวตไปแล้วจะปิด) */
  canGiveFeedback?: boolean;
  /** ปุ่ม "แจ้งปัญหาเรื่องนี้" — ส่งหัวข้อไปเติมในฟอร์ม */
  onCreateTicket?: (prefill: { subject: string; kbArticleId: number }) => void;
  onEdit?: () => void;
}
```

| หัวข้อ | ข้อกำหนด |
|---|---|
| การ render Markdown | `react-markdown` + `remark-gfm` + **`rehype-sanitize` บังคับ** (schema `defaultSchema` ตัด `script`, `iframe`, `on*`, `style`) — เนื้อหาเขียนโดย agent จึงเป็น untrusted input |
| ลิงก์ภายนอก | `target="_blank" rel="noopener noreferrer"` + ไอคอนลิงก์ออก |
| หัวข้อในบทความ | สร้าง anchor id อัตโนมัติ + สารบัญด้านข้างเมื่อมี `h2` ≥ 3 อัน (เดสก์ท็อป) |
| รูปในบทความ | `loading="lazy"`, กดแล้วเปิด `ImageLightbox`, มี `alt` จาก Markdown |
| โค้ดบล็อก | พื้นเทาอ่อน + ปุ่มคัดลอก (ไม่ใส่ syntax highlighter — เพิ่ม bundle โดยไม่จำเป็นกับ KB งาน IT ทั่วไป) |
| ป้ายการมองเห็น | `public` 🌐 ทุกบริษัท · `company` 🏢 เฉพาะ {ชื่อบริษัท} · `agent_only` 🔒 เฉพาะทีม support |
| สถานะ | `draft` แสดงแถบเหลือง "ฉบับร่าง — ผู้ใช้ทั่วไปยังไม่เห็นบทความนี้" · `archived` แสดงแถบเทา |
| ให้คะแนน | ปุ่ม 👍/👎 optimistic (§4.4 ของเอกสารสถาปัตยกรรม); `409` → rollback + "คุณให้คะแนนบทความนี้ไปแล้ว" |
| นับ view | เกิดที่ backend ตอน `GET /kb/articles/{id}` — FE ไม่ต้องทำอะไร แต่ต้องระวังไม่เรียกซ้ำโดยไม่จำเป็น (`staleTime` 5 นาที) |
| ความยาวบรรทัด | จำกัด `max-w-[72ch]` เพื่ออ่านง่าย |

### 2.10 `StatCard`

```ts
export interface StatCardProps {
  label: string;
  value: number | string;
  /** หน่วยต่อท้าย เช่น "ใบ" "นาที" */
  unit?: string;
  icon?: LucideIcon;
  /** โทนที่สื่อความหมาย — 'warning'/'danger' ใช้เมื่อค่าสูงคือเรื่องไม่ดี */
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  trend?: {
    value: number;              // ผลต่างจากช่วงก่อนหน้า
    direction: 'up' | 'down' | 'flat';
    /** ขึ้นแล้วดีหรือไม่ — 'เกินกำหนด' ขึ้นคือแย่ */
    isPositive: boolean;
    label: string;              // "จากเดือนก่อน"
  };
  /** กดแล้วไปหน้ารายการพร้อมตัวกรองที่ตรงกัน */
  href?: string;
  isLoading?: boolean;
  hint?: string;                // tooltip อธิบายวิธีนับ
}
```

| หัวข้อ | ข้อกำหนด |
|---|---|
| การ์ด 4 ใบตาม FR-60 | เรื่องที่เปิดอยู่ (`open_tickets`) · เกินกำหนด SLA (`overdue_tickets`, tone `danger`) · ปิดวันนี้ (`closed_today`) · เวลาแก้ไขเฉลี่ย (`avg_resolution_business_minutes` → `formatBusinessMinutes`) |
| กดได้ | ทุกใบลิงก์ไปหน้ารายการพร้อมตัวกรอง เช่น `/tickets?sla_status=breached` — ตัวเลขบน dashboard ต้อง "เจาะลงไปดูได้" |
| แนวโน้ม | ลูกศร + สี + **ข้อความ** ("เพิ่มขึ้น 5 จากเดือนก่อน") ไม่ใช่ลูกศรสีเดียว |
| หน่วยเวลา | ต่อท้าย "(นาทีทำการ)" ใน `hint` เสมอ |
| loading | `<Skeleton>` ที่ขนาดเท่าของจริง — กัน layout shift |
| a11y | `<a>` จริงเมื่อมี `href`; ตัวเลขไม่ใช่ `<h1>`; label ผูกกับค่าใน `aria-label` เดียว |

### 2.11 `TicketChart` และ `ConfirmDialog`

```ts
export type TicketChartKind = 'trend' | 'by-status' | 'by-priority' | 'by-company' | 'by-category';

export interface TicketChartProps {
  kind: TicketChartKind;
  data: ChartDatum[];
  isLoading?: boolean;
  error?: ApiError | null;
  height?: number;                    // ค่าเริ่มต้น 280
  /** คลิกส่วนของกราฟ → ไปหน้ารายการพร้อมตัวกรอง */
  onSegmentClick?: (datum: ChartDatum) => void;
  /** แสดงตารางข้อมูลใต้กราฟ (a11y — บังคับเปิดได้เสมอ) */
  showDataTable?: boolean;
}

export interface ChartDatum {
  key: string;                        // 'critical' | '2026-08-01' | ...
  label: string;                      // ข้อความไทยที่แสดง
  value: number;
  /** ซีรีส์ที่สอง เช่น "ปิด" ในกราฟแนวโน้ม */
  secondaryValue?: number;
  color?: string;
}
```

| หัวข้อ | ข้อกำหนด |
|---|---|
| ชนิดกราฟ | `trend` = LineChart 2 เส้น (สร้าง/ปิด) · `by-status`/`by-category` = BarChart แนวนอน (ชื่อไทยยาว) · `by-priority` = BarChart + สี `PRIORITY_META` · `by-company` = BarChart แนวนอน |
| **ไม่ใช้ Pie/Donut** | เปรียบเทียบสัดส่วน 7 สถานะด้วยวงกลมอ่านยากและต้องพึ่งสี — ใช้แท่งแนวนอนพร้อมตัวเลขกำกับแทน |
| สี | จาก `--chart-1..6` (ผ่าน 3:1 ทุกตัว) หรือสีความหมายเมื่อเป็น status/priority |
| ป้ายค่า | ทุกแท่ง/จุดมีตัวเลขกำกับ ไม่ต้องพึ่ง tooltip อย่างเดียว (มือถือไม่มี hover) |
| a11y | มีสวิตช์ "ดูเป็นตาราง" ที่ render `<table>` ของข้อมูลชุดเดียวกัน + `<figure><figcaption>` อธิบายกราฟ |
| lazy | ไฟล์นี้เป็นที่เดียวที่ `import` recharts → กลายเป็น chunk ของ dashboard/reports โดยอัตโนมัติ |
| responsive | `<ResponsiveContainer>`; มือถือลดจำนวน tick แกน X เหลือ 4 จุด |
| empty | ไม่มีข้อมูล → `<EmptyState>` ในกรอบขนาดเท่ากราฟ ไม่ใช่กราฟเปล่า |

```ts
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;                      // "ปิดใช้งานบัญชี ปิยะ ศรีสุข?"
  description: string;
  /** ผลที่จะเกิดจริง แสดงเป็นรายการ */
  consequences?: string[];
  /** จำนวนที่กระทบ เช่น { label: 'เรื่องที่ยังไม่ปิดในความดูแล', count: 9 } */
  impact?: { label: string; count: number };
  confirmLabel: string;               // "ปิดใช้งาน"
  cancelLabel?: string;               // ค่าเริ่มต้น "ยกเลิก"
  variant?: 'default' | 'danger';
  /** L3 — ต้องพิมพ์ข้อความนี้ให้ตรงจึงกดยืนยันได้ */
  requireTypedConfirmation?: { expected: string; label: string };
  /** ช่องกรอกเหตุผล (บังคับสำหรับ cancel / reopen / เปลี่ยน priority) */
  reasonField?: { required: boolean; label: string; maxLength: number };
  /** เนื้อหาเพิ่ม เช่น dropdown เลือกผู้รับงานแทน */
  children?: ReactNode;
  onConfirm: (result: { reason?: string }) => Promise<void>;
  isPending?: boolean;
}
```

### 2.12 `UserForm` (ประกอบใน §3.2)

```ts
export interface UserFormProps {
  mode: 'create' | 'edit';
  user?: AppUser;
  /** บริษัทที่เลือกได้ — company_admin จะได้บริษัทเดียวและถูกล็อก (US-08 AC-1) */
  selectableCompanies: CompanyRef[];
  /** role ที่มอบได้ — company_admin มอบ super_admin ไม่ได้ (US-08 AC-2) */
  assignableRoles: RoleRef[];
  onSuccess: (user: AppUser) => void;
  onCancel: () => void;
}
```

---

## 3. ตาราง Validation (Zod)

> **หลักการ:** schema ฝั่ง client เป็น "ตัวช่วยผู้ใช้" ไม่ใช่มาตรการความปลอดภัย — backend ตรวจซ้ำเสมอ · schema ต้อง**ไม่เข้มกว่า** backend (ไม่งั้นผู้ใช้จะกรอกค่าที่ระบบยอมรับได้ไม่ได้)

### 3.1 ฟอร์มแจ้งปัญหา — `ticketCreateSchema`

| ฟิลด์ | กฎ | ข้อความ error ภาษาไทย |
|---|---|---|
| `subject` | บังคับ, trim, 5–255 ตัวอักษร | ว่าง: **"กรุณาระบุหัวข้อปัญหา"** · สั้น: **"หัวข้อสั้นเกินไป กรุณาระบุอย่างน้อย 5 ตัวอักษร"** · ยาว: **"หัวข้อยาวเกินไป (สูงสุด 255 ตัวอักษร)"** |
| `description` | บังคับ, trim, 10–5000 ตัวอักษร | ว่าง: **"กรุณาอธิบายรายละเอียดของปัญหา"** · สั้น: **"กรุณาอธิบายเพิ่มอีกเล็กน้อย เพื่อให้ทีมงานเข้าใจปัญหา (อย่างน้อย 10 ตัวอักษร)"** · ยาว: **"รายละเอียดยาวเกินไป (สูงสุด 5,000 ตัวอักษร)"** |
| `category_id` | บังคับ, จำนวนเต็มบวก, ต้องเป็นหมวด**ย่อย** (มี `parent_id`) | ว่าง: **"กรุณาเลือกหมวดหมู่ปัญหา"** · เลือกหมวดหลัก: **"กรุณาเลือกหมวดหมู่ย่อยให้เจาะจงขึ้น"** |
| `priority` | บังคับ, enum 4 ค่า | **"กรุณาเลือกระดับความเร่งด่วน"** |
| `company_id` | ไม่บังคับ, จำนวนเต็มบวก, ต้องอยู่ใน `scoped_company_ids` | **"คุณไม่มีสิทธิ์แจ้งเรื่องให้บริษัทนี้"** |
| `department_id` | ไม่บังคับ, จำนวนเต็มบวก | — |
| `requester_id` | ไม่บังคับ; ระบุคนอื่นได้เฉพาะเมื่อมี `ticket.create_for_other` | **"คุณไม่มีสิทธิ์แจ้งแทนผู้อื่น"** |
| `attachment_ids` | array ของจำนวนเต็ม, สูงสุด 5 | **"แนบไฟล์ได้สูงสุด 5 ไฟล์ต่อครั้ง"** |
| **ระดับฟอร์ม** | ถ้ายังมีไฟล์สถานะ `uploading` | **"ยังมีไฟล์ที่อัปโหลดไม่เสร็จ กรุณารอสักครู่หรือลบไฟล์นั้นออก"** |

```ts
// src/features/tickets/schemas/ticketSchemas.ts
import { z } from 'zod';
import { TICKET_PRIORITIES } from '@/config/enums';

export const ticketCreateSchema = z.object({
  subject: z
    .string({ required_error: 'กรุณาระบุหัวข้อปัญหา' })
    .trim()
    .min(1, 'กรุณาระบุหัวข้อปัญหา')
    .min(5, 'หัวข้อสั้นเกินไป กรุณาระบุอย่างน้อย 5 ตัวอักษร')
    .max(255, 'หัวข้อยาวเกินไป (สูงสุด 255 ตัวอักษร)'),

  description: z
    .string({ required_error: 'กรุณาอธิบายรายละเอียดของปัญหา' })
    .trim()
    .min(1, 'กรุณาอธิบายรายละเอียดของปัญหา')
    .min(10, 'กรุณาอธิบายเพิ่มอีกเล็กน้อย เพื่อให้ทีมงานเข้าใจปัญหา (อย่างน้อย 10 ตัวอักษร)')
    .max(5000, 'รายละเอียดยาวเกินไป (สูงสุด 5,000 ตัวอักษร)'),

  category_id: z
    .number({ required_error: 'กรุณาเลือกหมวดหมู่ปัญหา', invalid_type_error: 'กรุณาเลือกหมวดหมู่ปัญหา' })
    .int()
    .positive('กรุณาเลือกหมวดหมู่ปัญหา'),

  priority: z.enum(TICKET_PRIORITIES, {
    required_error: 'กรุณาเลือกระดับความเร่งด่วน',
    invalid_type_error: 'กรุณาเลือกระดับความเร่งด่วน',
  }),

  company_id: z.number().int().positive().nullable().optional(),
  department_id: z.number().int().positive().nullable().optional(),
  requester_id: z.number().int().positive().nullable().optional(),

  attachment_ids: z
    .array(z.number().int().positive())
    .max(5, 'แนบไฟล์ได้สูงสุด 5 ไฟล์ต่อครั้ง')
    .default([]),
});

export type TicketCreateInput = z.infer<typeof ticketCreateSchema>;
```

**ฟอร์มย่อยที่เกี่ยวข้อง**

| ฟอร์ม | ฟิลด์ | กฎ | ข้อความ error |
|---|---|---|---|
| คอมเมนต์ | `body` | บังคับ, trim, 1–5000 | **"กรุณาพิมพ์ข้อความ"** / **"ข้อความยาวเกินไป (สูงสุด 5,000 ตัวอักษร)"** |
| | `is_internal` | boolean; `end_user` ส่ง `true` ไม่ได้ | **"คุณไม่มีสิทธิ์เขียนบันทึกภายในทีม"** |
| เปลี่ยนสถานะ → `pending_user` | `reason` | บังคับ 5–500 | **"กรุณาระบุว่ากำลังรอข้อมูลอะไรจากผู้แจ้ง"** |
| | `comment` | บังคับ 5–5000 | **"ต้องแจ้งผู้แจ้งว่ารออะไร ก่อนหยุดนับเวลา"** |
| เปลี่ยนสถานะ → `resolved` | `resolution_note` | บังคับ 10–2000 | **"กรุณาสรุปวิธีแก้ไขปัญหา (อย่างน้อย 10 ตัวอักษร)"** |
| เปลี่ยนสถานะ → `cancelled` | `reason` | บังคับ 5–500 | **"กรุณาระบุเหตุผลที่ยกเลิกเรื่องนี้"** |
| เปิดเรื่องซ้ำ | `reason` | บังคับ 5–500 | **"กรุณาระบุว่าปัญหาเดิมยังเกิดอยู่อย่างไร"** |
| เปลี่ยนความเร่งด่วน | `priority` + `reason` | บังคับทั้งคู่, reason 5–500 | **"กรุณาระบุเหตุผลที่เปลี่ยนระดับความเร่งด่วน"** |

### 3.2 ฟอร์มผู้ใช้ — `userCreateSchema` / `userUpdateSchema`

| ฟิลด์ | กฎ | ข้อความ error ภาษาไทย |
|---|---|---|
| `username` | บังคับ, 3–50, `^[a-z0-9][a-z0-9._-]*$` (ตัวพิมพ์เล็ก) | ว่าง: **"กรุณาระบุชื่อผู้ใช้"** · สั้น: **"ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร"** · รูปแบบผิด: **"ชื่อผู้ใช้ใช้ได้เฉพาะตัวอักษรภาษาอังกฤษพิมพ์เล็ก ตัวเลข จุด ขีดกลาง และขีดล่าง"** · ซ้ำ (409 จาก server): **"ชื่อผู้ใช้นี้มีอยู่แล้วในระบบ"** |
| `full_name` | บังคับ, trim, 2–150 | **"กรุณาระบุชื่อ-นามสกุล"** / **"ชื่อ-นามสกุลยาวเกินไป (สูงสุด 150 ตัวอักษร)"** |
| `email` | ไม่บังคับ, รูปแบบอีเมล, ≤ 150 | **"รูปแบบอีเมลไม่ถูกต้อง"** · เตือน (ไม่บล็อก): **"ไม่ได้ระบุอีเมล ผู้ใช้จะไม่ได้รับการแจ้งเตือนทางอีเมล"** |
| `password` (โหมดสร้าง) | บังคับ, ≥ 8, ต้องมีตัวอักษร **และ** ตัวเลข (NFR-10) | สั้น: **"รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"** · ไม่ครบเงื่อนไข: **"รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข"** |
| `confirm_password` | ต้องตรงกับ `password` | **"รหัสผ่านทั้งสองช่องไม่ตรงกัน"** |
| `company_id` | บังคับ, ต้องอยู่ในรายการที่เลือกได้ | ว่าง: **"กรุณาเลือกบริษัท"** · นอกขอบเขต: **"คุณสร้างผู้ใช้ได้เฉพาะในบริษัทที่คุณดูแล"** |
| `department_id` | ไม่บังคับ | — |
| `employee_code` | ไม่บังคับ, ≤ 50 | **"รหัสพนักงานยาวเกินไป (สูงสุด 50 ตัวอักษร)"** |
| `phone` | ไม่บังคับ, `^[0-9+\-() ]{6,30}$` | **"รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง"** |
| `job_title` | ไม่บังคับ, ≤ 100 | **"ตำแหน่งยาวเกินไป (สูงสุด 100 ตัวอักษร)"** |
| `roles` | บังคับ ≥ 1; ต้องมี `end_user` เสมอ (`04-rbac-sla.md` §1.1 ข้อ 1); ห้าม `super_admin` ถ้าผู้กระทำไม่ใช่ super_admin | ว่าง: **"กรุณาเลือกบทบาทอย่างน้อยหนึ่งอย่าง"** · ขาด end_user: **"ผู้ใช้ทุกคนต้องมีบทบาท 'ผู้แจ้ง' เป็นพื้นฐาน"** · super_admin: **"คุณไม่มีสิทธิ์มอบบทบาทผู้ดูแลระบบ"** |
| `scoped_company_ids` | บังคับ ≥ 1 เมื่อมี role `agent`/`company_admin`/`manager_viewer`; ทุกค่าต้องอยู่ในขอบเขตของผู้กระทำ | ว่าง: **"กรุณาเลือกบริษัทที่บทบาทนี้ดูแลอย่างน้อยหนึ่งบริษัท"** · นอกขอบเขต: **"คุณมอบสิทธิ์ได้เฉพาะบริษัทที่คุณดูแล"** |
| `is_active` | boolean | — |
| **เปลี่ยนรหัสผ่านตนเอง** | `current_password` บังคับ; `new_password` ตามกฎด้านบน + ต้องต่างจากเดิม | **"กรุณากรอกรหัสผ่านปัจจุบัน"** · **"รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม"** · 400 จาก server: **"รหัสผ่านปัจจุบันไม่ถูกต้อง"** |

```ts
// src/features/admin/users/schemas/userSchemas.ts
import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
  .max(128, 'รหัสผ่านยาวเกินไป (สูงสุด 128 ตัวอักษร)')
  .refine(
    (value) => /[A-Za-z]/.test(value) && /[0-9]/.test(value),
    'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข',
  );

export const userCreateSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(1, 'กรุณาระบุชื่อผู้ใช้')
      .min(3, 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร')
      .max(50, 'ชื่อผู้ใช้ยาวเกินไป (สูงสุด 50 ตัวอักษร)')
      .regex(
        /^[a-z0-9][a-z0-9._-]*$/,
        'ชื่อผู้ใช้ใช้ได้เฉพาะตัวอักษรภาษาอังกฤษพิมพ์เล็ก ตัวเลข จุด ขีดกลาง และขีดล่าง',
      ),
    full_name: z.string().trim().min(1, 'กรุณาระบุชื่อ-นามสกุล').max(150, 'ชื่อ-นามสกุลยาวเกินไป (สูงสุด 150 ตัวอักษร)'),
    email: z.string().trim().email('รูปแบบอีเมลไม่ถูกต้อง').max(150).nullable().optional(),
    employee_code: z.string().trim().max(50, 'รหัสพนักงานยาวเกินไป (สูงสุด 50 ตัวอักษร)').nullable().optional(),
    phone: z.string().trim().regex(/^[0-9+\-() ]{6,30}$/, 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง').nullable().optional(),
    job_title: z.string().trim().max(100, 'ตำแหน่งยาวเกินไป (สูงสุด 100 ตัวอักษร)').nullable().optional(),
    company_id: z.number({ required_error: 'กรุณาเลือกบริษัท' }).int().positive('กรุณาเลือกบริษัท'),
    department_id: z.number().int().positive().nullable().optional(),
    password: passwordSchema,
    confirm_password: z.string(),
    roles: z.array(z.string()).min(1, 'กรุณาเลือกบทบาทอย่างน้อยหนึ่งอย่าง'),
    scoped_company_ids: z.array(z.number().int().positive()).default([]),
    is_active: z.boolean().default(true),
  })
  .refine((data) => data.password === data.confirm_password, {
    path: ['confirm_password'],
    message: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน',
  })
  .refine((data) => data.roles.includes('end_user'), {
    path: ['roles'],
    message: "ผู้ใช้ทุกคนต้องมีบทบาท 'ผู้แจ้ง' เป็นพื้นฐาน",
  })
  .refine(
    (data) => {
      const needsScope = ['agent', 'company_admin', 'manager_viewer'];
      return !data.roles.some((role) => needsScope.includes(role)) || data.scoped_company_ids.length > 0;
    },
    {
      path: ['scoped_company_ids'],
      message: 'กรุณาเลือกบริษัทที่บทบาทนี้ดูแลอย่างน้อยหนึ่งบริษัท',
    },
  );

export type UserCreateInput = z.infer<typeof userCreateSchema>;
```

### 3.3 การผูก error จาก server เข้าฟอร์ม

```ts
// src/lib/formErrors.ts
import type { UseFormSetError, FieldValues, Path } from 'react-hook-form';
import type { ApiError } from '@/lib/errors';

/**
 * นำ details[] จาก VALIDATION_ERROR ไปวางที่ฟิลด์ที่ตรงกัน
 * ฟิลด์ที่ไม่รู้จักถูกรวมไว้ที่ root เพื่อไม่ให้ข้อความหาย
 */
export function applyApiErrorToForm<T extends FieldValues>(
  error: ApiError,
  setError: UseFormSetError<T>,
  knownFields: readonly string[],
): void {
  if (error.code !== 'VALIDATION_ERROR') {
    setError('root' as Path<T>, { type: 'server', message: error.message });
    return;
  }

  const unmatched: string[] = [];
  for (const detail of error.details) {
    if (knownFields.includes(detail.field)) {
      setError(detail.field as Path<T>, { type: 'server', message: detail.message });
    } else {
      unmatched.push(`${detail.field}: ${detail.message}`);
    }
  }
  if (unmatched.length > 0) {
    setError('root' as Path<T>, { type: 'server', message: unmatched.join(' · ') });
  }
}
```

---

## 4. TypeScript type ของ API response หลัก

> ทั้งหมด **derive จาก `types/api.generated.ts`** ที่ gen ด้วย `openapi-typescript` — ไฟล์ `types/domain.ts` ทำหน้าที่ตั้งชื่อให้อ่านง่ายเท่านั้น ตารางนี้คือสิ่งที่คาดหวังว่า schema จะตรงกัน ถ้าไม่ตรงถือว่า `03-api-spec.md` กับโค้ดหลุดจากกัน (CI จะจับ)

### 4.1 โครงกลาง

| Type | ตรงกับ | หมายเหตุ |
|---|---|---|
| `Paginated<T>` | §1.2 | `items`, `page`, `page_size`, `total`, `total_pages` |
| `ApiErrorBody` | §1.3 | `error.code`, `error.message`, `error.details[]`, `error.request_id` |
| `CompanyRef` | ทุก endpoint | `id`, `code`, `name_th?` |
| `UserRef` | ทุก endpoint | `id`, `full_name`, `email?` |

```ts
// src/types/domain.ts (ส่วนกลาง)
export interface Paginated<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface ApiErrorDetail { field: string; message: string }
export interface ApiErrorBody {
  error: { code: string; message: string; details?: ApiErrorDetail[]; request_id?: string };
}

export interface CompanyRef { id: number; code: string; name_th?: string }
export interface DepartmentRef { id: number; name: string }
export interface UserRef { id: number; full_name: string; email?: string }
export interface CategoryRef {
  id: number;
  code?: string;
  name_th: string;
  parent_name_th?: string;
}
```

### 4.2 Auth

| ฟิลด์ | ชนิด | จาก |
|---|---|---|
| `access_token`, `refresh_token` | `string` | §3.1 |
| `token_type` | `'bearer'` | |
| `expires_in` | `number` (วินาที) | |
| `must_change_password` | `boolean` | **ขอให้เพิ่มใน `/auth/me` ด้วย** (FE-03) |
| `user.roles` | `RoleCode[]` | |
| `user.permissions` | `PermissionCode[]` | 43 ค่าตาม `04-rbac-sla.md` §7 |
| `user.scoped_companies` | `CompanyRef[]` | |

```ts
export const ROLE_CODES = ['end_user', 'agent', 'company_admin', 'manager_viewer', 'super_admin'] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export interface LoginInput { username: string; password: string }

export interface CurrentUser {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  company: CompanyRef;
  department: DepartmentRef | null;
  roles: RoleCode[];
  scoped_companies: CompanyRef[];
  permissions: PermissionCode[];
  must_change_password?: boolean;   // ← FE-03
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
  must_change_password: boolean;
  user: CurrentUser;
}
```

### 4.3 Ticket

| ฟิลด์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | `number` | |
| `ticket_no` | `string` | `AIDC-LOG-202608-0042` |
| `subject`, `description` | `string` | |
| `status` | `TicketStatus` | 7 ค่า |
| `priority` | `TicketPriority` | 4 ค่า |
| `source` | `TicketSource` | `web` / `mobile_web` / `phone` / `email` / `line` |
| `company` | `CompanyRef` | |
| `department` | `DepartmentRef \| null` | |
| `category` | `CategoryRef` | |
| `requester`, `assignee` | `UserRef` / `UserRef \| null` | |
| `sla` | `TicketSla` | ดูด้านล่าง |
| `attachments` | `Attachment[]` | เฉพาะ detail |
| `reopen_count` | `number` | |
| `resolution_note` | `string \| null` | |
| `created_at`, `updated_at` | `string` (ISO 8601 +07:00) | |
| `can` *(ขอเพิ่ม)* | `TicketCapabilities` | FE-02 — ถ้า SA ไม่เพิ่ม FE ต้องประเมินสิทธิ์เองด้วย `permissions[]` + สถานะ |

```ts
export const TICKET_SOURCES = ['web', 'mobile_web', 'phone', 'email', 'line'] as const;
export type TicketSource = (typeof TICKET_SOURCES)[number];

export interface TicketSla {
  policy_id?: number;
  response_due_at: string | null;
  resolution_due_at: string | null;
  first_response_at: string | null;
  status: SlaStatus;
  /** นาที**ทำการ**ที่เหลือ — ติดลบเมื่อเกินกำหนด · ห้ามใช้ทำ countdown */
  remaining_minutes: number;
  is_response_breached: boolean;
  is_resolution_breached: boolean;
  paused_at?: string | null;
  pending_duration_minutes?: number;
}

export interface Attachment {
  id: number;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_at?: string;
  uploaded_by?: UserRef;
}

/** ขอให้ backend คำนวณให้ — ดู 20-frontend-architecture.md §9 FE-02 */
export interface TicketCapabilities {
  update: boolean; assign: boolean; claim: boolean;
  change_status: boolean; change_priority: boolean;
  comment: boolean; comment_internal: boolean;
  close: boolean; reopen: boolean; cancel: boolean; delete: boolean;
}

export interface Ticket {
  id: number;
  ticket_no: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  source: TicketSource;
  company: CompanyRef;
  department: DepartmentRef | null;
  category: CategoryRef;
  requester: UserRef;
  assignee: UserRef | null;
  sla: TicketSla;
  attachments: Attachment[];
  reopen_count: number;
  resolution_note: string | null;
  satisfaction_score: number | null;
  created_at: string;
  updated_at: string;
  can?: TicketCapabilities;
}

/** รายการ — เบากว่า detail (ตาม §3.3 ของ API spec) */
export interface TicketListItem {
  id: number;
  ticket_no: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  company: CompanyRef;
  category: Pick<CategoryRef, 'id' | 'name_th'>;
  requester: UserRef;
  assignee: UserRef | null;
  sla: Pick<TicketSla, 'resolution_due_at' | 'status' | 'remaining_minutes'>;
  comment_count: number;
  attachment_count: number;
  created_at: string;
  updated_at: string;
  // ── ขอเพิ่ม (FE-09) ──
  department?: DepartmentRef | null;
  reopen_count?: number;
}

export interface TicketListParams {
  status?: TicketStatus[];
  priority?: TicketPriority[];
  company_id?: number;
  category_id?: number;
  assignee_id?: number | 'null';
  requester_id?: number;
  sla_status?: SlaStatus[];
  created_from?: string;
  created_to?: string;
  q?: string;
  sort?: string;
  page?: number;
  page_size?: number;
}

export interface TicketComment {
  id: number;
  ticket_id: number;
  author: UserRef | null;     // null = ระบบ
  body: string;
  is_internal: boolean;
  is_system: boolean;
  attachments: Attachment[];
  created_at: string;
  updated_at: string;
}

export interface TicketStatusHistory {
  id: number;
  ticket_id: number;
  from_status: TicketStatus | null;
  to_status: TicketStatus;
  from_assignee: UserRef | null;
  to_assignee: UserRef | null;
  from_priority: TicketPriority | null;
  to_priority: TicketPriority | null;
  reason: string | null;
  changed_by: UserRef | null; // null = ระบบ
  changed_at: string;
}
```

### 4.4 Dashboard / Report

```ts
export interface DashboardParams {
  company_id?: number | null;
  date_from: string;   // YYYY-MM-DD
  date_to: string;
}

export interface DashboardSummary {
  period: { date_from: string; date_to: string };
  scope: { companies: CompanyRef[] };
  cards: {
    open_tickets: number;
    overdue_tickets: number;
    closed_today: number;
    avg_resolution_business_minutes: number;
  };
  by_status: Array<{ status: TicketStatus; count: number }>;
  by_priority: Array<{ priority: TicketPriority; count: number }>;
  sla: {
    total_measured: number;
    response_met: number;
    response_met_percent: number;
    resolution_met: number;
    resolution_met_percent: number;
  };
}

export interface TrendPoint { date: string; created: number; closed: number }
export interface ByCompanyRow { company: CompanyRef; count: number }
export interface ByCategoryRow { category: Pick<CategoryRef, 'id' | 'name_th'>; count: number }

export interface AssigneeWorkloadRow {
  assignee: UserRef | null;    // null = ยังไม่มีผู้รับผิดชอบ
  open_count: number;
  in_progress_count: number;
  overdue_count: number;
  closed_count: number;
  sla_met_percent: number | null;
}

export interface SlaComplianceRow {
  company: CompanyRef;
  priority: TicketPriority;
  ticket_count: number;
  response_met: number;
  resolution_met: number;
  resolution_met_percent: number;
  avg_response_business_minutes: number;
  avg_resolution_business_minutes: number;
}

export interface SlaComplianceReport {
  month: string;               // YYYY-MM
  rows: SlaComplianceRow[];
  totals: { ticket_count: number; resolution_met_percent: number };
}

/** งาน export ขนาดใหญ่ (202 + job_id) */
export interface ExportJob {
  job_id: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  progress: number;            // 0–100
  download_url: string | null;
  error_message?: string | null;
}
```

### 4.5 KB / Notification / User

```ts
export const KB_VISIBILITIES = ['public', 'company', 'agent_only'] as const;
export type KbVisibility = (typeof KB_VISIBILITIES)[number];

export const KB_STATUSES = ['draft', 'published', 'archived'] as const;
export type KbStatus = (typeof KB_STATUSES)[number];

export interface KbArticleListItem {
  id: number;
  title: string;
  summary: string | null;
  kb_category: { id: number; name_th: string };
  company: CompanyRef | null;
  visibility: KbVisibility;
  status: KbStatus;
  tags: string | null;
  author: UserRef;
  view_count: number;
  helpful_count: number;
  not_helpful_count: number;
  published_at: string | null;
  updated_at: string;
}

export interface KbArticle extends KbArticleListItem {
  body_markdown: string;
  source_ticket_id: number | null;
  attachments: Attachment[];
  /** ผู้ใช้คนนี้เคยโหวตไปแล้วหรือยัง — ใช้ปิดปุ่ม (ขอ SA ยืนยันว่ามีฟิลด์นี้) */
  my_feedback?: 'helpful' | 'not_helpful' | null;
}

export interface KbListParams {
  q?: string;
  kb_category_id?: number;
  company_id?: number;
  status?: KbStatus;
  page?: number;
  page_size?: number;
}

export const NOTIFICATION_EVENTS = [
  'ticket_created', 'ticket_assigned', 'comment_added', 'status_changed',
  'sla_warning', 'sla_breached', 'ticket_resolved', 'ticket_closed',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export interface AppNotification {
  id: number;
  ticket_id: number | null;
  event_type: NotificationEvent;
  channel: 'in_app' | 'email' | 'line';
  title: string;
  body: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  read_at: string | null;
  created_at: string;
}

export interface UnreadCount { count: number }

export interface NotificationChannelSetting {
  channel: 'in_app' | 'email' | 'line';
  destination: string | null;
  is_enabled: boolean;
  is_verified: boolean;
}

export interface AppUser {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  employee_code: string | null;
  phone: string | null;
  job_title: string | null;
  company: CompanyRef;
  department: DepartmentRef | null;
  roles: Array<{ code: RoleCode; name_th: string; scoped_companies: CompanyRef[] }>;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: number;
  company_id: number | null;
  parent_id: number | null;
  code: string;
  name_th: string;
  default_priority: TicketPriority;
  default_assignee: UserRef | null;
  sort_order: number;
  is_active: boolean;
  /** เมื่อเรียกด้วย ?tree=true (ขอ SA ยืนยันโครงสร้าง — FE-08) */
  children?: Category[];
}
```

---

## 5. i18n และคำศัพท์

### 5.1 แนวทางแปลข้อความ

เฟส 1 ใช้ภาษาไทยล้วน (NFR-32) และ FR-74 (2 ภาษา) เป็น P2 — จึง**ไม่ติดตั้ง i18next** แต่วางโครงให้สลับได้ภายหลังโดยไม่ต้องแก้ component

| กฎ | รายละเอียด |
|---|---|
| I-1 | ข้อความที่ผู้ใช้เห็นทั้งหมดอยู่ใน `src/i18n/th.ts` **ห้ามฮาร์ดโค้ดในไฟล์ component** ยกเว้นข้อความจาก API |
| I-2 | ข้อความจาก API (`error.message`) แสดงตรง ๆ — เป็นภาษาไทยอยู่แล้ว (`03-api-spec.md` §6) ห้ามแปลซ้ำที่ FE |
| I-3 | ชื่อสถานะ/ความเร่งด่วน/SLA มาจาก `config/enums.ts` ที่เดียว ไม่ซ้ำกับ `i18n/th.ts` |
| I-4 | ข้อความที่มีตัวแปรใช้ placeholder `{name}` ไม่ต่อสตริงด้วย `+` (ลำดับคำต่างกันในแต่ละภาษา) |
| I-5 | พหูพจน์ภาษาไทยไม่เปลี่ยนรูป — ใช้ลักษณนามที่ถูกต้องแทน ("3 **ใบ**" สำหรับ ticket, "5 **คน**" สำหรับผู้ใช้, "2 **ไฟล์**", "4 **บทความ**") |
| I-6 | วันที่/เวลาผ่าน `lib/datetime.ts` เท่านั้น (locale `th`, timezone `Asia/Bangkok`, ปี พ.ศ.) |
| I-7 | ตัวเลขผ่าน `Intl.NumberFormat('th-TH')` — มีตัวคั่นหลักพัน |

```ts
// src/i18n/t.ts
import { th } from './th';

type Dictionary = typeof th;
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Dictionary>;

function lookup(key: string): string {
  const value = key.split('.').reduce<unknown>(
    (acc, part) => (acc !== null && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined),
    th,
  );
  return typeof value === 'string' ? value : key;
}

/** t('ticket.createdSuccess', { ticketNo: 'AIDC-LOG-202608-0042' }) */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template = lookup(key);
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}
```

```ts
// src/i18n/th.ts (ตัวอย่างโครง)
export const th = {
  common: {
    save: 'บันทึก',
    cancel: 'ยกเลิก',
    confirm: 'ยืนยัน',
    delete: 'ลบ',
    edit: 'แก้ไข',
    search: 'ค้นหา',
    loading: 'กำลังโหลด…',
    retry: 'ลองอีกครั้ง',
    clearFilters: 'ล้างตัวกรอง',
    resultCount: 'พบ {count} รายการ',
  },
  ticket: {
    entity: 'เรื่องที่แจ้ง',
    createTitle: 'แจ้งปัญหา',
    myTickets: 'เรื่องของฉัน',
    queue: 'คิวงานของฉัน',
    createdSuccess: 'ส่งเรื่องเรียบร้อย เลขที่ {ticketNo}',
    countUnit: '{count} ใบ',
    claim: 'รับงาน',
    assignTo: 'มอบหมายให้',
    confirmClose: 'ยืนยันปิดงาน',
    reopen: 'เปิดเรื่องซ้ำ',
    dueAt: 'ครบกำหนด {datetime}',
    remainingBusiness: 'เหลือ {duration} (เวลาทำการ)',
  },
  // …
} as const;
```

### 5.2 ตารางคำศัพท์ไทย–อังกฤษ (ทั้งทีมต้องใช้คำเดียวกัน)

**กติกา:** คอลัมน์ "คำไทยที่ใช้ใน UI" คือคำเดียวที่อนุญาตให้ปรากฏบนหน้าจอ ในอีเมลแจ้งเตือน ในข้อความ LINE และในเอกสารคู่มือ — คอลัมน์ "ห้ามใช้" คือคำที่เคยเห็นแล้วทำให้ผู้ใช้สับสน

| อังกฤษ / โค้ด | คำไทยที่ใช้ใน UI | ห้ามใช้ | หมายเหตุ |
|---|---|---|---|
| ticket | **เรื่องที่แจ้ง** / **เรื่อง** | ตั๋ว, incident, case, ทิกเก็ต | ลักษณนาม: **ใบ** |
| `ticket_no` | **เลขที่เรื่อง** | หมายเลขตั๋ว | |
| requester | **ผู้แจ้ง** | ผู้ร้องขอ, requester | |
| assignee | **ผู้รับผิดชอบ** | ผู้ได้รับมอบหมาย, เจ้าของงาน | |
| agent | **เจ้าหน้าที่** | เอเจนต์, ซัพพอร์ต | ในบริบทบทบาท = "เจ้าหน้าที่ support" |
| end_user | **ผู้แจ้ง** | ผู้ใช้ปลายทาง, end user | ตรงกับ `04-rbac-sla.md` §1 |
| company_admin | **ผู้ดูแลระดับบริษัท** | แอดมินบริษัท | |
| manager_viewer | **ผู้บริหาร (ดูอย่างเดียว)** | ผู้ชม, viewer | |
| super_admin | **ผู้ดูแลระบบ** | ซุปเปอร์แอดมิน | |
| priority | **ความเร่งด่วน** | ลำดับความสำคัญ, priority | |
| `critical` / `high` / `medium` / `low` | **วิกฤต / สูง / ปานกลาง / ต่ำ** | ด่วนมาก, เร่งด่วน | |
| status | **สถานะ** | | |
| `new` | **ใหม่** | เปิดใหม่, รอรับเรื่อง | |
| `assigned` | **มอบหมายแล้ว** | รับเรื่องแล้ว | |
| `in_progress` | **กำลังดำเนินการ** | อยู่ระหว่างดำเนินการ, กำลังทำ | |
| `pending_user` | **รอผู้แจ้ง** | รอตอบกลับ, pending | |
| `resolved` | **แก้ไขเสร็จ** | เสร็จสิ้น, สำเร็จ | ยังไม่ใช่ "ปิด" |
| `closed` | **ปิดแล้ว** | จบงาน, ปิดเรื่อง | |
| `cancelled` | **ยกเลิก** | ยกเลิกแล้ว, ยุติ | |
| assign | **มอบหมาย** | จ่ายงาน, แอสไซน์ | |
| claim / self-assign | **รับงาน** | เคลม, หยิบงาน | |
| reopen | **เปิดเรื่องซ้ำ** | รีโอเพ่น, เปิดใหม่ | |
| resolve | **แก้ไขเสร็จ** | รีโซลฟ์ | |
| resolution note | **สรุปวิธีแก้ไข** | หมายเหตุการแก้ไข | |
| comment (public) | **ตอบผู้แจ้ง** / **บทสนทนา** | คอมเมนต์ | |
| comment (internal) | **บันทึกภายในทีม** | โน้ตภายใน, internal note | |
| attachment | **ไฟล์แนบ** | เอกสารแนบ | ลักษณนาม: **ไฟล์** |
| category | **หมวดหมู่ปัญหา** | ประเภทงาน | 2 ระดับ: **หมวดหลัก** / **หมวดย่อย** |
| department | **แผนก** | หน่วยงาน | |
| company | **บริษัท** | องค์กร, บริษัทในเครือ | |
| SLA | **กำหนดเวลาให้บริการ (SLA)** | เอสแอลเอ | ใช้ทั้งคำเต็มและตัวย่อในวงเล็บครั้งแรกของหน้า |
| response time | **เวลาตอบรับ** | เวลาตอบสนอง | |
| resolution time | **เวลาแก้ไข** | เวลาปิดงาน | |
| due at | **ครบกำหนด** | กำหนดส่ง, deadline | |
| `on_track` | **ตรงเวลา** | ปกติ | |
| `at_risk` | **ใกล้ครบกำหนด** | เสี่ยง, at risk | |
| `breached` | **เกินกำหนด** | ผิด SLA, breach | |
| `paused` | **หยุดนับชั่วคราว** | พอส, หยุด | |
| business hours | **เวลาทำการ** | ชั่วโมงทำงาน | |
| business minutes | **นาทีทำการ** | นาทีทำงาน | ต่อท้าย "(เวลาทำการ)" ทุกครั้งที่แสดงระยะเวลา |
| holiday | **วันหยุด** | วันหยุดนักขัตฤกษ์ | |
| escalation | **การแจ้งเตือนยกระดับ** | เอสคาเลชัน | |
| knowledge base | **คลังความรู้** | ฐานความรู้, KB, นอลเลจเบส | |
| article | **บทความ** | | ลักษณนาม: **บทความ** |
| `draft` / `published` / `archived` | **ฉบับร่าง / เผยแพร่แล้ว / เก็บเข้าคลัง** | ดราฟต์, พับลิช | |
| visibility `public` | **ทุกบริษัท** | สาธารณะ | ระบบภายในองค์กร คำว่า "สาธารณะ" ทำให้เข้าใจผิดว่าคนนอกเห็น |
| visibility `company` | **เฉพาะบริษัท {ชื่อ}** | | |
| visibility `agent_only` | **เฉพาะทีม support** | เฉพาะเจ้าหน้าที่ | |
| helpful / not helpful | **มีประโยชน์ / ไม่มีประโยชน์** | ถูกใจ, like | |
| notification | **การแจ้งเตือน** | นอติฟิเคชัน | |
| dashboard | **แดชบอร์ด** | หน้าสรุป | คำทับศัพท์ที่ผู้ใช้คุ้นแล้ว |
| report | **รายงาน** | | |
| export | **ส่งออก** (ปุ่มเขียนว่า "Export Excel"/"Export PDF") | ดาวน์โหลดข้อมูล | ชื่อรูปแบบไฟล์คงเป็นอังกฤษ |
| audit log | **บันทึกการใช้งาน** | ล็อกการตรวจสอบ, audit trail | |
| role | **บทบาท** | สิทธิ์, role | |
| permission | **สิทธิ์การใช้งาน** | เพอร์มิชชัน | |
| scope | **ขอบเขตบริษัท** | สโคป | |
| filter | **ตัวกรอง** | ฟิลเตอร์ | |
| sort | **เรียงลำดับ** | ซอร์ต | |
| pagination | **แบ่งหน้า** | เพจิเนชัน | |
| login / logout | **เข้าสู่ระบบ / ออกจากระบบ** | ล็อกอิน, ล็อกเอาต์ | |
| username | **ชื่อผู้ใช้** | ยูสเซอร์เนม, บัญชีผู้ใช้ | |
| password | **รหัสผ่าน** | พาสเวิร์ด | |
| reset password | **รีเซ็ตรหัสผ่าน** | ตั้งรหัสผ่านใหม่ | คำทับศัพท์ที่ผู้ใช้คุ้นแล้ว |
| deactivate user | **ปิดใช้งานบัญชี** | ลบผู้ใช้, ระงับบัญชี | ย้ำว่าข้อมูลไม่หาย |
| soft delete | **ลบ (เก็บข้อมูลไว้)** | ลบชั่วคราว | |
| `request_id` | **รหัสอ้างอิง** | request id | ใช้เมื่อผู้ใช้ต้องแจ้งผู้ดูแล |
</content>
