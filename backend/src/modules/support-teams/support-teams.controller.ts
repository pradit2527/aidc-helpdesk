import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiEnvelope, ErrorResponseDto } from '../../common/http/envelope.dto';
import type { AccessScope } from '../../common/scope';
import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import {
  CreateSupportTeamDto,
  SupportTeamCandidateDto,
  SupportTeamDto,
  UpdateSupportTeamDto,
} from './dto/support-team.dto';
import { SupportTeamsService } from './support-teams.service';

@ApiTags('Support teams')
@Controller('support-teams')
@UseGuards(ScopeGuard)
@ApiCookieAuth('cookie')
export class SupportTeamsController {
  constructor(private readonly teams: SupportTeamsService) {}

  @Get()
  @ApiOperation({
    summary: 'รายการทีมสนับสนุน',
    description: [
      '**ความเป็นหัวหน้าทีมคือข้อมูล ไม่ใช่บทบาท** — ไม่มี role หรือ permission code ใหม่',
      'ตัวที่ให้อำนาจมอบหมายงานคือ `members[].is_lead` ของทีมที่ยังเปิดใช้งาน',
      '',
      '**ใครเห็นอะไร**',
      '- `user.assign_role` (company_admin / super_admin) — ทีมของบริษัทในขอบเขตตน + ทีมส่วนกลาง',
      '- ผู้ที่มีแค่ `ticket.assign` — เฉพาะทีมที่ตนสังกัด',
      '',
      '`company: null` = ทีมส่วนกลาง ดูแลทุกบริษัทในกลุ่ม · `members` เรียงหัวหน้าขึ้นก่อน',
    ].join('\n'),
  })
  @ApiResponse({ status: 200, type: [SupportTeamDto] })
  @ApiResponse({ status: 403, type: ErrorResponseDto, description: 'FORBIDDEN' })
  list(@CurrentScope() scope: AccessScope): Promise<SupportTeamDto[]> {
    return this.teams.list(scope);
  }

  @Get('candidates')
  @ApiOperation({
    summary: 'ผู้ที่ใส่เข้าทีมได้',
    description: [
      'กติกาเดียวกับ `GET /tickets/{id}/assignees` — ถือสิทธิ์ `ticket.change_status`',
      'หรือเป็น `super_admin` และอยู่ในขอบเขตบริษัทของผู้เรียก',
      '',
      'ต้องมีสิทธิ์ `user.assign_role` — การตั้งทีมคือการแก้โครงสร้างอำนาจ',
      'ไม่ใช่งานประจำวันของเจ้าหน้าที่',
    ].join('\n'),
  })
  @ApiResponse({ status: 200, type: [SupportTeamCandidateDto] })
  @ApiResponse({ status: 403, type: ErrorResponseDto, description: 'FORBIDDEN' })
  candidates(@CurrentScope() scope: AccessScope): Promise<SupportTeamCandidateDto[]> {
    return this.teams.candidates(scope);
  }

  @Post()
  @ApiOperation({
    summary: 'สร้างทีม',
    description: [
      'ต้องมีสิทธิ์ `user.assign_role`',
      '',
      '- `code` ไม่ส่งมา = สร้างจาก `name` · ชื่อภาษาลาวล้วนสร้างรหัสไม่ได้ ต้องระบุเอง (`422`)',
      '- `lead_ids` ต้องมีอย่างน้อยหนึ่งคน — ทีมไม่มีหัวหน้า = ไม่มีใครมอบหมายงานได้',
      '- หัวหน้าถูกนับเป็นสมาชิกให้อัตโนมัติ ไม่ต้องใส่ใน `member_ids` ซ้ำ',
      '- ทุก id ต้องอยู่ใน `GET /support-teams/candidates` มิฉะนั้น `422` พร้อม field error',
      '- `company_id: null` (ทีมส่วนกลาง) เฉพาะ `super_admin`',
    ].join('\n'),
  })
  @ApiBody({ type: CreateSupportTeamDto })
  @ApiEnvelope(SupportTeamDto, { status: 201 })
  @ApiResponse({ status: 422, type: ErrorResponseDto, description: 'VALIDATION_ERROR' })
  create(
    @CurrentScope() scope: AccessScope,
    @Body() dto: CreateSupportTeamDto,
  ): Promise<SupportTeamDto> {
    return this.teams.create(scope, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'แก้ไขทีม',
    description: [
      'ต้องมีสิทธิ์ `user.assign_role` และทีมต้องอยู่ในขอบเขตบริษัทของผู้เรียก',
      '',
      '- `lead_ids` / `member_ids` **แทนที่รายชื่อทั้งชุด** ในทรานแซกชันเดียว ไม่ใช่เพิ่มทับของเดิม',
      '  ส่งอย่างใดอย่างหนึ่งมา ต้องส่ง `lead_ids` ที่ไม่ว่างมาด้วยเสมอ',
      '- `is_active: false` = ปิดทีม หัวหน้าทีมนั้นหมดอำนาจมอบหมายทันที',
      '- ไม่ลบทีมทิ้ง เพราะประวัติการมอบหมายอ้างถึงทีมที่เคยมีอยู่',
    ].join('\n'),
  })
  @ApiParam({ name: 'id', example: 1 })
  @ApiBody({ type: UpdateSupportTeamDto })
  @ApiEnvelope(SupportTeamDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({ status: 422, type: ErrorResponseDto, description: 'VALIDATION_ERROR' })
  update(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupportTeamDto,
  ): Promise<SupportTeamDto> {
    return this.teams.update(scope, id, dto);
  }
}
