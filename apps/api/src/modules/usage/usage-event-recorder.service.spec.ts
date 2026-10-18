import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../common/database/prisma.service';
import { ServiceBus } from '../../service-bus/service-bus.service';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, test, vi } from 'vitest';
import { UsageEventRecorder } from './usage-event-recorder.service';

describe('usage event recorder', () => {
  test('records invite and join events with their circles through the bus', async () => {
    const create = vi.fn(async () => ({}));
    const bus = new ServiceBus();
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    new UsageEventRecorder({ usageEvent: { create } } as unknown as PrismaService, bus, logger).onModuleInit();
    const memberId = randomUUID();
    const circleId = randomUUID();
    for (const [eventName, type] of [['CircleInviteEvent', 'invite'], ['CircleJoinedEvent', 'join']] as const) {
      const event = { id: randomUUID(), version: 1, timestampUtc: new Date(), initiatedByAccountId: memberId, data: { circleId } };
      await bus.publish(eventName, event);
      expect(create).toHaveBeenLastCalledWith({ data: { id: event.id, type, memberId, occurredAtUtc: event.timestampUtc, circles: { create: { circleId } } } });
    }
    expect(create).toHaveBeenCalledTimes(2);
  });

  test('logs and swallows a failed write so the publishing action can finish', async () => {
    const bus = new ServiceBus();
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    const create = vi.fn(async () => { throw new Error('database unavailable'); });
    new UsageEventRecorder({ usageEvent: { create } } as unknown as PrismaService, bus, logger).onModuleInit();
    await expect(bus.publish('CircleInviteEvent', { id: randomUUID(), version: 1, timestampUtc: new Date(), initiatedByAccountId: randomUUID(), data: { circleId: randomUUID() } })).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ outcome: 'failed' }) }), 'Usage event recording failed');
  });

  test('records a card-listed event with its complete circle snapshot', async () => {
    const create = vi.fn(async () => ({}));
    const bus = new ServiceBus();
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    new UsageEventRecorder({ usageEvent: { create } } as unknown as PrismaService, bus, logger).onModuleInit();
    const circleIds = [randomUUID(), randomUUID()];
    const event = { id: randomUUID(), version: 1, timestampUtc: new Date(), initiatedByAccountId: randomUUID(), data: { circleIds } };
    await bus.publish('CardListedEvent', event);
    expect(create).toHaveBeenCalledWith({ data: {
      id: event.id, type: 'card_listed', memberId: event.initiatedByAccountId, occurredAtUtc: event.timestampUtc,
      circles: { create: circleIds.map((circleId) => ({ circleId })) },
    } });
  });
});
