import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { BusEvent, ServiceBus } from './service-bus.service';

describe('service bus', () => {
  test('dispatches a registered request and event, and fails clearly for an unknown request', async () => {
    const bus = new ServiceBus();
    const event = { id: randomUUID(), version: 1, timestampUtc: new Date(), initiatedByAccountId: randomUUID(), data: { circleId: randomUUID() } };
    const received: BusEvent[] = [];

    bus.registerRequest('accounts.circleCreator', async (memberId) => ({ id: memberId, googleAccountId: 'google-owner' }));
    bus.registerEvent('CircleCreatedEvent', async (message) => { received.push(message); });

    await expect(bus.request('accounts.circleCreator', 'member-one')).resolves.toEqual({ id: 'member-one', googleAccountId: 'google-owner' });
    await bus.publish('CircleCreatedEvent', event);
    expect(received).toEqual([event]);
    await expect(bus.request('unknown', 'member-one')).rejects.toThrow('No service-bus request handler registered for unknown');
  });

  test('dispatches the completed-member display-name answer', async () => {
    const bus = new ServiceBus();
    bus.registerRequest('accounts.displayNames', async (ids) => ids.map((id) => ({ id, displayName: `Name ${id}` })));
    await expect(bus.request('accounts.displayNames', ['member-one'])).resolves.toEqual([{ id: 'member-one', displayName: 'Name member-one' }]);
  });
});
