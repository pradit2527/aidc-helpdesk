import { Global, Module } from '@nestjs/common';

import { SuperworkService } from './superwork.service';

/**
 * ตัวเชื่อมกับ Super Work
 *
 * ตั้งเป็น Global เพราะเป็นบริการไร้สถานะที่โมดูลอื่นเรียกใช้ฝ่ายเดียว
 * และไม่มีอะไรให้ตั้งค่าต่างกันรายโมดูล การประกาศ import ซ้ำทุกที่
 * มีแต่จะเพิ่มบรรทัดโดยไม่ได้อะไรกลับมา
 */
@Global()
@Module({
  providers: [SuperworkService],
  exports: [SuperworkService],
})
export class SuperworkModule {}
