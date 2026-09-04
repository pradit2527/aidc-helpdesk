import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

import { RefCompanyDto, RefNamedDto } from '../../../common/dto/common.dto';

export class LoginDto {
  @ApiProperty({ example: 'somchai.k' })
  @IsString()
  username!: string;

  @ApiProperty({
    example: 'Str0ng-P@ssw0rd!',
    description:
      'ไม่ตรวจความยาวหรือความซับซ้อนที่นี่ — endpoint นี้แค่ตรวจว่ารหัสตรงกับที่เก็บไว้ไหม ' +
      'นโยบายความแข็งแรงบังคับตอน "ตั้ง" รหัสที่ /auth/change-password',
  })
  @IsString()
  password!: string;
}

export class CurrentUserDto {
  @ApiProperty({ example: 145 }) id!: number;
  @ApiProperty({ example: 'somchai.k' }) username!: string;
  @ApiProperty({ example: 'ສົມຊາຍ ກິດຕິວັດ' }) full_name!: string;
  @ApiPropertyOptional({ example: 'somchai.k@aidctech.com.la' }) email?: string;
  @ApiProperty({ type: RefCompanyDto }) company!: RefCompanyDto;
  @ApiPropertyOptional({ example: 'ເຈົ້າໜ້າທີ່ສະໜັບສະໜູນໄອທີ' }) job_title?: string | null;
  @ApiPropertyOptional({ type: RefNamedDto }) department?: RefNamedDto | null;

  @ApiProperty({ example: ['agent'], type: [String] })
  roles!: string[];

  @ApiProperty({
    type: [RefCompanyDto],
    description: 'ขอบเขตบริษัทที่มองเห็นได้ — backend บังคับซ้ำทุก query เสมอ',
  })
  scoped_companies!: RefCompanyDto[];

  @ApiProperty({
    example: ['ticket.read', 'ticket.create', 'ticket.assign'],
    type: [String],
    description:
      'ใช้ซ่อน/แสดงเมนูเท่านั้น — สิทธิ์ระดับ ticket ให้ดูที่บล็อก can ของแต่ละใบ (FE-02)',
  })
  permissions!: string[];
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'รหัสผ่านปัจจุบัน' })
  @IsString()
  current_password!: string;

  @ApiProperty({
    minLength: 12,
    description:
      'นโยบาย 3.2 บังคับ ≥ 12 ตัวอักษร มีพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และอักขระพิเศษ ' +
      'และห้ามซ้ำกับ 3 รหัสผ่านล่าสุด',
  })
  @IsString()
  @MinLength(12)
  @Matches(/[A-Z]/, { message: 'ต้องมีตัวพิมพ์ใหญ่อย่างน้อยหนึ่งตัว' })
  @Matches(/[a-z]/, { message: 'ต้องมีตัวพิมพ์เล็กอย่างน้อยหนึ่งตัว' })
  @Matches(/\d/, { message: 'ต้องมีตัวเลขอย่างน้อยหนึ่งตัว' })
  @Matches(/[^A-Za-z0-9]/, { message: 'ต้องมีอักขระพิเศษอย่างน้อยหนึ่งตัว' })
  new_password!: string;
}

export class LoginResponseDto {
  @ApiProperty({
    example: false,
    description: 'true = ต้องเปลี่ยนรหัสผ่านก่อนใช้งานฟังก์ชันอื่น (US-18 AC-1)',
  })
  must_change_password!: boolean;

  @ApiProperty({ type: CurrentUserDto })
  user!: CurrentUserDto;
}

export class MeResponseDto extends CurrentUserDto {
  @ApiProperty({
    example: false,
    description: 'มีใน /auth/me ด้วย เพื่อให้ frontend รู้แม้ผู้ใช้รีเฟรชหน้า (FE-03)',
  })
  must_change_password!: boolean;
}

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok', 'degraded', 'down'], example: 'ok' }) status!: string;
  @ApiProperty({ example: '0.1.0' }) version!: string;
  @ApiProperty({ example: 'ok' }) db!: string;
  @ApiProperty({ example: 'ok' }) redis!: string;
  @ApiPropertyOptional({ example: 62.4 }) disk_data_free_percent?: number;
  @ApiPropertyOptional({
    example: '2026-08-31T10:35:00+07:00',
    description: 'เกิน 15 นาที = degraded (งาน scan_sla ไม่ได้รัน)',
  })
  last_sla_scan_at?: string | null;
}
