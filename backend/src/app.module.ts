import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ScopeService } from './common/scope.service';
import { DbModule } from './db/db.module';
import { SlaConfigRepository } from './db/repositories/sla-config.repository';
import { TicketRepository } from './db/repositories/ticket.repository';
import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { HealthController } from './modules/health/health.controller';
import { TicketsController } from './modules/tickets/tickets.controller';
import { TicketsService } from './modules/tickets/tickets.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DbModule],
  controllers: [AuthController, HealthController, TicketsController],
  providers: [
    ScopeService,
    AuthService,
    TicketRepository,
    SlaConfigRepository,
    TicketsService,
  ],
})
export class AppModule {}
