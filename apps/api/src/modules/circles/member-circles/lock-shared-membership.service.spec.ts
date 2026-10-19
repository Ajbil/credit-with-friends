import { Prisma } from '@prisma/client';
import { describe, expect, test, vi } from 'vitest';
import { lockSharedMembership } from './lock-shared-membership.service';

describe('shared membership decision', () => {
  test('requires the live circle and both memberships, including one row for a self-view', async () => {
    const query = vi.fn();
    const tx = { $queryRaw: query } as unknown as Prisma.TransactionClient;
    query.mockResolvedValueOnce([]);
    await expect(lockSharedMembership('circle', 'viewer', 'holder', tx)).resolves.toBe(false);
    expect(query).toHaveBeenCalledTimes(1);

    query.mockClear().mockResolvedValueOnce([{ id: 'circle' }]).mockResolvedValueOnce([{ memberId: 'viewer' }]);
    await expect(lockSharedMembership('circle', 'viewer', 'holder', tx)).resolves.toBe(false);

    query.mockClear().mockResolvedValueOnce([{ id: 'circle' }]).mockResolvedValueOnce([{ memberId: 'viewer' }, { memberId: 'holder' }]);
    await expect(lockSharedMembership('circle', 'viewer', 'holder', tx)).resolves.toBe(true);

    query.mockClear().mockResolvedValueOnce([{ id: 'circle' }]).mockResolvedValueOnce([{ memberId: 'viewer' }]);
    await expect(lockSharedMembership('circle', 'viewer', 'viewer', tx)).resolves.toBe(true);
  });
});
