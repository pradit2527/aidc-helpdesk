import {
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { NoEnvelope } from '../../common/http/envelope.dto';
import { isInlineSafeMime, MAX_FILE_BYTES, MAX_FILES_PER_REQUEST } from '../../common/files/file-type';
import { parseByteRange } from '../../common/http/byte-range';
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
      'รองรับ รูปภาพ · วิดีโอ (mp4 · mov · webm · 3gp) · PDF · zip (รวม docx/xlsx) · ข้อความล้วน · ' +
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
      '404 เมื่อไม่มีไฟล์ **หรือผู้ขอไม่มีสิทธิ์เห็น** (ไม่แยก เพื่อไม่ให้ไล่เดาเลข id ได้) · ' +
      '`Content-Disposition: attachment` เป็นค่าเริ่มต้น เพื่อไม่ให้เบราว์เซอร์เปิดไฟล์ ' +
      'ที่ผู้ใช้อัปโหลดในบริบทของโดเมนเรา ซึ่งเป็นช่องทาง XSS แบบเก็บถาวร · ' +
      '`?inline=1` เปิดในหน้าเว็บได้เฉพาะรูปภาพและวิดีโอ (ชนิดที่ไม่มีทางรันสคริปต์) ' +
      'ชนิดอื่นยังดาวน์โหลดอย่างเดียว · รองรับ `Range` เพื่อให้เล่นและเลื่อนวิดีโอได้',
  })
  @ApiQuery({ name: 'inline', required: false, enum: ['1'] })
  async download(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
    @Query('inline') inline?: string,
    @Headers('range') rangeHeader?: string,
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
    /*
     * inline ได้เฉพาะรูปและวิดีโอ — ชนิดอื่นต่อให้ขอ ?inline=1 ก็ถูกบังคับดาวน์โหลดเหมือนเดิม
     * ตัดสินจากชนิดที่ "ตรวจจากไบต์จริงตอนอัปโหลด" ไม่ใช่จากที่ผู้ขอบอกมา
     */
    const showInline = inline === '1' && isInlineSafeMime(file.mimeType);

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-cache');
    res.setHeader(
      'Content-Disposition',
      // encodeURIComponent กันชื่อไฟล์ที่มีอักษรลาว/ไทย หรือเครื่องหมายคำพูด
      // ที่จะทำให้ header ผิดรูปแบบ
      `${showInline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    if (showInline) {
      // ชั้นที่สอง: ถ้ามีใครเปิด URL นี้ตรง ๆ เบราว์เซอร์จะไม่รันอะไรจากมันเลย
      // (<img> และ <video> ที่ฝังในหน้าเราไม่ได้รับผลกระทบ)
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    }

    /*
     * ส่งเป็นช่วงเมื่อถูกขอ — Safari ไม่เล่นวิดีโอถ้าได้ 200 ทั้งไฟล์แทน 206
     * ใช้กับการดาวน์โหลดปกติได้เช่นกัน (ดาวน์โหลดต่อจากที่ค้างได้)
     */
    const range = parseByteRange(rangeHeader, file.buffer.length);
    if (range === 'unsatisfiable') {
      res.status(416);
      res.setHeader('Content-Range', `bytes */${file.buffer.length}`);
      res.end();
      return;
    }
    if (range) {
      const part = file.buffer.subarray(range.start, range.end + 1);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${file.buffer.length}`);
      res.setHeader('Content-Length', String(part.length));
      res.end(part);
      return;
    }

    res.setHeader('Content-Length', String(file.fileSize));
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
