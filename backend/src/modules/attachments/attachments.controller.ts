import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { NoEnvelope } from '../../common/http/envelope.dto';
import { MAX_FILE_BYTES, MAX_FILES_PER_REQUEST } from '../../common/files/file-type';
import type { AccessScope } from '../../common/scope';
import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import { AttachmentsService, type UploadedFile } from './attachments.service';

@ApiTags('Attachments')
@Controller('attachments')
@UseGuards(ScopeGuard)
@ApiCookieAuth('cookie')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES_PER_REQUEST, {
      // จำกัดขนาดที่ระดับ middleware ด้วย ไม่ใช่ตรวจหลังรับครบแล้ว
      // มิฉะนั้นไฟล์ 2 GB จะถูกอ่านเข้าหน่วยความจำจนหมดก่อนถูกปฏิเสธ
      limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES_PER_REQUEST },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'อัปโหลดไฟล์แนบ',
    description:
      'สูงสุด 5 ไฟล์ · ไฟล์ละ ≤ 20 MB · ' +
      '**ตรวจชนิดจาก magic bytes ไม่ใช่ Content-Type ที่ส่งมา** (NFR-15) — ' +
      'รองรับ รูปภาพ · PDF · zip (รวม docx/xlsx) · ข้อความล้วน · ' +
      'ชื่อไฟล์ของผู้ใช้ไม่ถูกใช้ประกอบ path บนดิสก์เลย · ' +
      'อัปโหลดก่อนสร้าง ticket ได้ แล้วค่อยผูกภายหลัง (B-08) — ' +
      'ไฟล์ที่ไม่ถูกผูกกับอะไรจะถูกล้างโดยงานเบื้องหลัง',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  upload(
    @CurrentScope() scope: AccessScope,
    @UploadedFiles() files: UploadedFile[] | undefined,
  ) {
    scope.require('ticket.attach', 'ticket.create');
    return this.attachments.upload(scope, files ?? []);
  }

  @Get(':id/download')
  /*
   * ส่งไฟล์ดิบ ไม่ห่อซองมาตรฐาน — ซองใช้กับ JSON เท่านั้น
   * การห่อไฟล์ไบนารีด้วย JSON จะทำให้ไฟล์เสียและขนาดโตขึ้นหนึ่งในสาม
   */
  @NoEnvelope()
  @ApiOperation({
    summary: 'ดาวน์โหลดไฟล์แนบ',
    description:
      'ส่งไฟล์ตรง ๆ ไม่ห่อซองมาตรฐาน · 403 เมื่อ `scan_status = infected` · ' +
      '`Content-Disposition: attachment` เสมอ เพื่อไม่ให้เบราว์เซอร์เปิดไฟล์ ' +
      'ที่ผู้ใช้อัปโหลดในบริบทของโดเมนเรา ซึ่งเป็นช่องทาง XSS แบบเก็บถาวร',
  })
  async download(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.attachments.read(scope, id);

    /*
     * บังคับดาวน์โหลดเสมอ ไม่เปิดในเบราว์เซอร์
     *
     * ไฟล์ HTML หรือ SVG ที่ผู้ใช้อัปโหลด ถ้าเบราว์เซอร์เปิดในโดเมนเรา
     * สคริปต์ข้างในจะรันพร้อมคุกกี้ของผู้ที่กดเปิด — เป็น XSS แบบเก็บถาวร
     * ที่ผู้โจมตีวางไว้รอได้นานเท่าที่ต้องการ
     *
     * X-Content-Type-Options กัน MIME sniffing ของเบราว์เซอร์เก่า
     * ที่เดาชนิดจากเนื้อไฟล์แล้วเปิดให้เองแม้ header จะบอกว่าให้ดาวน์โหลด
     */
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.fileSize));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      // encodeURIComponent กันชื่อไฟล์ที่มีอักษรลาว/ไทย หรือเครื่องหมายคำพูด
      // ที่จะทำให้ header ผิดรูปแบบ
      `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    res.end(file.buffer);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'ลบไฟล์แนบ',
    description:
      'ผู้อัปโหลดเอง หรือผู้มีสิทธิ์ `ticket.update` · ' +
      'ลบแบบ soft delete — ไฟล์แนบเป็นหลักฐานประกอบเรื่อง การลบจริงทำให้ ' +
      'ประวัติที่อ้างถึงไฟล์นั้นชี้ไปที่ความว่างเปล่า',
  })
  remove(@CurrentScope() scope: AccessScope, @Param('id', ParseIntPipe) id: number) {
    return this.attachments.remove(scope, id);
  }
}
