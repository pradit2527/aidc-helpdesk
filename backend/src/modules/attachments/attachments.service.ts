import { Inject, Injectable } from '@nestjs/common';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';

import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-error';
import {
  detectFileType,
  MAX_FILE_BYTES,
  MAX_FILES_PER_REQUEST,
} from '../../common/files/file-type';
import type { AccessScope } from '../../common/scope';
import type { Db } from '../../db/client';
import { DB } from '../../db/db.module';
import { attachment } from '../../db/schema';

export interface UploadedFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

/**
 * ไฟล์แนบ
 *
 * ⚠️ ชื่อไฟล์ของผู้ใช้ไม่เคยถูกใช้ประกอบ path บนดิสก์
 *    path ทั้งหมดระบบเป็นคนกำหนด: {companyId}/{yyyy}/{mm}/{uuid}.{ext}
 *    ชื่อเดิมเก็บไว้ในคอลัมน์ file_name เพื่อแสดงและใช้ตอนดาวน์โหลดเท่านั้น
 *
 *    เหตุผล: ชื่อไฟล์อย่าง "../../../etc/passwd" หรือชื่อที่มี NUL byte
 *    ทำให้เขียนทับไฟล์นอกโฟลเดอร์ที่ตั้งใจได้ และการ "ล้างชื่อให้ปลอดภัย"
 *    เป็นงานที่พลาดได้เรื่อย ๆ ทุกครั้งที่เจอการเข้ารหัสแบบใหม่
 *    การไม่ใช้ชื่อผู้ใช้เลยปิดช่องทั้งหมวดนี้ถาวร
 *
 * ⚠️ ชนิดไฟล์ตรวจจาก magic bytes ไม่ใช่ Content-Type ที่ client ส่ง (NFR-15)
 *
 * เฟส 1 เก็บลงดิสก์ในเครื่อง — scan_status = 'skipped' ทั้งหมด (B-04)
 * ยังไม่มีการสแกนไวรัส ซึ่งบันทึกไว้ตรง ๆ ในฐานข้อมูลแทนการอ้างว่าสะอาด
 */
@Injectable()
export class AttachmentsService {
  /**
   * โฟลเดอร์เก็บไฟล์
   *
   * อ่านจากตัวแปรสภาพแวดล้อมเพื่อให้ย้ายไปที่เก็บอื่นได้โดยไม่แก้โค้ด
   * ค่าเริ่มต้นอยู่ใต้โฟลเดอร์โปรเจกต์ ซึ่งเหมาะกับเครื่องพัฒนาเท่านั้น —
   * บน production ต้องชี้ไปยังดิสก์ที่สำรองข้อมูล มิฉะนั้นไฟล์แนบทั้งหมด
   * หายไปพร้อมกับคอนเทนเนอร์ที่ถูกสร้างใหม่
   */
  private readonly root = process.env.ATTACHMENT_DIR ?? path.resolve('storage/attachments');

  constructor(@Inject(DB) private readonly db: Db) {}

  async upload(scope: AccessScope, files: UploadedFile[]) {
    if (files.length === 0) {
      throw new ValidationError('VALIDATION_ERROR', 'ບໍ່ມີໄຟລ໌ໃນຄຳຂໍ', [
        { field: 'files', message: 'ກະລຸນາເລືອກໄຟລ໌' },
      ]);
    }
    if (files.length > MAX_FILES_PER_REQUEST) {
      throw new ValidationError(
        'VALIDATION_ERROR',
        `ອັບໂຫຼດໄດ້ສູງສຸດ ${MAX_FILES_PER_REQUEST} ໄຟລ໌ຕໍ່ຄັ້ງ`,
        [{ field: 'files', message: `ສູງສຸດ ${MAX_FILES_PER_REQUEST} ໄຟລ໌` }],
      );
    }

    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dir = path.join(this.root, String(scope.homeCompanyId), yyyy, mm);
    await fs.mkdir(dir, { recursive: true });

    const saved: { id: number; file_name: string; mime_type: string; file_size: number }[] = [];

    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        throw new ValidationError(
          'FILE_TOO_LARGE',
          `ໄຟລ໌ "${file.originalname}" ໃຫຍ່ເກີນ 20 MB`,
          [{ field: 'files', message: 'ຂະໜາດເກີນກຳນົດ' }],
        );
      }

      const detected = detectFileType(file.buffer.subarray(0, 32), file.originalname);
      if (!detected) {
        /*
         * ระบุชื่อไฟล์ในข้อความ เพราะผู้ใช้เลือกได้ทีละหลายไฟล์
         * ข้อความว่า "ชนิดไฟล์ไม่รองรับ" เฉย ๆ ทำให้ต้องลองทีละไฟล์เอง
         */
        throw new ValidationError(
          'UNSUPPORTED_FILE_TYPE',
          `ໄຟລ໌ "${file.originalname}" ເປັນຊະນິດທີ່ບໍ່ຮອງຮັບ`,
          [{ field: 'files', message: 'ຮອງຮັບ ຮູບພາບ · PDF · zip · ຂໍ້ຄວາມ' }],
        );
      }

      // ชื่อบนดิสก์มาจาก uuid ล้วน ไม่มีส่วนใดมาจากผู้ใช้
      const storageKey = path
        .join(String(scope.homeCompanyId), yyyy, mm, `${crypto.randomUUID()}.${detected.ext}`)
        .replace(/\\/g, '/');

      await fs.writeFile(path.join(this.root, storageKey), file.buffer);

      const [row] = await this.db
        .insert(attachment)
        .values({
          storageKey,
          fileName: file.originalname.slice(0, 255),
          mimeType: detected.mime,
          fileSize: file.size,
          uploadedBy: scope.userId,
          // เฟส 1 ยังไม่มีการสแกนไวรัส — บันทึกตรง ๆ ว่าข้ามไป (B-04)
          scanStatus: 'skipped',
        })
        .returning({ id: attachment.id });

      saved.push({
        id: row!.id,
        file_name: file.originalname,
        mime_type: detected.mime,
        file_size: file.size,
      });
    }

    return saved;
  }

  /**
   * อ่านไฟล์เพื่อดาวน์โหลด
   *
   * ⚠️ ไฟล์ที่ตรวจพบไวรัสต้องไม่ถูกส่งออกไม่ว่ากรณีใด (403)
   *    เฟส 1 ยังไม่มีการสแกน ค่าจึงเป็น 'skipped' เสมอ แต่เงื่อนไขนี้
   *    ต้องมีอยู่ตั้งแต่ตอนนี้ ไม่ใช่รอเพิ่มตอนเปิดใช้การสแกน
   *    เพราะวันนั้นจะไม่มีใครจำได้ว่าต้องเพิ่มตรงไหน
   */
  async read(scope: AccessScope, id: number) {
    const [row] = await this.db
      .select({
        id: attachment.id,
        storageKey: attachment.storageKey,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        fileSize: attachment.fileSize,
        uploadedBy: attachment.uploadedBy,
        scanStatus: attachment.scanStatus,
      })
      .from(attachment)
      .where(and(eq(attachment.id, id), isNull(attachment.deletedAt)))
      .limit(1);

    if (!row) throw new NotFoundError('ATTACHMENT_NOT_FOUND', 'ບໍ່ພົບໄຟລ໌ແນບ', { id });

    if (row.scanStatus === 'infected') {
      throw new ForbiddenError('FILE_INFECTED', 'ໄຟລ໌ນີ້ຖືກກວດພົບວ່າມີໄວຣັສ ດາວໂຫຼດບໍ່ໄດ້');
    }

    /*
     * ตรวจ path ที่ประกอบแล้วว่ายังอยู่ใต้โฟลเดอร์ราก
     *
     * storage_key มาจากระบบเองทั้งหมด จึงไม่ควรหลุดออกนอกอยู่แล้ว
     * แต่ตรวจไว้เป็นด่านสุดท้าย — ถ้าวันหนึ่งมีทางให้เขียนค่านี้จากภายนอก
     * (เช่นสคริปต์ย้ายข้อมูล) ด่านนี้จะกันไว้แทนที่จะเปิดให้อ่านไฟล์ทั้งเครื่อง
     */
    const full = path.resolve(this.root, row.storageKey);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) {
      throw new NotFoundError('ATTACHMENT_NOT_FOUND', 'ບໍ່ພົບໄຟລ໌ແນບ', { id });
    }

    const buffer = await fs.readFile(full).catch(() => null);
    if (!buffer) {
      // แถวในฐานข้อมูลมี แต่ไฟล์บนดิสก์หาย — บอกให้ชัดว่าเป็นคนละสาเหตุ
      // กับ "ไม่มีไฟล์นี้" เพราะวิธีแก้ต่างกันสิ้นเชิง
      throw new NotFoundError('ATTACHMENT_FILE_MISSING', 'ຂໍ້ມູນໄຟລ໌ມີແຕ່ຫາໄຟລ໌ຈິງບໍ່ພົບ', {
        id,
        storage_key: row.storageKey,
      });
    }

    void scope;
    return { ...row, buffer };
  }

  /** ลบแบบ soft delete — ผู้อัปโหลดเอง หรือผู้มีสิทธิ์แก้ไขเรื่อง */
  async remove(scope: AccessScope, id: number) {
    const [row] = await this.db
      .select({ id: attachment.id, uploadedBy: attachment.uploadedBy })
      .from(attachment)
      .where(and(eq(attachment.id, id), isNull(attachment.deletedAt)))
      .limit(1);

    if (!row) throw new NotFoundError('ATTACHMENT_NOT_FOUND', 'ບໍ່ພົບໄຟລ໌ແນບ', { id });

    if (row.uploadedBy !== scope.userId && !scope.has('ticket.update')) {
      throw new ForbiddenError('FORBIDDEN', 'ທ່ານລຶບໄຟລ໌ນີ້ບໍ່ໄດ້');
    }

    /*
     * ลบแค่ธง ไม่ลบไฟล์บนดิสก์
     *
     * ไฟล์แนบเป็นหลักฐานประกอบ ticket การลบจริงทำให้ประวัติที่อ้างถึงไฟล์นั้น
     * ชี้ไปที่ความว่างเปล่า งานล้างไฟล์กำพร้าเป็นงานเบื้องหลังที่แยกต่างหาก
     * และต้องเว้นระยะให้ตรงกับนโยบายเก็บหลักฐาน
     */
    await this.db.update(attachment).set({ deletedAt: new Date() }).where(eq(attachment.id, id));
    return { id, deleted: true };
  }
}
