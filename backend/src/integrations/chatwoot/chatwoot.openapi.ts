import type { OpenAPIObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

/**
 * เอกสาร OpenAPI ของ Chatwoot Application API เท่าที่ระบบเราเรียกใช้จริง
 *
 * เขียนมือ เพราะเป็น API ของระบบอื่น ไม่ใช่ของเรา — Nest สร้างให้เองไม่ได้
 * วางไว้ข้าง chatwoot-sync.config.ts โดยตั้งใจ คนที่แก้ตัวซิงก์จะเห็นไฟล์นี้ทันที
 *
 * ทุกข้อในหน้านี้มาจากการลองยิงจริงกับ Chatwoot 4.17.1 ที่ 18.142.116.44
 * ไม่ได้คัดลอกจากเอกสารทางการ — ข้อที่ต่างจากเอกสารถูกทำเครื่องหมาย ⚠️ ไว้
 */

const ERROR_RESPONSE = {
  description: 'ผิดพลาด — body เป็น `{"errors":["..."]}`',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Error' },
    },
  },
};

export const CHATWOOT_OPENAPI: OpenAPIObject = {
  openapi: '3.0.3',
  info: {
    title: 'Chatwoot — Application API (ที่ AIDC Helpdesk ใช้)',
    version: '4.17.1',
    description: [
      'API ของ **ระบบอื่น** ที่ AIDC Helpdesk เชื่อมต่ออยู่ ไม่ใช่ API ของเราเอง',
      '',
      'หน้านี้มีเฉพาะ endpoint ที่ตัวซิงก์แชทสองทางเรียกจริง',
      '(`backend/src/modules/support-chat/chatwoot-sync.service.ts`)',
      'ไม่ใช่ทั้งหมดที่ Chatwoot มี',
      '',
      '## ⚠️ ชื่อ header ต้องสะกดด้วยขีดกลาง',
      '',
      'เอกสารของ Chatwoot เขียนว่า `api_access_token` (ขีดล่าง) ซึ่ง**ใช้ไม่ได้**',
      'เมื่อมี nginx อยู่หน้าเซิร์ฟเวอร์ เพราะ nginx ทิ้ง header ที่มีขีดล่างเงียบ ๆ',
      '(`underscores_in_headers off` เป็นค่าเริ่มต้น) แล้ว Chatwoot ตอบ **401**',
      'ทั้งที่ token ถูกต้อง',
      '',
      'ให้ส่งเป็น `api-access-token` เสมอ — Rails อ่านเป็นคีย์เดียวกัน',
      'วัดจริง: ขีดล่าง → 401 · ขีดกลาง → 200',
      '',
      '## ลำดับที่ระบบเราเรียก',
      '',
      '### ก) แชทที่พนักงานเปิดใน Helpdesk (inbox ชนิด **API**)',
      '',
      '```',
      '1. GET  /contacts/search?q=<username>         → หา contact เดิม',
      '2. POST /contacts                             → ถ้ายังไม่มี (ได้ source_id มาด้วย)',
      '   POST /contacts/{id}/contact_inboxes        → ถ้ามี contact แต่ยังไม่ผูก inbox',
      '3. POST /conversations                        → เปิดการสนทนาใน inbox ชนิด API',
      '4. POST /conversations/{id}/messages          → ส่งข้อความออก',
      '5. GET  /conversations/{id}/messages?after=N  → ดึงคำตอบใหม่ทุก 4 วินาที',
      '6. POST /conversations/{id}/toggle_status     → ปิดการสนทนาเมื่อห้องแชทถูกปิด',
      '```',
      '',
      '### ข) AIDC Support Hub — widget บนเว็บของกลุ่ม (inbox ชนิด **Website**)',
      '',
      'บทสนทนาเป็นของ Chatwoot ตั้งแต่ต้น เราแค่เข้าไปร่วมวง',
      '**ไม่สร้าง contact และไม่เปิดการสนทนาใหม่เลยในเส้นทางนี้**',
      '',
      '```',
      '1. GET  /inboxes                              → หน้าผูก inbox ของผู้ดูแล (อ่านอย่างเดียว)',
      '2. GET  /conversations?inbox_id=N&status=all  → รอบค้นหาบทสนทนาใหม่ ทุก 10 วินาที',
      '3. GET  /conversations/{id}/messages?after=N  → ดึงข้อความใหม่ของห้องนั้น',
      '4. POST /conversations/{id}/messages          → ส่งคำตอบของเจ้าหน้าที่ (outgoing)',
      '5. POST /conversations/{id}/toggle_status     → เมื่อทีมไอทีปิดห้องฝั่ง Helpdesk',
      '```',
      '',
      '## ค่าที่ระบบเราใช้อยู่',
      '',
      '| ตัวแปร | ค่า |',
      '|---|---|',
      '| เซิร์ฟเวอร์ | `http://18.142.116.44` (= `helpdesk.aidclaos.com`) |',
      '| บัญชี | 1 |',
      '| inbox | 2 — "AIDC Helpdesk (ซิงก์)" ชนิด **API** |',
      '| inbox | 1 — "AIDC Helpdesk & Support" ชนิด **Website** (widget ของ Support Hub) |',
      '',
      'ตั้งจริงที่ `CHATWOOT_*` ใน `backend/.env` — ดู `.env.example`',
      '',
      '## ข้อที่ทำให้เสียเวลามากที่สุด',
      '',
      '1. **ข้อความขาเข้า (`incoming`) สร้างได้เฉพาะ inbox ชนิด API**',
      '   inbox แบบ Website จะปฏิเสธ — เป็นเหตุผลที่ต้องสร้าง inbox ใบใหม่',
      '2. **`message_type` ตอนส่งเป็นข้อความ (`"incoming"`) แต่ตอนอ่านกลับมาเป็นตัวเลข**',
      '   (0 = incoming, 1 = outgoing, 2 = activity, 3 = template) โค้ดเราจึงรับทั้งสองแบบ',
      '3. **ต้องกันข้อความวนซ้ำเอง** ข้อความที่เราส่งไปจะถูกดึงกลับมาด้วย',
      '   ระบบเราเก็บ `chatwoot_message_id` ของทุกข้อความที่ส่งออก แล้วข้ามตอนดึงกลับ',
      '4. **token ของ agent bot อ่านข้อความไม่ได้** ต้องใช้ Access Token ของเจ้าหน้าที่',
      '5. **Captain (AI ของ Chatwoot) เป็นฟีเจอร์ Enterprise** ใช้กับรุ่นติดตั้งเองไม่ได้',
      '',
      '> **ระวัง** ปุ่ม Try it out ยิงไปที่เซิร์ฟเวอร์ Chatwoot จริงที่ทีมใช้งานอยู่',
      '> `POST /conversations` และ `POST /messages` สร้างของจริงที่เจ้าหน้าที่เห็นทันที',
    ].join('\n'),
  },
  servers: [
    {
      url: 'http://18.142.116.44/api/v1/accounts/1',
      description: 'เซิร์ฟเวอร์ที่ใช้อยู่ — บัญชี 1 (ยังเป็น http ควรเปิด https ก่อนใช้จริง)',
    },
    {
      url: 'http://helpdesk.aidclaos.com/api/v1/accounts/1',
      description: 'โดเมนเดียวกับเครื่องข้างบน',
    },
  ],
  security: [{ AgentToken: [] }],
  tags: [
    { name: 'Contacts', description: 'ผู้ติดต่อ — ผูกกับผู้ใช้ใน Helpdesk ด้วย identifier = ชื่อผู้ใช้' },
    { name: 'Conversations', description: 'การสนทนา — หนึ่งห้องแชทใน Helpdesk = หนึ่งการสนทนา' },
    { name: 'Messages', description: 'ข้อความเข้าและออก รวมไฟล์แนบ' },
    { name: 'Inboxes', description: 'กล่องข้อความ — หนึ่ง inbox ชนิด Website = หนึ่งโครงการใน Support Hub' },
  ],
  paths: {
    '/inboxes': {
      get: {
        tags: ['Inboxes'],
        summary: 'รายการ inbox ทั้งหมดของบัญชี',
        description: [
          'ใช้ในหน้าผูก inbox ของผู้ดูแล (`GET /support-projects/chatwoot-inboxes`)',
          'และใน CLI ลงทะเบียนโครงการ — **อ่านอย่างเดียวทั้งสองทาง**',
          '',
          'ระบบเราคัดเฉพาะ `channel_type = "Channel::WebWidget"` ออกมา',
          'inbox ชนิด `Channel::Api` (ใบที่ใช้ซิงก์แชทภายใน) ไม่มี widget และไม่มี website token',
          '',
          '## ⚠️ payload มี `hmac_token` ของ inbox รวมอยู่ด้วย',
          '',
          'ค่านั้น **เป็นความลับ** — ใครถือไปคำนวณ `identifier_hash` ของคนอื่นได้',
          'แล้วเปิดแชทในนามคนนั้น เห็นบทสนทนาย้อนหลังที่เขาเคยคุยกับทีมไอทีทั้งหมด',
          '',
          'โค้ดของเราจึงคัดฟิลด์ทีละตัวออกมา (`id`, `name`, `channel_type`,',
          '`website_url`, `website_token`) ไม่ใช่ส่ง payload ดิบต่อไปให้ชั้นบน',
          'ดู `chatwootWebsiteInboxes()` ใน `integrations/chatwoot/chatwoot-api.ts`',
          '',
          '`website_token` ตรงข้ามกัน — **เปิดเผยได้** Chatwoot ออกแบบให้อยู่ใน',
          'สคริปต์ที่ทุกหน้าเว็บโหลด ใครเปิด view-source ก็เห็น',
        ].join('\n'),
        responses: {
          '200': {
            description: 'สำเร็จ — รายการอยู่ใน `payload`',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    payload: { type: 'array', items: { $ref: '#/components/schemas/Inbox' } },
                  },
                },
              },
            },
          },
          '401': ERROR_RESPONSE,
        },
      },
    },

    '/conversations?inbox_id={inboxId}': {
      get: {
        tags: ['Conversations'],
        summary: 'รายการบทสนทนาของ inbox หนึ่ง',
        description: [
          'หัวใจของรอบค้นหาบทสนทนาจาก widget — ทุก `CHATWOOT_WIDGET_POLL_MS`',
          'ระบบเรายิงคำขอนี้หนึ่งครั้งต่อโครงการที่เปิดใช้งานและผูก inbox แล้ว',
          '',
          '## ⚠️ รูปร่างผลลัพธ์ไม่เหมือน endpoint อื่น',
          '',
          'endpoint อื่นวางผลไว้ที่ `payload` ตรง ๆ แต่ตัวนี้อยู่ที่ **`data.payload`**',
          'และ `data.meta` มีตัวนับ (`all_count`, `mine_count`, …)',
          'วัดจริงกับ 4.17.1 — อ่านผิดชั้นจะได้อาร์เรย์ว่างทุกรอบโดยไม่มี error',
          '',
          '## ฟิลด์ที่ระบบเราใช้',
          '',
          '| ฟิลด์ | ใช้ทำอะไร |',
          '|---|---|',
          '| `id` | เลขบทสนทนา — หนึ่งใบ = หนึ่งห้องแชทฝั่งเรา |',
          '| `status` | `resolved` แล้วห้องเรายังเปิด → ปิดตามพร้อมข้อความระบบ |',
          '| `last_activity_at` | unix **วินาที** — ตัดสินว่าขยับตั้งแต่รอบก่อนไหม |',
          '| `meta.sender` | ชื่อ อีเมล เบอร์ และ identifier ของผู้เข้าชม |',
          '| `meta.hmac_verified` | ⚠️ ดูด้านล่าง |',
          '',
          '## ⚠️ `meta.hmac_verified` คือเส้นแบ่งของความน่าเชื่อถือ',
          '',
          '`true` = เว็บต้นทางคำนวณ `identifier_hash` ด้วย hmac_token ของ inbox แล้ว',
          'Chatwoot ตรวจผ่าน — อีเมลที่มากับบทสนทนานั้นจึงเป็นตัวตนที่ระบบต้นทางรับรอง',
          '',
          '`false` = ผู้เข้าชมพิมพ์เองในฟอร์มก่อนแชท ซึ่งพิมพ์อีเมลของใครก็ได้',
          'ระบบเราจับคู่ผู้เข้าชมกับบัญชีใน Helpdesk **เฉพาะเมื่อเป็น `true`** เท่านั้น',
          '',
          '(ฟิลด์นี้อยู่ที่บทสนทนา ไม่ได้อยู่ที่ `contact_inbox` — ผลของ endpoint นี้',
          'ไม่มี `contact_inbox` มาด้วยเลย)',
          '',
          '## ขอบเขตที่ระบบเราตั้งไว้เอง',
          '',
          '- หน้าเดียวต่อโครงการต่อรอบ (Chatwoot คืนหน้าละ 25 เรียงกิจกรรมล่าสุดก่อน)',
          '- เฉพาะบทสนทนาที่ขยับภายใน 30 วัน',
          '- ข้ามบทสนทนาที่ `last_activity_at` ไม่ขยับตั้งแต่รอบก่อน',
        ].join('\n'),
        parameters: [
          {
            name: 'inboxId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            example: 1,
            description: 'ส่งจริงเป็น query `?inbox_id=` — เขียนเป็น path ที่นี่เพราะ OpenAPI แยก path ด้วย query ไม่ได้',
          },
          {
            name: 'status',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['open', 'resolved', 'pending', 'snoozed', 'all'] },
            example: 'all',
            description: 'ต้องเป็น `all` — ไม่งั้นบทสนทนาที่ปิดไปแล้วหายจากรายการ แล้วห้องฝั่งเราไม่มีวันถูกปิดตาม',
          },
          {
            name: 'page',
            in: 'query',
            required: false,
            schema: { type: 'integer' },
            example: 1,
          },
        ],
        responses: {
          '200': {
            description: '⚠️ รายการอยู่ที่ `data.payload` ไม่ใช่ `payload`',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'object',
                      properties: {
                        meta: {
                          type: 'object',
                          properties: {
                            all_count: { type: 'integer' },
                            mine_count: { type: 'integer' },
                            assigned_count: { type: 'integer' },
                            unassigned_count: { type: 'integer' },
                          },
                        },
                        payload: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/ConversationListItem' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': ERROR_RESPONSE,
        },
      },
    },

    '/contacts/search': {
      get: {
        tags: ['Contacts'],
        summary: 'ค้นหาผู้ติดต่อ',
        description:
          'ค้นจาก ชื่อ อีเมล เบอร์โทร และ identifier พร้อมกัน — ไม่มีตัวเลือกจำกัดว่าค้นจากฟิลด์ไหน' +
          '\n\nระบบเราค้นด้วยชื่อผู้ใช้ก่อน แล้วค่อยค้นด้วยอีเมล เพราะ contact ที่ widget เคยสร้างไว้' +
          'ใช้ชื่อผู้ใช้เป็น identifier',
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            example: 'demo.enduser',
          },
        ],
        responses: {
          '200': {
            description: 'สำเร็จ — ผลอยู่ใน `payload` เสมอ แม้ไม่เจอก็เป็นอาร์เรย์ว่าง',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    payload: { type: 'array', items: { $ref: '#/components/schemas/Contact' } },
                  },
                },
              },
            },
          },
          '401': ERROR_RESPONSE,
        },
      },
    },

    '/contacts': {
      post: {
        tags: ['Contacts'],
        summary: 'สร้างผู้ติดต่อ (พร้อมผูกเข้า inbox)',
        description:
          'ส่ง `inbox_id` มาด้วย Chatwoot จะสร้าง contact_inbox ให้ในคำขอเดียว' +
          'แล้วคืน `source_id` ที่ต้องใช้ตอนเปิดการสนทนา — ถ้าไม่ส่ง ต้องเรียก' +
          '`POST /contacts/{id}/contact_inboxes` เพิ่มอีกหนึ่งครั้ง' +
          '\n\n⚠️ `identifier` ต้องไม่ซ้ำทั้งบัญชี ระบบเราใช้ชื่อผู้ใช้ใน Helpdesk',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ContactCreate' },
              example: {
                name: 'ດີໄມ ຜູ້ໃຊ້ທົ່ວໄປ',
                identifier: 'demo.enduser',
                email: 'demo.enduser@aidc.co.th',
                inbox_id: 2,
                custom_attributes: { company: 'AIDC-HQ' },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'สร้างแล้ว — id อยู่ที่ `payload.contact.id`',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    payload: {
                      type: 'object',
                      properties: {
                        contact: { $ref: '#/components/schemas/Contact' },
                        contact_inbox: { $ref: '#/components/schemas/ContactInbox' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': ERROR_RESPONSE,
          '422': ERROR_RESPONSE,
        },
      },
    },

    '/contacts/{contactId}/contact_inboxes': {
      post: {
        tags: ['Contacts'],
        summary: 'ผูกผู้ติดต่อเดิมเข้ากับ inbox',
        description:
          'ใช้เมื่อเจอ contact เดิมจากการค้นหา แต่ยังไม่เคยคุยผ่าน inbox นี้' +
          '\n\n⚠️ ถ้าผูกอยู่แล้วจะได้ error ระบบเราจึงกลืนไว้แล้วไปอ่าน `source_id` เดิม' +
          'จาก `GET /contacts/{id}/contactable_inboxes` แทน',
        parameters: [
          { name: 'contactId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['inbox_id'],
                properties: {
                  inbox_id: { type: 'integer', example: 2 },
                  source_id: {
                    type: 'string',
                    description: 'ไม่ส่ง = Chatwoot สุ่มให้ · ระบบเราไม่ส่ง',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'ผูกแล้ว',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ContactInbox' },
              },
            },
          },
          '401': ERROR_RESPONSE,
          '422': ERROR_RESPONSE,
        },
      },
    },

    '/contacts/{contactId}/contactable_inboxes': {
      get: {
        tags: ['Contacts'],
        summary: 'inbox ที่ผู้ติดต่อนี้คุยได้ พร้อม source_id',
        description: 'ทางสำรองสำหรับอ่าน `source_id` เดิม เมื่อการผูก inbox ซ้ำถูกปฏิเสธ',
        parameters: [
          { name: 'contactId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'สำเร็จ',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    payload: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          source_id: { type: 'string' },
                          inbox: { $ref: '#/components/schemas/Inbox' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': ERROR_RESPONSE,
        },
      },
    },

    '/conversations': {
      post: {
        tags: ['Conversations'],
        summary: 'เปิดการสนทนาใหม่',
        description:
          '`source_id` มาจาก contact_inbox ไม่ใช่ id ของ contact — ส่งผิดตัวจะได้ 404' +
          '\n\nระบบเราเก็บเลขห้องแชทฝั่ง Helpdesk ไว้ใน `additional_attributes.helpdesk_chat_id`' +
          'เพื่อให้ไล่กลับได้ว่าการสนทนานี้มาจากห้องไหน',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ConversationCreate' },
              example: {
                source_id: 'b0f2…',
                inbox_id: 2,
                contact_id: 12,
                additional_attributes: { helpdesk_chat_id: 5, company: 'AIDC-HQ' },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'เปิดแล้ว — `id` คือเลขการสนทนาที่ใช้ต่อทุกคำสั่ง',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Conversation' },
              },
            },
          },
          '401': ERROR_RESPONSE,
          '404': ERROR_RESPONSE,
        },
      },
    },

    '/conversations/{conversationId}/messages': {
      get: {
        tags: ['Messages'],
        summary: 'อ่านข้อความในการสนทนา',
        description:
          '`after` คือ id ข้อความล่าสุดที่เคยอ่าน — คืนเฉพาะที่ใหม่กว่า เรียงเก่าไปใหม่ สูงสุด 100' +
          '\n\nไม่ส่ง `after` = คืน 20 ข้อความล่าสุด' +
          '\n\n⚠️ ต้องกรองเองทั้งสามอย่าง: เอาเฉพาะ `message_type` outgoing,' +
          'ข้าม `private: true` (โน้ตภายในของเจ้าหน้าที่ ผู้แจ้งห้ามเห็น)' +
          'และข้าม `content_type` ที่ไม่ใช่ `text` (CSAT / ฟอร์ม)',
        parameters: [
          { name: 'conversationId', in: 'path', required: true, schema: { type: 'integer' } },
          {
            name: 'after',
            in: 'query',
            required: false,
            schema: { type: 'integer' },
            description: 'id ข้อความที่อ่านไปแล้ว',
            example: 41,
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
                    payload: { type: 'array', items: { $ref: '#/components/schemas/Message' } },
                  },
                },
              },
            },
          },
          '401': ERROR_RESPONSE,
          '404': ERROR_RESPONSE,
        },
      },
      post: {
        tags: ['Messages'],
        summary: 'ส่งข้อความเข้าการสนทนา',
        description:
          'ข้อความของผู้แจ้งส่งเป็น `incoming` (ผู้ส่งคือ contact ของการสนทนา)' +
          'ส่วนข้อความของทีมไอทีส่งเป็น `outgoing`' +
          '\n\n⚠️ `outgoing` จะขึ้นในชื่อเจ้าของ token เสมอ ไม่ใช่ชื่อคนที่พิมพ์จริง' +
          'ระบบเราจึงใส่ชื่อคนตอบไว้หน้าข้อความ เช่น `ສົມສັກ (Helpdesk): …`' +
          '\n\nไฟล์แนบส่งเป็น `multipart/form-data` ด้วยคีย์ `attachments[]` ได้ไฟล์ละหนึ่งข้อความ',
        parameters: [
          { name: 'conversationId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageCreate' },
              example: {
                content: 'ສະບາຍດີ ທີມໄອທີກຳລັງກວດສອບໃຫ້ຢູ່',
                message_type: 'outgoing',
                private: false,
              },
            },
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  content: { type: 'string' },
                  message_type: { type: 'string', enum: ['incoming', 'outgoing'] },
                  private: { type: 'string', enum: ['true', 'false'] },
                  'attachments[]': { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'ส่งแล้ว — `id` คือ id ข้อความฝั่ง Chatwoot ที่ต้องเก็บไว้กันดึงกลับซ้ำ',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Message' },
              },
            },
          },
          '401': ERROR_RESPONSE,
          '404': ERROR_RESPONSE,
          '422': {
            description:
              'ปฏิเสธ — ที่เจอบ่อยคือส่ง `incoming` เข้า inbox ที่ไม่ใช่ชนิด API',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },

    '/conversations/{conversationId}/toggle_status': {
      post: {
        tags: ['Conversations'],
        summary: 'เปลี่ยนสถานะการสนทนา',
        description:
          'ระบบเราสั่ง `resolved` เมื่อทีมไอทีปิดห้องแชทฝั่ง Helpdesk' +
          '\n\nการสนทนาที่ปิดแล้วจะถูกเปิดกลับเองเมื่อมีข้อความ `incoming` ใหม่เข้ามา',
        parameters: [
          { name: 'conversationId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['open', 'resolved', 'pending', 'snoozed'] },
                },
              },
              example: { status: 'resolved' },
            },
          },
        },
        responses: {
          '200': { description: 'เปลี่ยนแล้ว' },
          '401': ERROR_RESPONSE,
          '404': ERROR_RESPONSE,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      AgentToken: {
        type: 'apiKey',
        in: 'header',
        name: 'api-access-token',
        description:
          'Access Token ของเจ้าหน้าที่ — Chatwoot → รูปโปรไฟล์ → Profile settings → Access Token' +
          '\n\n⚠️ ต้องเป็น `api-access-token` (ขีดกลาง) ไม่ใช่ `api_access_token` มิฉะนั้น nginx ' +
          'ทิ้ง header แล้วได้ 401 ทั้งที่ token ถูก' +
          '\n\ntoken ทำงานในนามเจ้าหน้าที่คนนั้น เห็นและทำได้เท่าที่คนนั้นทำได้ในแอป' +
          '\n\nเก็บที่ `CHATWOOT_API_TOKEN` ใน `backend/.env` เท่านั้น ห้าม commit',
      },
    },
    schemas: {
      Contact: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          email: { type: 'string', nullable: true },
          phone_number: { type: 'string', nullable: true },
          identifier: {
            type: 'string',
            nullable: true,
            description: 'ระบบเราใช้ชื่อผู้ใช้ใน Helpdesk — ต้องไม่ซ้ำทั้งบัญชี',
          },
          custom_attributes: { type: 'object', additionalProperties: true },
        },
      },
      ContactCreate: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          identifier: { type: 'string' },
          email: { type: 'string' },
          phone_number: { type: 'string', description: 'ต้องขึ้นต้นด้วย + และเป็นรูปแบบสากล' },
          inbox_id: {
            type: 'integer',
            description: 'ส่งมาด้วยแล้วได้ contact_inbox พร้อม source_id กลับไปในคำขอเดียว',
          },
          custom_attributes: { type: 'object', additionalProperties: true },
        },
      },
      ContactInbox: {
        type: 'object',
        properties: {
          source_id: {
            type: 'string',
            description: 'ตัวระบุของผู้ติดต่อในกล่องนี้ — ใช้ตอนเปิดการสนทนา ไม่ใช่ contact id',
          },
          inbox: { $ref: '#/components/schemas/Inbox' },
        },
      },
      Inbox: {
        type: 'object',
        description:
          '⚠️ payload จริงมีอีกราว 40 ฟิลด์ รวม `hmac_token` ซึ่งเป็นความลับ ' +
          'ที่นี่มีเฉพาะฟิลด์ที่ระบบเราอ่านและส่งต่อได้อย่างปลอดภัย',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string', example: 'AIDC Helpdesk & Support' },
          channel_type: {
            type: 'string',
            enum: ['Channel::Api', 'Channel::WebWidget'],
            description:
              '`Channel::Api` เท่านั้นที่รับข้อความ incoming ได้ · ' +
              '`Channel::WebWidget` คือ widget บนหน้าเว็บ ซึ่งเป็นชนิดที่ Support Hub ใช้',
            example: 'Channel::WebWidget',
          },
          website_url: {
            type: 'string',
            nullable: true,
            description: 'มีเฉพาะ inbox ชนิด Website',
            example: 'https://aidc-helpdesk.vercel.app',
          },
          website_token: {
            type: 'string',
            nullable: true,
            description:
              '**เปิดเผยได้** — Chatwoot ออกแบบให้ token นี้อยู่ในสคริปต์ที่ทุกหน้าเว็บโหลด ' +
              'ระบบเราเก็บไว้ที่ `support_project.chatwoot_website_token` แล้วจ่ายต่อทาง ' +
              '`GET /api/v1/public/support-projects/{code}`',
          },
          hmac_token: {
            type: 'string',
            description:
              '🚫 **ความลับ — ระบบเราไม่อ่าน ไม่เก็บ และไม่ส่งต่อค่านี้เด็ดขาด** ' +
              'ใครถือไปคำนวณ identifier_hash ของคนอื่นได้ แล้วเปิดแชทในนามคนนั้น ' +
              '(ตัวที่ใช้จริงคือ CHATWOOT_HMAC_TOKEN ใน .env ซึ่งคนตั้งค่าคัดลอกมาเอง)',
          },
        },
      },
      ConversationListItem: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 3 },
          inbox_id: { type: 'integer', example: 1 },
          status: { type: 'string', enum: ['open', 'resolved', 'pending', 'snoozed'] },
          last_activity_at: {
            type: 'integer',
            description: 'unix timestamp (วินาที) — ระบบเราใช้ตัดสินว่าบทสนทนาขยับตั้งแต่รอบก่อนไหม',
            example: 1789439715,
          },
          meta: {
            type: 'object',
            properties: {
              sender: { $ref: '#/components/schemas/Contact' },
              hmac_verified: {
                type: 'boolean',
                description:
                  '⚠️ true = Chatwoot ตรวจ identifier_hash ของเว็บต้นทางผ่านแล้ว ' +
                  'ระบบเราจับคู่ผู้เข้าชมกับบัญชีใน Helpdesk เฉพาะกรณีนี้เท่านั้น ' +
                  'false = อีเมลมาจากฟอร์มก่อนแชท ซึ่งผู้เข้าชมพิมพ์ของใครก็ได้',
              },
              assignee: { type: 'object', additionalProperties: true },
            },
          },
          messages: {
            type: 'array',
            description: 'ในรายการนี้มีข้อความล่าสุดใบเดียว — ระบบเราไม่ใช้ ดึงครบจาก /messages แทน',
            items: { $ref: '#/components/schemas/Message' },
          },
        },
      },
      ConversationCreate: {
        type: 'object',
        required: ['source_id', 'inbox_id'],
        properties: {
          source_id: { type: 'string' },
          inbox_id: { type: 'integer' },
          contact_id: { type: 'integer' },
          status: { type: 'string', enum: ['open', 'resolved', 'pending'] },
          assignee_id: { type: 'integer' },
          team_id: { type: 'integer' },
          additional_attributes: { type: 'object', additionalProperties: true },
          custom_attributes: { type: 'object', additionalProperties: true },
        },
      },
      Conversation: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          inbox_id: { type: 'integer' },
          status: { type: 'string' },
          contact_last_seen_at: { type: 'integer' },
          additional_attributes: { type: 'object', additionalProperties: true },
        },
      },
      MessageCreate: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string' },
          message_type: {
            type: 'string',
            enum: ['incoming', 'outgoing'],
            description:
              'ตอนส่งเป็นข้อความ · ไม่ส่ง = outgoing · `incoming` ใช้ได้เฉพาะ inbox ชนิด API',
          },
          private: {
            type: 'boolean',
            description: 'true = โน้ตภายในของเจ้าหน้าที่ ผู้ติดต่อไม่เห็น',
          },
          content_attributes: { type: 'object', additionalProperties: true },
          content_type: { type: 'string', enum: ['text', 'input_select', 'cards', 'form'] },
          source_id: { type: 'string' },
          echo_id: { type: 'string' },
        },
      },
      Message: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          content: { type: 'string', nullable: true },
          message_type: {
            oneOf: [{ type: 'integer' }, { type: 'string' }],
            description:
              '⚠️ ตอนอ่านกลับมาเป็นตัวเลข: 0 incoming · 1 outgoing · 2 activity · 3 template',
          },
          content_type: { type: 'string' },
          private: { type: 'boolean' },
          created_at: { type: 'integer', description: 'unix timestamp (วินาที)' },
          sender: {
            type: 'object',
            properties: { id: { type: 'integer' }, name: { type: 'string' } },
          },
          attachments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                file_type: { type: 'string' },
                data_url: {
                  type: 'string',
                  description:
                    '⚠️ ดาวน์โหลดเฉพาะจาก host ของ Chatwoot ที่ตั้งไว้ (`CHATWOOT_FILE_HOSTS`) ' +
                    'URL มาจากข้อมูลภายนอก การเชื่อทุก URL เปิดช่องให้ยิงเข้าเครือข่ายภายใน',
                },
              },
            },
          },
        },
      },
      Error: {
        type: 'object',
        properties: {
          errors: { type: 'array', items: { type: 'string' } },
        },
        example: { errors: ['You need to sign in or sign up before continuing.'] },
      },
    },
  },
};
