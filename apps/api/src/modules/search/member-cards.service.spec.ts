import { NotFoundException } from '@nestjs/common';
import { describe, expect, test, vi } from 'vitest';
import { PrismaService } from '../../common/database/prisma.service';
import { ServiceBus } from '../../service-bus/service-bus.service';
import { viewMemberCards } from './member-cards.service';

describe('member card read transaction', () => {
  test('passes one transaction to the membership check and card request', async () => {
    const tx = { tag: 'same transaction' };
    const db = { $transaction: (run: (client: typeof tx) => Promise<unknown>) => run(tx) } as unknown as PrismaService;
    const request = vi.fn(async (name: string, input: { tx: unknown }) => {
      expect(input.tx).toBe(tx);
      return name === 'circles.lockSharedMembership' ? { shared: true, memberName: 'Holder' } : [{ id: 'card' }];
    });
    const bus = { request } as unknown as ServiceBus;
    await expect(viewMemberCards(db, bus, 'circle', 'viewer', 'holder')).resolves.toEqual({ memberId: 'holder', displayName: 'Holder', cards: [{ id: 'card' }] });
    expect(request.mock.calls.map(([name]) => name)).toEqual(['circles.lockSharedMembership', 'cards.memberCards']);
  });

  test('does not request cards when shared membership is unavailable', async () => {
    const db = { $transaction: (run: (client: object) => Promise<unknown>) => run({}) } as unknown as PrismaService;
    const request = vi.fn(async () => ({ shared: false }));
    const bus = { request } as unknown as ServiceBus;
    await expect(viewMemberCards(db, bus, 'circle', 'viewer', 'holder')).rejects.toBeInstanceOf(NotFoundException);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
