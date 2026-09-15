import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import type { AccessScope } from '../../common/scope';
import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import { clampPage, clampPageSize } from '../../common/http/pagination';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
@UseGuards(ScopeGuard)
@ApiCookieAuth('cookie')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'รายชื่อผู้ใช้ในขอบเขต',
    description:
      'ค้นด้วย `q` ได้ทั้งชื่อ ชื่อผู้ใช้ และรหัสพนักงาน · ' +
      '`company_id` ที่อยู่นอกขอบเขตจะถูกตัดทิ้งเงียบ ๆ ไม่ตอบ 403 ' +
      'เพราะการตอบ 403 ยืนยันว่าบริษัทนั้นมีอยู่จริง',
  })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'company_id', required: false })
  @ApiQuery({ name: 'is_active', required: false, enum: ['true', 'false'] })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'page_size', required: false, example: 20 })
  list(
    @CurrentScope() scope: AccessScope,
    @Query('q') q?: string,
    @Query('company_id') companyId?: string,
    @Query('is_active') isActive?: string,
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
  ) {
    scope.require('user.read');
    // คืนรูป PagedResult ตรง ๆ — EnvelopeInterceptor แตกเป็น data + meta ให้เอง
    return this.users.list(scope, {
      q,
      company_id: companyId,
      is_active: isActive,
      page: clampPage(page),
      page_size: clampPageSize(pageSize),
    });
  }

  @Post()
  @ApiOperation({
    summary: 'สร้างผู้ใช้หนึ่งคน (สำหรับผู้ดูแล)',
    description:
      'ต้องมีสิทธิ์ `user.create` · บทบาทอื่นนอกจาก `end_user` ต้องมี `user.assign_role` ด้วย · ' +
      '**เฉพาะ super_admin สร้าง super_admin ได้** · บริษัทต้องอยู่ในขอบเขตของผู้เรียกและเปิดใช้งาน · ' +
      'แผนกต้องเป็นของบริษัทนั้น · รหัสผ่าน ≥ 12 อักขระ มีตัวพิมพ์ใหญ่ เล็ก ตัวเลข สัญลักษณ์ (นโยบาย 3.2) · ' +
      'ข้อมูลผิดตอบ 422 พร้อมรายช่อง · บัญชีที่สร้างมี `must_change_password = true` · ' +
      'คืนรายละเอียดผู้ใช้ที่สร้าง',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['username', 'full_name', 'company_id', 'role', 'password'],
      properties: {
        username: { type: 'string', example: 'demo.cosi', description: 'a-z 0-9 . _ - ยาว 3–50 · แก้ภายหลังไม่ได้' },
        full_name: { type: 'string', example: 'ດີໂມ COSI' },
        company_id: { type: 'number', example: 1 },
        department_id: { type: 'number', nullable: true },
        role: { type: 'string', enum: ['end_user', 'agent', 'company_admin', 'manager_viewer', 'super_admin'] },
        password: { type: 'string', format: 'password' },
        email: { type: 'string', nullable: true },
        employee_code: { type: 'string', nullable: true },
        job_title: { type: 'string', nullable: true },
        phone: { type: 'string', nullable: true },
      },
    },
  })
  createUser(
    @CurrentScope() scope: AccessScope,
    @Body()
    body: {
      username?: string;
      full_name?: string;
      email?: string | null;
      employee_code?: string | null;
      job_title?: string | null;
      phone?: string | null;
      company_id?: number;
      department_id?: number | null;
      role?: string;
      password?: string;
    },
  ) {
    scope.require('user.create');
    return this.users.createUser(scope, body);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'แก้ไขข้อมูลติดต่อของตนเอง',
    description:
      'แก้ได้เฉพาะ `full_name` `email` `phone` — ฟิลด์ที่ตัดสินสิทธิ์ ' +
      '(บริษัท แผนก สถานะใช้งาน) ต้องแก้ผ่านผู้ดูแลเท่านั้น ' +
      'มิฉะนั้นผู้ใช้จะย้ายตัวเองเข้าบริษัทอื่นแล้วเห็นข้อมูลของบริษัทนั้นได้',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        full_name: { type: 'string' },
        email: { type: 'string', nullable: true },
        phone: { type: 'string', nullable: true },
      },
    },
  })
  updateMe(
    @CurrentScope() scope: AccessScope,
    @Body() body: { full_name?: string; email?: string | null; phone?: string | null },
  ) {
    // ไม่ต้องมีสิทธิ์พิเศษ — ทุกคนแก้ข้อมูลติดต่อของตัวเองได้
    return this.users.updateMe(scope.userId, body);
  }

  @Post('import')
  @ApiOperation({
    summary: 'นำเข้าผู้ใช้จากไฟล์ CSV',
    description:
      'คืนผลรายแถว ไม่ใช่แค่ยอดรวม — ไฟล์รายชื่อพนักงานมีหลักร้อยแถว ' +
      'ถ้าบอกแค่ยอดรวม ผู้ดูแลต้องไล่หาเองว่าแถวไหนตก · ' +
      '`dry_run: true` ตรวจไฟล์อย่างเดียว ไม่เขียนอะไรลงฐานข้อมูล · ' +
      'คอลัมน์บังคับ: `username` `full_name` `company_code` · ' +
      'ทุกบัญชีที่สร้างถูกบังคับ `must_change_password` และไม่ได้รับบทบาทใดจากไฟล์',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['csv'],
      properties: {
        csv: { type: 'string', description: 'เนื้อไฟล์ CSV ทั้งไฟล์ รวมบรรทัดหัวคอลัมน์' },
        default_password: {
          type: 'string',
          description: 'รหัสตั้งต้นของทุกบัญชีที่สร้าง ≥ 12 อักขระ · ไม่ต้องส่งเมื่อ dry_run',
        },
        dry_run: { type: 'boolean', example: true },
      },
    },
  })
  importUsers(
    @CurrentScope() scope: AccessScope,
    @Body() body: { csv?: string; default_password?: string; dry_run?: boolean },
  ) {
    scope.require('user.create');
    return this.users.importUsers(scope, {
      csv: body.csv ?? '',
      ...(body.default_password !== undefined
        ? { default_password: body.default_password }
        : {}),
      ...(body.dry_run !== undefined ? { dry_run: body.dry_run } : {}),
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'รายละเอียดผู้ใช้ พร้อมบทบาทและขอบเขตบริษัท',
    description:
      'บทบาทที่หมดอายุแล้วยังคืนมาด้วยแต่ติดธง `is_expired` — ' +
      'ผู้ดูแลต้องเห็นว่าเคยให้สิทธิ์อะไรไว้ ไม่ใช่ให้มันหายไปเฉย ๆ',
  })
  detail(@CurrentScope() scope: AccessScope, @Param('id', ParseIntPipe) id: number) {
    scope.require('user.read');
    return this.users.detail(scope, id);
  }

  /*
   * ต้องประกาศหลัง @Patch('me') เสมอ — Express จับเส้นทางตามลำดับที่ลงทะเบียน
   * ถ้า :id มาก่อน คำขอ PATCH /users/me จะถูก ParseIntPipe ปฏิเสธด้วย 400
   * ก่อนไปถึง updateMe
   */
  @Patch(':id')
  @ApiOperation({
    summary: 'ย้ายบริษัท / แผนก และแก้ชื่อของผู้ใช้ (สำหรับผู้ดูแล)',
    description:
      'ต้องมีสิทธิ์ `user.assign_role` ไม่ใช่ `user.update` — บริษัทต้นสังกัดตัดสินว่าผู้ใช้เห็นข้อมูลของใคร ' +
      'การย้ายบริษัทจึงเท่ากับการมอบสิทธิ์ · บริษัทปลายทางต้องอยู่ในขอบเขตของผู้เรียกและยังเปิดใช้งาน · ' +
      'แผนกต้องเป็นของบริษัทที่ผู้ใช้สังกัด · ย้ายบริษัทโดยไม่ส่ง `department_id` จะล้างแผนกทิ้ง · ' +
      'ส่ง `department_id: null` เพื่อล้างแผนกเอง · คืนรายละเอียดผู้ใช้หลังบันทึก',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        full_name: { type: 'string' },
        company_id: { type: 'number', example: 1 },
        department_id: { type: 'number', nullable: true, example: 11 },
      },
    },
  })
  updateUser(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { full_name?: string; company_id?: number; department_id?: number | null },
  ) {
    return this.users.updateUser(scope, id, body);
  }

  @Post(':id/unlock')
  @ApiOperation({
    summary: 'ปลดล็อกบัญชี',
    description:
      'นโยบาย 3.2 ห้ามปลดล็อกเองตามเวลา ต้องผ่าน Service Desk ที่ยืนยันตัวตนแล้ว · ' +
      'รีเซ็ต `failed_login_count` ให้ด้วย — ถ้าล้างแต่ธง ตัวนับยังค้างที่ค่าเดิม ' +
      'แล้วการกรอกผิดครั้งเดียวหลังจากนั้นจะล็อกซ้ำทันที',
  })
  unlock(@CurrentScope() scope: AccessScope, @Param('id', ParseIntPipe) id: number) {
    scope.require('user.reset_password', 'user.update');
    return this.users.unlock(scope, id);
  }

  @Put(':id/roles')
  @ApiOperation({
    summary: 'มอบบทบาทให้ผู้ใช้',
    description:
      'แทนที่ชุดบทบาททั้งหมด ไม่ใช่เพิ่มทีละอัน · ' +
      '**เฉพาะ super_admin เท่านั้นที่มอบบทบาท super_admin ได้** — ' +
      'ถ้าไม่กัน company_admin จะตั้งตัวเองเป็น super_admin ได้ในคลิกเดียว · ' +
      '`company_ids` ที่อยู่นอกขอบเขตของผู้เรียกถูกตัดทิ้งเงียบ ๆ ' +
      'มิฉะนั้นผู้ดูแลบริษัทหนึ่งจะขยายขอบเขตของตัวเองผ่านคนอื่นได้',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['roles'],
      properties: {
        roles: {
          type: 'array',
          items: {
            type: 'object',
            required: ['code'],
            properties: {
              code: {
                type: 'string',
                enum: ['end_user', 'agent', 'company_admin', 'manager_viewer', 'super_admin'],
              },
              company_ids: { type: 'array', items: { type: 'number' } },
              expires_at: { type: 'string', nullable: true, description: 'ISO 8601' },
            },
          },
        },
      },
    },
  })
  setRoles(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: { roles?: { code: string; company_ids?: number[]; expires_at?: string | null }[] },
  ) {
    return this.users.setRoles(scope, id, { roles: body.roles ?? [] });
  }

}