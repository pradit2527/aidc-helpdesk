import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { clampPage, clampPageSize } from '../../common/http/pagination';
import type { AccessScope } from '../../common/scope';
import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import { KbService } from './kb.service';

@ApiTags('Knowledge base')
@Controller('kb')
@UseGuards(ScopeGuard)
@ApiCookieAuth('cookie')
export class KbController {
  constructor(private readonly kb: KbService) {}

  /*
   * ประกาศ /kb/categories ไว้เหนือ /kb/articles/:id ไม่จำเป็นในที่นี้
   * เพราะคนละพาธกัน แต่ /kb/articles ต้องอยู่เหนือ /kb/articles/:id เสมอ
   * มิฉะนั้น Nest จะจับ "articles" เป็นค่า id แล้ว ParseIntPipe ตอบ 400
   */

  @Get('categories')
  @ApiOperation({ summary: 'หมวดหมู่คลังความรู้ (แบนราบพร้อม parent_id)' })
  categories(@CurrentScope() scope: AccessScope) {
    scope.require('kb.read');
    return this.kb.categories();
  }

  @Get('articles')
  @ApiOperation({
    summary: 'ค้นหาบทความ',
    description:
      'ผู้ใช้ทั่วไปเห็นเฉพาะบทความที่เผยแพร่แล้วและไม่ใช่ `agent_only` · ' +
      'ค้นด้วย `q` ใช้ ILIKE บนหัวข้อ สรุป และแท็ก เพราะภาษาลาวไม่เว้นวรรค ' +
      'ทำให้ full-text search ของ Postgres ตัดคำไม่ได้',
  })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'category_id', required: false })
  @ApiQuery({ name: 'tag', required: false })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['draft', 'published', 'archived'],
    description: 'มีผลเฉพาะผู้ที่มีสิทธิ์แก้ไขบทความ',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'page_size', required: false, example: 20 })
  articles(
    @CurrentScope() scope: AccessScope,
    @Query('q') q?: string,
    @Query('category_id') categoryId?: string,
    @Query('tag') tag?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
  ) {
    scope.require('kb.read');
    return this.kb.list(scope, {
      q,
      category_id: categoryId,
      tag,
      status,
      page: clampPage(page),
      page_size: clampPageSize(pageSize),
    });
  }

  @Get('articles/:id')
  @ApiOperation({ summary: 'อ่านบทความฉบับเต็ม (Markdown)' })
  article(@CurrentScope() scope: AccessScope, @Param('id', ParseIntPipe) id: number) {
    scope.require('kb.read');
    return this.kb.detail(scope, id);
  }
}
