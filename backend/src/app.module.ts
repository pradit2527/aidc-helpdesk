import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { CLOCK, SystemClock } from './application/ports/clock.port';
import { TICKET_REPOSITORY } from './application/ports/ticket-repository.port';
import { ChangeTicketStatusUseCase } from './application/use-cases/change-ticket-status.use-case';
import { CreateTicketUseCase } from './application/use-cases/create-ticket.use-case';
import { ReassessTicketPriorityUseCase } from './application/use-cases/reassess-ticket-priority.use-case';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter';
import { EnvelopeInterceptor } from './common/http/envelope.interceptor';
import { RequestContextMiddleware } from './common/http/request-context.middleware';
import { loggerConfig } from './common/logging/logger.config';
import { RedisModule } from './common/redis/redis.module';
import { ScopeService } from './common/scope.service';
import { throttleConfig, UserAwareThrottlerGuard } from './common/throttle/throttle.config';
import { DbModule } from './db/db.module';
import { SlaConfigRepository } from './db/repositories/sla-config.repository';
import { TicketRepository } from './db/repositories/ticket.repository';
import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { HealthController } from './modules/health/health.controller';
import { HealthService } from './modules/health/health.service';
import { TicketsController } from './modules/tickets/tickets.controller';
import { TicketsService } from './modules/tickets/tickets.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot(loggerConfig),
    ThrottlerModule.forRoot(throttleConfig),
    DbModule,
    RedisModule,
  ],
  controllers: [AuthController, HealthController, TicketsController],
  providers: [
    ScopeService,
    AuthService,
    HealthService,
    TicketRepository,
    SlaConfigRepository,
    TicketsService,

    /*
     * ── ชั้น application ────────────────────────────────────────────────
     *
     * use case พึ่ง interface ไม่ใช่ class ที่ต่อ Postgres จริง
     * TypeScript interface หายไปตอนคอมไพล์ จึงต้องผูกด้วย token
     * เวลาเขียนเทสต์ ใส่ตัวปลอมแทนที่ token เดียวกันนี้ได้เลย
     */
    { provide: TICKET_REPOSITORY, useExisting: TicketRepository },
    /*
     * เวลาเป็นสิ่งที่ฉีดเข้าไปได้ ไม่ใช่ new Date() ที่กระจายอยู่ทั่วโค้ด
     * เทสต์ "แจ้ง P3 สองทุ่มวันศุกร์ นาฬิกาเริ่มเดินเมื่อไร" จึงเขียนได้
     * โดยไม่ต้องแช่แข็งเวลาทั้งโปรเซสหรือรอถึงคืนวันศุกร์จริง
     */
    { provide: CLOCK, useClass: SystemClock },
    CreateTicketUseCase,
    ChangeTicketStatusUseCase,
    ReassessTicketPriorityUseCase,

    /*
     * ลงทะเบียนแบบ APP_* แทนการเรียก app.useGlobal*() ที่ main.ts โดยตั้งใจ
     *
     * ตัวที่ลงทะเบียนผ่าน main.ts จะอยู่นอกระบบ DI จึงฉีด dependency เข้าไปไม่ได้
     * EnvelopeInterceptor ต้องใช้ Reflector และ ThrottlerGuard ต้องใช้ storage
     * ทั้งคู่จึงต้องมาทางนี้
     *
     * ลำดับสำคัญ: filter ทำงานนอกสุด ครอบทั้ง guard และ interceptor
     * error ที่ throttler โยนจึงถูกห่อเป็นซองมาตรฐานด้วยเหมือนกัน
     */
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
    { provide: APP_GUARD, useClass: UserAwareThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // ต้องครอบทุกเส้นทางรวม health check เพื่อให้ทุกคำขอมี request id
    // แม้แต่คำขอที่ถูกปฏิเสธตั้งแต่ guard ก็ต้องตามรอยได้
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
