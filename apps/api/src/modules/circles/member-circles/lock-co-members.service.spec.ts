import { Prisma } from '@prisma/client';
import { describe, expect, test, vi } from 'vitest';
import { lockCoMembers } from './lock-co-members.service';

describe('co-members in live circles', () => {
  test('lists each other member once with every shared circle', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([
        { id: 'circle-b', name: 'Zebra' },
        { id: 'circle-a', name: 'Alpha' },
      ])
      .mockResolvedValueOnce([
        { id: 'membership-1', circleId: 'circle-b', memberId: 'searcher' },
        { id: 'membership-2', circleId: 'circle-b', memberId: 'shared' },
        { id: 'membership-3', circleId: 'circle-a', memberId: 'searcher' },
        { id: 'membership-4', circleId: 'circle-a', memberId: 'shared' },
        { id: 'membership-5', circleId: 'circle-a', memberId: 'other' },
      ])
      .mockResolvedValueOnce([{ circleId: 'circle-b' }, { circleId: 'circle-a' }]);
    const tx = { $queryRaw: query } as unknown as Prisma.TransactionClient;

    await expect(lockCoMembers('searcher', tx)).resolves.toEqual({
      circleIds: ['circle-b', 'circle-a'],
      coMembers: [
        { memberId: 'shared', circles: [{ id: 'circle-a', name: 'Alpha' }, { id: 'circle-b', name: 'Zebra' }] },
        { memberId: 'other', circles: [{ id: 'circle-a', name: 'Alpha' }] },
      ],
    });
    expect(query).toHaveBeenCalledTimes(3);
  });
});
