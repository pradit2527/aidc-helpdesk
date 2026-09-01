import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthController } from './modules/auth/auth.controller';
import { HealthController } from './modules/health/health.controller';
import { TicketsController } from './modules/tickets/tickets.controller';
import { TicketsService } from './modules/tickets/tickets.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AuthController, HealthController, TicketsController],
  providers: [TicketsService],
})
export class AppModule {}
