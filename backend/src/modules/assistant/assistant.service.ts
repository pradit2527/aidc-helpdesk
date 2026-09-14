import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';

import type { AccessScope } from '../../common/scope';
import { AuthService } from '../auth/auth.service';
import { MasterDataService } from '../master-data/master-data.service';
import { readAssistantConfig } from './assistant.config';
import type { AssistantTurnDto } from './assistant.dto';
import { buildInstructions, buildOrgContext, buildUserContext } from './assistant.prompt';
import { ASSISTANT_TOOLS, AssistantToolbox, type EmitAssistantEvent } from './assistant.tools';

/** รอบเรียกเครื่องมือสูงสุดต่อหนึ่งคำถาม — กันวนไม่รู้จบเมื่อผลลัพธ์ไม่ตรงที่โมเดลคาด */
const MAX_TOOL_ROUNDS = 6;
/** ข้อมูลหลักเปลี่ยนน้อย แต่ถ้าแคชนานเกินไป ผู้ดูแลเพิ่มหมวดหมู่แล้วผู้ช่วยยังไม่รู้จัก */
const ORG_CONTEXT_TTL_MS = 5 * 60_000;

/**
 * ผู้ช่วย AI ตอบปัญหาไอที — วงรอบคุยกับ Claude และเรียกเครื่องมือ
 *
 * ไม่เก็บบทสนทนาฝั่งเซิร์ฟเวอร์ หน้าจอส่งประวัติมาทุกคำถาม ผลคือระหว่างคำถาม
 * ผลลัพธ์ของเครื่องมือในรอบก่อนไม่ถูกส่งกลับไปด้วย โมเดลจึงต้องเรียกใหม่ถ้าต้องใช้
 * ซึ่งถูกกว่าการเก็บและส่งผลลัพธ์ดิบทั้งหมดซ้ำทุกครั้ง
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private readonly config = readAssistantConfig();
  private client: Anthropic | null = null;
  private readonly orgContextCache = new Map<string, { text: string; expiresAt: number }>();

  constructor(
    private readonly auth: AuthService,
    private readonly masterData: MasterDataService,
    private readonly toolbox: AssistantToolbox,
  ) {
    if (!this.config.enabled) {
      this.logger.log('ຜູ້ຊ່ວຍ AI: ປິດໄວ້ (ASSISTANT_ENABLED ບໍ່ແມ່ນ true)');
    } else if (!process.env.ANTHROPIC_API_KEY) {
      this.logger.warn('ຜູ້ຊ່ວຍ AI: ເປີດໄວ້ ແຕ່ຍັງບໍ່ໄດ້ຕັ້ງ ANTHROPIC_API_KEY — ທຸກຄຳຖາມຈະລົ້ມເຫຼວ');
    } else {
      this.logger.log(`ຜູ້ຊ່ວຍ AI: ພ້ອມໃຊ້ (${this.config.model}, effort ${this.config.effort})`);
    }
  }

  get status(): { enabled: boolean; model: string } {
    return { enabled: this.config.enabled, model: this.config.model };
  }

  /**
   * ตอบหนึ่งคำถาม สตรีมข้อความและเหตุการณ์ออกทาง emit
   *
   * ไม่โยนข้อผิดพลาดออกไป — หัวของ SSE ถูกส่งไปแล้วตอนที่เรียกเมท็อดนี้
   * จึงเปลี่ยนเป็นรหัส HTTP ไม่ได้อีก ทุกความล้มเหลวต้องกลายเป็นเหตุการณ์ error
   */
  async chat(
    scope: AccessScope,
    turns: readonly AssistantTurnDto[],
    emit: EmitAssistantEvent,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      await this.converse(scope, turns, emit, signal);
    } catch (error) {
      if (signal.aborted || error instanceof Anthropic.APIUserAbortError) return;
      emit({ type: 'error', message: this.describeFailure(error) });
    }
  }

  private async converse(
    scope: AccessScope,
    turns: readonly AssistantTurnDto[],
    emit: EmitAssistantEvent,
    signal: AbortSignal,
  ): Promise<void> {
    const client = (this.client ??= new Anthropic());
    const [me, orgContext] = await Promise.all([this.auth.meFor(scope), this.orgContext(scope)]);

    /*
     * ลำดับที่ API ประกอบ prompt คือ tools → system → messages และแคชเป็นการเทียบส่วนหน้า
     * วางของที่คงที่ที่สุดไว้ก่อน: คำสั่ง (เหมือนกันทุกคน) → ข้อมูลบริษัท (เหมือนกันทั้งบริษัท)
     * → ข้อมูลผู้ใช้กับเวลา (เปลี่ยนทุกคำขอ ไม่แคช)
     */
    const system: Anthropic.Beta.BetaTextBlockParam[] = [
      { type: 'text', text: buildInstructions(), cache_control: { type: 'ephemeral' } },
      { type: 'text', text: orgContext, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: buildUserContext(me, new Date()) },
    ];

    const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((t) => ({
      role: t.role,
      content: t.content,
    }));

    let wroteText = false;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const stream = client.beta.messages.stream(
        {
          model: this.config.model,
          max_tokens: 16000,
          thinking: { type: 'adaptive' },
          output_config: { effort: this.config.effort },
          /*
           * ถ้าตัวกรองความปลอดภัยของโมเดลปฏิเสธ ให้ API ส่งต่อไปโมเดลสำรองที่เหมาะกับ
           * ประเภทการปฏิเสธนั้นเองในคำขอเดียวกัน — คำถามเรื่องมัลแวร์หรือฟิชชิงของพนักงาน
           * เป็นเรื่องปกติของงานไอที และไม่ควรจบที่ "ตอบไม่ได้"
           */
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system,
          tools: ASSISTANT_TOOLS,
          messages,
        },
        { signal },
      );

      let firstDelta = true;
      stream.on('text', (delta) => {
        // คั่นย่อหน้าระหว่างรอบ — ไม่งั้นข้อความก่อนเรียกเครื่องมือกับหลังได้ผลจะติดกันเป็นประโยคเดียว
        if (firstDelta && wroteText) emit({ type: 'delta', text: '\n\n' });
        firstDelta = false;
        wroteText = true;
        emit({ type: 'delta', text: delta });
      });

      const message = await stream.finalMessage();

      if (message.stop_reason === 'refusal') {
        emit({
          type: 'error',
          message: 'ຜູ້ຊ່ວຍ AI ຕອບຄຳຖາມນີ້ບໍ່ໄດ້ ກະລຸນາແຈ້ງເລື່ອງໃຫ້ທີມໄອທີໂດຍກົງ',
        });
        return;
      }

      if (message.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: message.content });
        continue;
      }

      if (message.stop_reason !== 'tool_use') {
        if (message.stop_reason === 'max_tokens') {
          emit({ type: 'error', message: 'ຄຳຕອບຍາວເກີນກຳນົດ ກະລຸນາຖາມໃຫ້ແຄບລົງ' });
        }
        return;
      }

      const toolUses = message.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
      );
      messages.push({ role: 'assistant', content: message.content });

      // เครื่องมือหลายตัวในรอบเดียวรันพร้อมกัน แล้วส่งผลทั้งหมดกลับในข้อความเดียว
      const results = await Promise.all(toolUses.map((t) => this.toolbox.run(scope, t, emit)));
      messages.push({ role: 'user', content: results });
    }

    emit({ type: 'error', message: 'ຄຳຖາມນີ້ຕ້ອງໃຊ້ຫຼາຍຂັ້ນຕອນເກີນໄປ ກະລຸນາແບ່ງຖາມເທື່ອລະເລື່ອງ' });
  }

  /** ข้อมูลหลักของบริษัทสำหรับคำสั่งระบบ แคชแยกตามขอบเขตบริษัทของผู้ถาม */
  private async orgContext(scope: AccessScope): Promise<string> {
    const key = scope.isSuperAdmin ? 'all' : [...scope.companyIds].sort((a, b) => a - b).join(',');
    const cached = this.orgContextCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.text;

    const [categories, services, slaPolicies, businessHours] = await Promise.all([
      this.masterData.categories(scope, true),
      this.masterData.services(scope),
      this.masterData.slaPolicies(scope),
      this.masterData.businessHours(scope),
    ]);

    const text = buildOrgContext({ categories, services, slaPolicies, businessHours });
    this.orgContextCache.set(key, { text, expiresAt: Date.now() + ORG_CONTEXT_TTL_MS });
    return text;
  }

  /** ข้อความที่ผู้ใช้อ่านแล้วรู้ว่าต้องทำอะไรต่อ — รายละเอียดทางเทคนิคลง log เท่านั้น */
  private describeFailure(error: unknown): string {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      this.logger.error(`ผู้ช่วย AI: คีย์ API ใช้ไม่ได้ (${error.status})`);
      return 'ຜູ້ຊ່ວຍ AI ຍັງຕັ້ງຄ່າບໍ່ຖືກຕ້ອງ ກະລຸນາແຈ້ງຜູ້ດູແລລະບົບ';
    }
    if (error instanceof Anthropic.RateLimitError) {
      return 'ມີຄົນໃຊ້ຜູ້ຊ່ວຍ AI ຫຼາຍໃນຕອນນີ້ ກະລຸນາລອງໃໝ່ໃນອີກຈັກໜ່ອຍ';
    }
    if (error instanceof Anthropic.APIError) {
      this.logger.error(`ผู้ช่วย AI: API ตอบ ${error.status} — ${error.message}`);
      return 'ຜູ້ຊ່ວຍ AI ຂັດຂ້ອງຊົ່ວຄາວ ກະລຸນາລອງໃໝ່';
    }
    this.logger.error(`ผู้ช่วย AI ล้มเหลว: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    return 'ຜູ້ຊ່ວຍ AI ຂັດຂ້ອງຊົ່ວຄາວ ກະລຸນາລອງໃໝ່';
  }
}
