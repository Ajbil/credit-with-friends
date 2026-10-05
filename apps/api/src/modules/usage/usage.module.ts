import { Inject, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../common/database/prisma.service';
import { BusEvent, ServiceBus } from '../../service-bus/service-bus.service';
import { ServiceBusModule } from '../../service-bus/service-bus.module';

@Injectable()
class UsageEventRecorder implements OnModuleInit {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ServiceBus) private readonly bus: ServiceBus,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.bus.registerEvent('CircleInviteEvent', (event) => this.record('invite', event));
    this.bus.registerEvent('CircleJoinedEvent', (event) => this.record('join', event));
  }

  private async record(type: 'invite' | 'join', event: BusEvent): Promise<void> {
    const started = Date.now();
    try {
      await this.db.usageEvent.create({ data: {
        id: event.id, type, memberId: event.initiatedByAccountId, occurredAtUtc: event.timestampUtc,
        circles: { create: { circleId: event.data.circleId as string } },
      } });
      this.logger.info({ context: { eventName: type, eventId: event.id, outcome: 'recorded', durationMs: Date.now() - started } }, 'Usage event recorded');
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') return;
      this.logger.warn({ context: { eventName: type, eventId: event.id, outcome: 'failed', durationMs: Date.now() - started } }, 'Usage event recording failed');
      throw error;
    }
  }
}

@Module({ imports: [ServiceBusModule], providers: [UsageEventRecorder] })
export class UsageModule {}
