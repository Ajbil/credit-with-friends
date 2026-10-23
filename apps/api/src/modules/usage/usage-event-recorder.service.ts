import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../common/database/prisma.service';
import { BusEvent, ServiceBus } from '../../service-bus/service-bus.service';
import { USAGE_EVENT_NAMES, type CardHolderContactedEvent, type CardSearchedEvent } from './usage-events';

@Injectable()
export class UsageEventRecorder implements OnModuleInit {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ServiceBus) private readonly bus: ServiceBus,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.bus.registerEvent('CircleInviteEvent', (event) => this.record('invite', 'CircleInviteEvent', event));
    this.bus.registerEvent('CircleJoinedEvent', (event) => this.record('join', 'CircleJoinedEvent', event));
    this.bus.registerEvent('CardListedEvent', (event) => this.record('card_listed', 'CardListedEvent', event));
    this.bus.registerEvent(USAGE_EVENT_NAMES.search, (event) => this.record('search', USAGE_EVENT_NAMES.search, event));
    this.bus.registerEvent(USAGE_EVENT_NAMES.whatsappTap, (event) => this.record('whatsapp_tap', USAGE_EVENT_NAMES.whatsappTap, event));
  }

  private async record(type: 'invite' | 'join' | 'card_listed' | 'search' | 'whatsapp_tap', eventName: string, event: BusEvent): Promise<void> {
    const started = Date.now();
    const circleIds = type === 'card_listed' || type === 'search' || type === 'whatsapp_tap'
      ? event.data.circleIds as string[] : [event.data.circleId as string];
    const search = type === 'search' ? event.data as CardSearchedEvent['data'] : null;
    const contact = type === 'whatsapp_tap' ? event.data as CardHolderContactedEvent['data'] : null;
    try {
      await this.db.usageEvent.create({ data: {
        id: event.id, type, memberId: event.initiatedByAccountId, occurredAtUtc: event.timestampUtc,
        ...(search && { bankId: search.bankId, cardType: search.cardType, peopleFound: search.peopleFound }),
        ...(contact && { holderMemberId: contact.holderMemberId }),
        circles: { create: type === 'invite' || type === 'join'
          ? { circleId: circleIds[0] } : circleIds.map((circleId) => ({ circleId })) },
      } });
      this.logger.info({ context: { eventName, eventId: event.id, outcome: 'recorded', durationMs: Date.now() - started } }, 'Usage event recorded');
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        this.logger.info({ context: { eventName, eventId: event.id, outcome: 'duplicate', durationMs: Date.now() - started } }, 'Usage event already recorded');
        return;
      }
      this.logger.warn({ context: { eventName, eventId: event.id, outcome: 'failed', durationMs: Date.now() - started } }, 'Usage event recording failed');
    }
  }
}
