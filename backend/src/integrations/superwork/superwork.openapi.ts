import type { OpenAPIObject, SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

/**
 * เอกสาร OpenAPI ของ Super Work Partner Workboard API
 *
 * เขียนมือ เพราะเป็น API ของระบบอื่น ไม่ใช่ของเรา — Nest สร้างให้เองไม่ได้
 * ที่เขียนไว้ตรงนี้ไม่ใช่แค่เพื่อดูสวย แต่เพราะทีมต้องรู้ว่า integration
 * ของเราพึ่งอะไรอยู่บ้าง และข้อไหนที่ "สำเร็จแต่ไม่ได้ผลที่ตั้งใจ"
 *
 * ⚠️ วางไว้ข้าง ๆ superwork.client.ts โดยตั้งใจ — เมื่อ client เปลี่ยน
 *    คนแก้จะเห็นไฟล์นี้ทันที ต่างจากการเก็บไว้ในโฟลเดอร์ docs ที่ถูกลืมเสมอ
 *
 * ที่มา: PARTNER_WORKBOARD_API.en.md (ฉบับที่ทีม Super Work ส่งให้ 2026-09-09)
 */

const TASK_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    activityId: { type: 'string', format: 'uuid' },
    cardId: { type: 'string', format: 'uuid' },
    title: { type: 'string' },
    status: {
      type: 'string',
      enum: ['todo', 'in_progress', 'in_review', 'done'],
      description:
        'คำนวณจากคอลัมน์ที่ task อยู่ + สถานะการตรวจ ไม่ได้เก็บเป็นฟิลด์ · ' +
        'isChecked = true อ่านเป็น done เสมอ แม้ยังไม่ถูกลากเข้าคอลัมน์ Done',
    },
    workflowStage: { type: 'string', enum: ['todo', 'in_progress', 'in_review', 'done'] },
    isChecked: { type: 'boolean' },
    priorityStatus: { type: 'string', enum: ['Low', 'Medium', 'High', 'SuperHard'] },
    startDate: { type: 'string', format: 'date-time', nullable: true },
    dueDate: { type: 'string', format: 'date-time', nullable: true },
    point: { type: 'integer' },
    overallPercent: { type: 'integer' },
    members: { type: 'array', items: { $ref: '#/components/schemas/Member' } },
    checkers: { type: 'array', items: { $ref: '#/components/schemas/Member' } },
    createdBy: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    idempotentReplay: {
      type: 'boolean',
      description: 'true = ใบเดิมที่เคยสร้างไว้แล้ว ไม่ได้สร้างซ้ำ (ตอบ 200 ไม่ใช่ 201)',
    },
  },
};

const ERROR_RESPONSE = {
  description: 'ทุกข้อผิดพลาดมีรูปเดียวกัน — ตัดสินใจจาก `error.code` เท่านั้น ไม่ใช่จาก `message`',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Error' },
    },
  },
};

export const SUPERWORK_OPENAPI: OpenAPIObject = {
  openapi: '3.0.3',
  info: {
    title: 'Super Work — Partner Workboard API',
    version: '1.0',
    description: [
      'API ของ **ระบบอื่น** ที่ AIDC Helpdesk เชื่อมต่ออยู่ ไม่ใช่ API ของเราเอง',
      '',
      'หน้านี้มีไว้ให้ทีมเห็นว่า integration พึ่งอะไรอยู่บ้าง',
      'ตัวที่เราเรียกจริงมีแค่ตัวเดียวคือ `POST /tasks` — ที่เหลือเป็นตัวที่ใช้',
      'หา id ตอนตั้งค่า',
      '',
      '## โครงข้อมูล',
      '',
      '| ระดับ | คืออะไร |',
      '|---|---|',
      '| **Project** | ก้อนงานใหญ่ |',
      '| **Activity** | บอร์ดหนึ่งใบในโปรเจกต์ |',
      '| **Card** | คอลัมน์บนบอร์ด (To do / In progress / Review / Done) |',
      '| **Task** | งานหนึ่งชิ้น อยู่**ในคอลัมน์** ไม่ได้อยู่ใต้ activity ตรง ๆ |',
      '',
      'ผลที่ตามมาข้อเดียวที่ต้องจำ: **`cardId` บังคับตอนสร้าง task**',
      'ต้องอ่าน `GET /activities/{id}` ก่อนเพื่อเอา id ของคอลัมน์',
      '',
      '## ลำดับการตั้งค่าครั้งแรก',
      '',
      '```',
      '1. GET  /meta                             → ค่า enum ที่ API นี้ใช้',
      '2. GET  /projects                         → โปรเจกต์ที่คีย์เข้าถึงได้',
      '3. GET  /projects/{projectId}/activities',
      '4. GET  /activities/{activityId}          → อ่าน cards[] เอา cardId',
      '5. GET  /activities/{activityId}/members  → ใครมอบหมายได้บ้าง',
      '6. POST /tasks',
      '```',
      '',
      '## ค่าที่ระบบเราใช้อยู่จริง',
      '',
      '| ตัวแปร | ค่า |',
      '|---|---|',
      '| project | Technology Operations (TechOps) |',
      '| activity | HelpDesk Support |',
      '| card | คอลัมน์แรก (stage `todo`) |',
      '',
      'ตั้งจริงที่ `SUPERWORK_*` ใน `backend/.env` — ดู `.env.example`',
      '',
      '## สองเรื่องที่ทำให้เข้าใจผิดบ่อยที่สุด',
      '',
      '1. **`point` / `dueDate` / `priorityStatus` ถูกทิ้งเงียบ ๆ พร้อมตอบ 201**',
      '   ถ้าพนักงานที่คีย์สวมบทบาทไม่ใช่หัวหน้า activity — คือ *สำเร็จแต่ไม่ได้ผล*',
      '   และสองคำสั่งไม่ตรงกัน: `POST` ทิ้งเงียบ แต่ `PATCH` ตอบ 403',
      '   ระบบเราจึงอ่านค่ากลับมาเทียบหลังสร้างทุกครั้ง แล้วเขียน log เตือนถ้าไม่ตรง',
      '',
      '2. **`point` กับ `dueDate` ต้องมาคู่กัน** ส่งอันเดียว → `400 point_deadline_pair_required`',
      '   ระบบเราจึงไม่ส่งทั้งคู่เป็นค่าเริ่มต้น กำหนดเวลา SLA ไปอยู่ในคำอธิบายแทน',
      '',
      '## สิ่งที่ API นี้ทำไม่ได้',
      '',
      '- สร้าง/แก้/ลบ Project หรือ Activity (อ่านอย่างเดียว)',
      '- ลบ task',
      '- ย้าย task ข้ามคอลัมน์ (`PATCH` แก้ฟิลด์ ไม่ได้ย้ายการ์ด)',
      '- ไฟล์แนบและคอมเมนต์',
      '- แบ่งหน้า — รายการคืนมาทั้งหมด',
      '',
      '> **ระวัง** ปุ่ม Try it out ยิงไปที่บอร์ดจริงที่ทีมใช้งานอยู่',
      '> `POST /tasks` จะสร้างการ์ดจริง และ API นี้ **ลบ task ไม่ได้**',
    ].join('\n'),
  },
  servers: [
    {
      url: 'https://endpoint.superwork.tech/api/v1/partner/workboard',
      description: 'production — คีย์คนละใบกับ UAT',
    },
    {
      url: 'http://10.0.1.170:9905/api/v1/partner/workboard',
      description: 'UAT — เข้าได้เฉพาะในเครือข่ายออฟฟิศ',
    },
  ],
  security: [{ ApiKey: [] }],
  tags: [
    { name: 'Reference', description: 'ค่า enum — ไม่ต้องใช้สิทธิ์' },
    { name: 'Discover', description: 'หา id ที่ต้องใช้ตอนตั้งค่า' },
    { name: 'Write', description: 'สร้างและแก้ task — ตัวที่ integration ของเราเรียกจริง' },
  ],
  paths: {
    '/meta': {
      get: {
        tags: ['Reference'],
        summary: 'ค่า enum ที่ API นี้ใช้',
        description: 'อ่านจากที่นี่แทนการฝังค่าไว้ในโค้ด · ไม่ต้องมีสิทธิ์ใด ๆ',
        security: [],
        responses: {
          '200': {
            description: 'สำเร็จ',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    priorities: { type: 'array', items: { type: 'string' } },
                    workflowStages: { type: 'array', items: { type: 'string' } },
                    taskStatuses: { type: 'array', items: { type: 'string' } },
                  },
                },
                example: {
                  priorities: ['Low', 'Medium', 'High', 'SuperHard'],
                  workflowStages: ['todo', 'in_progress', 'in_review', 'done'],
                  taskStatuses: ['todo', 'in_progress', 'in_review', 'done'],
                },
              },
            },
          },
        },
      },
    },

    '/projects': {
      get: {
        tags: ['Discover'],
        summary: 'โปรเจกต์ที่คีย์เข้าถึงได้',
        description:
          'คืนเฉพาะโปรเจกต์ที่คีย์ได้รับสิทธิ์ · ที่เหลือตอบ **404 ไม่ใช่ 403** ' +
          'โดยตั้งใจ — โปรเจกต์ที่ไม่ได้รับสิทธิ์ต้องแยกไม่ออกจากโปรเจกต์ที่ไม่มีอยู่จริง' +
          '\n\nต้องมีสิทธิ์ `workboard.project.read`',
        responses: {
          '200': {
            description: 'สำเร็จ',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    projects: { type: 'array', items: { $ref: '#/components/schemas/Project' } },
                  },
                },
              },
            },
          },
          '401': ERROR_RESPONSE,
          '403': ERROR_RESPONSE,
        },
      },
    },

    '/projects/{projectId}': {
      get: {
        tags: ['Discover'],
        summary: 'รายละเอียดโปรเจกต์',
        parameters: [
          {
            name: 'projectId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': { description: 'สำเร็จ' },
          '404': ERROR_RESPONSE,
        },
      },
    },

    '/projects/{projectId}/activities': {
      get: {
        tags: ['Discover'],
        summary: 'บอร์ดทั้งหมดในโปรเจกต์',
        description:
          '**ไม่มี cards ในผลลัพธ์นี้** ต้องอ่าน activity ทีละใบเพื่อเอา cards' +
          '\n\nต้องมีสิทธิ์ `workboard.activity.read`',
        parameters: [
          {
            name: 'projectId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'สำเร็จ',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    activities: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Activity' },
                    },
                  },
                },
              },
            },
          },
          '404': ERROR_RESPONSE,
        },
      },
    },

    '/activities/{activityId}': {
      get: {
        tags: ['Discover'],
        summary: 'บอร์ดหนึ่งใบ พร้อมคอลัมน์',
        description:
          '**คอลัมน์หลายอันมี `workflowStage` ซ้ำกันได้** ให้ยึด `id` เสมอ ห้ามยึด stage' +
          '\n\nเป็นที่มาของ `SUPERWORK_CARD_ID`',
        parameters: [
          {
            name: 'activityId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'สำเร็จ',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { activity: { $ref: '#/components/schemas/ActivityDetail' } },
                },
              },
            },
          },
          '404': ERROR_RESPONSE,
        },
      },
    },

    '/activities/{activityId}/members': {
      get: {
        tags: ['Discover'],
        summary: 'คนที่มอบหมายงานบนบอร์ดนี้ได้',
        description:
          '⚠️ ควรเรียกก่อนเสมอ — **การมอบหมายคนที่ยังไม่อยู่บนบอร์ด จะดึงคนนั้นเข้าบอร์ดให้เลย** ' +
          'ส่ง id ผิดครั้งเดียวเท่ากับขยายรายชื่อสมาชิกของบอร์ดโดยไม่ตั้งใจ' +
          '\n\nเป็นที่มาของ `SUPERWORK_MEMBER_IDS`',
        parameters: [
          {
            name: 'activityId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'สำเร็จ',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    members: { type: 'array', items: { $ref: '#/components/schemas/Member' } },
                  },
                },
              },
            },
          },
          '404': ERROR_RESPONSE,
        },
      },
    },

    '/activities/{activityId}/tasks': {
      get: {
        tags: ['Discover'],
        summary: 'งานทั้งหมดบนบอร์ด',
        description: 'ไม่มีการแบ่งหน้า — คืนมาทั้งหมด\n\nต้องมีสิทธิ์ `workboard.task.read`',
        parameters: [
          {
            name: 'activityId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'สำเร็จ',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tasks: { type: 'array', items: { $ref: '#/components/schemas/Task' } },
                  },
                },
              },
            },
          },
          '404': ERROR_RESPONSE,
        },
      },
    },

    '/tasks/{taskId}': {
      get: {
        tags: ['Discover'],
        summary: 'งานหนึ่งชิ้น',
        description: 'ใช้ id ของ task อย่างเดียว ไม่ต้องรู้ว่าอยู่บอร์ดไหนคอลัมน์ไหน',
        parameters: [
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'สำเร็จ',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { task: { $ref: '#/components/schemas/Task' } },
                },
              },
            },
          },
          '404': ERROR_RESPONSE,
        },
      },
      patch: {
        tags: ['Write'],
        summary: 'แก้ไขงาน',
        description:
          'ส่งเฉพาะฟิลด์ที่เปลี่ยน ฟิลด์ที่ไม่ส่งจะไม่ถูกแตะ' +
          '\n\n**ต่างจาก POST ตรงที่ไม่ทิ้งเงียบ** — ถ้าคีย์ไม่มีสิทธิ์ตั้ง `point` / `dueDate` / ' +
          '`priorityStatus` จะได้ `403 denied` ตรง ๆ จึงไม่ควรใส่ฟิลด์พวกนี้ใน PATCH ' +
          'ถ้าไม่แน่ใจว่าคีย์ตั้งได้' +
          '\n\nต้องมีสิทธิ์ `workboard.task.update`',
        parameters: [
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TaskPatch' },
              example: { title: 'ชื่อใหม่', priorityStatus: 'Medium' },
            },
          },
        },
        responses: {
          '200': { description: 'แก้ไขแล้ว' },
          '403': ERROR_RESPONSE,
          '404': ERROR_RESPONSE,
          '409': ERROR_RESPONSE,
        },
      },
    },

    '/tasks': {
      post: {
        tags: ['Write'],
        summary: 'สร้างงานใหม่ — ตัวเดียวที่ integration ของเราเรียกจริง',
        description:
          '**ส่ง `X-Idempotency-Key` ทุกครั้ง** ระบบเราใช้เลขที่ ticket เป็นคีย์ ' +
          '(`aidc-helpdesk-AIDC-HQ-202609-0006`) เพราะ timeout ฝั่งเราไม่ได้แปลว่า ' +
          'ฝั่งเขาไม่ได้สร้าง — ยิงซ้ำด้วยคีย์เดิมจะได้ใบเดิมกลับมา (ตอบ **200** ' +
          'พร้อม `idempotentReplay: true` แทน 201) ไม่ใช่ใบซ้ำที่ต้องมีคนตามลบ' +
          '\n\nต้องมีสิทธิ์ `workboard.task.create`',
        parameters: [
          {
            name: 'X-Idempotency-Key',
            in: 'header',
            required: false,
            schema: { type: 'string' },
            description: 'ใช้ id ของต้นเรื่องฝั่งเรา ไม่ใช่ค่าสุ่ม',
            example: 'aidc-helpdesk-AIDC-HQ-202609-0006',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TaskCreate' },
              example: {
                activityId: 'e332265e-0d7f-46df-b4ea-7eea01d68f4a',
                cardId: 'd1bf078c-f543-4bbf-9228-ec3948d57dff',
                title: 'AIDC-HQ-202609-0006 · ເຄື່ອງສະແກນອ່ານບໍ່ຕິດ',
                members: ['b4cbe1d0-1f33-4b75-896a-12ab827309ab'],
                description: 'ແຈ້ງຈາກ AIDC Helpdesk',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'สร้างแล้ว',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { task: { $ref: '#/components/schemas/Task' } },
                },
              },
            },
          },
          '200': {
            description:
              'มีใบนี้อยู่แล้วจาก `X-Idempotency-Key` เดิม — คืนใบเดิม ไม่ได้สร้างซ้ำ',
          },
          '400': ERROR_RESPONSE,
          '403': ERROR_RESPONSE,
          '404': ERROR_RESPONSE,
          '409': ERROR_RESPONSE,
          '429': ERROR_RESPONSE,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      ApiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description:
          'คีย์ขึ้นต้นด้วย `swk_live_` · ผู้ดูแล Super Work เห็นค่าเต็มครั้งเดียวตอนออกคีย์ ' +
          'ระบบเก็บแค่ hash จึงเปิดดูย้อนหลังไม่ได้ ถ้าหายต้องออกใหม่' +
          '\n\n`Authorization: ApiKey <key>` และ `Bearer <key>` ก็ได้ แต่ `X-API-Key` ชนะเสมอ' +
          '\n\n**คีย์ทำงานในนามพนักงานจริงคนหนึ่ง** ทำได้เท่าที่คนนั้นทำได้ในแอป ' +
          'ถ้าคนนั้นถูกปิดบัญชีหรือลาออก คีย์หยุดทำงานทันที',
      },
    },
    schemas: {
      Project: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          status: { type: 'string' },
          dateStart: { type: 'string', format: 'date-time' },
          dateEnd: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Activity: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          projectId: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          status: { type: 'string' },
        },
      },
      ActivityDetail: {
        allOf: [
          { $ref: '#/components/schemas/Activity' },
          {
            type: 'object',
            properties: {
              cards: { type: 'array', items: { $ref: '#/components/schemas/Card' } },
            },
          },
        ],
      },
      Card: {
        type: 'object',
        description: 'คอลัมน์บนบอร์ด · หลายคอลัมน์มี workflowStage ซ้ำกันได้ ให้ยึด id',
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          workflowStage: { type: 'string', enum: ['todo', 'in_progress', 'in_review', 'done'] },
          taskCount: { type: 'integer' },
        },
      },
      Member: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          position: { type: 'string' },
          team: { type: 'string' },
        },
      },
      Task: TASK_SCHEMA,
      TaskCreate: {
        type: 'object',
        required: ['activityId', 'cardId', 'title', 'members'],
        properties: {
          activityId: { type: 'string', format: 'uuid' },
          cardId: {
            type: 'string',
            format: 'uuid',
            description: 'คอลัมน์ปลายทาง — เอาจาก GET /activities/{id}',
          },
          title: { type: 'string' },
          members: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', format: 'uuid' },
            description:
              'อย่างน้อย 1 คน ไม่ใช่ตัวเลือก — งานที่ไม่มีใครรับผิดชอบปิดไม่ได้เลย ' +
              '· ว่าง → `400 assignee_required`',
          },
          priorityStatus: {
            type: 'string',
            enum: ['Low', 'Medium', 'High', 'SuperHard'],
            description: 'อาจถูกทิ้งเงียบ ๆ ถ้าคีย์ไม่มีสิทธิ์ตั้ง',
          },
          startDate: { type: 'string', description: 'YYYY-MM-DD หรือ RFC3339' },
          dueDate: { type: 'string', description: 'ต้องส่งคู่กับ point เสมอ' },
          point: {
            type: 'integer',
            description: 'ต้องส่งคู่กับ dueDate · ไม่งั้น `400 point_deadline_pair_required`',
          },
          estimateHours: { type: 'number' },
          description: { type: 'string' },
          checkers: {
            type: 'array',
            maxItems: 2,
            items: { type: 'string', format: 'uuid' },
            description: 'ไม่ส่ง = ใช้ผู้ตรวจตั้งต้นของบอร์ด · เกิน 2 → `400 too_many_checkers`',
          },
          subItems: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                dueDate: { type: 'string' },
                member: { type: 'string', format: 'uuid' },
              },
            },
          },
        },
      },
      TaskPatch: {
        type: 'object',
        description: 'ฟิลด์เดียวกับตอนสร้าง แต่ไม่บังคับทั้งหมด',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priorityStatus: { type: 'string', enum: ['Low', 'Medium', 'High', 'SuperHard'] },
          estimateHours: { type: 'number' },
          clearDueDate: {
            type: 'boolean',
            description: 'ลบกำหนดส่ง · `dueDate: null` ไม่พอ เพราะแยกไม่ออกจาก "ไม่ได้ส่งฟิลด์มา"',
          },
          members: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            description: '`[]` = **ล้างผู้รับผิดชอบ** ต่างจากการไม่ส่งฟิลด์ ซึ่งคือปล่อยไว้เหมือนเดิม',
          },
          checkers: { type: 'array', items: { type: 'string', format: 'uuid' } },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                description: [
                  '`missing_api_key` 401 — ไม่ได้ส่งคีย์',
                  '`unauthorized` 401 — คีย์ไม่ถูกต้อง หรือใช้คีย์ UAT ยิง production',
                  '`integration_expired` 401 — คีย์หมดอายุ',
                  '`integration_disabled` 403 — คีย์ถูกปิด',
                  '`ip_not_allowed` 403 — IP ต้นทางไม่อยู่ในรายการอนุญาต',
                  '`permission_not_granted` 403 — คีย์ไม่ได้รับสิทธิ์นี้',
                  '`project_out_of_scope` 403 — โปรเจกต์นี้ไม่ได้ให้คีย์นี้',
                  '`acting_user_unavailable` 403 — พนักงานที่คีย์สวมบทบาทไม่อยู่แล้ว',
                  '`acting_user_not_configured` 403 — คีย์เขียนได้แต่ไม่มีคนให้สวมบทบาท',
                  '`denied` 403 — คนที่คีย์สวมบทบาททำสิ่งนี้ไม่ได้',
                  '`project_not_found` / `activity_not_found` / `card_not_found` / `task_not_found` 404',
                  '`validation_failed` 400 — body ผิด ดูชื่อฟิลด์ใน message',
                  '`assignee_required` 400 — ไม่มีผู้รับผิดชอบ',
                  '`point_deadline_pair_required` 400 — ส่ง point หรือ dueDate มาอันเดียว',
                  '`too_many_checkers` 400 — ผู้ตรวจเกิน 2 คน',
                  '`task_state_conflict` 409 — สถานะของงานไม่ให้แก้แบบนั้น (เช่นงานที่ตรวจผ่านแล้ว คะแนนถูกล็อก)',
                  '`activity_busy` 409 — มีคนอื่นกำลังเขียนบอร์ดนี้ **ให้ลองใหม่ ~200ms** ไม่ใช่ error ที่ต้องปลุกคน',
                  '`rate_limited` 429 — รอตาม `Retry-After`',
                  '`internal_error` 500 — ฝั่งเขา',
                ].join('\n\n'),
              },
              message: { type: 'string', description: 'เขียนให้คนอ่าน เปลี่ยนได้ ห้ามเอาไปตัดสินใจ' },
            },
          },
        },
      },
    },
  },
};
