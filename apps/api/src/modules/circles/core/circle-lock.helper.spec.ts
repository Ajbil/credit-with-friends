import type { Prisma } from '@prisma/client';
import { describe, expect, test, vi } from 'vitest';
import { lockCircleMembershipRows } from './circle-lock.helper';

describe('circle membership locks', () => {
  test('locks the circle before member rows in ascending ID order, and creation locks only its member', async () => {
    const calls: string[] = [];
    const tx = { $queryRaw: vi.fn(async (parts: TemplateStringsArray, id: string) => {
      calls.push(`${parts[0].includes('"Circle"') ? 'circle' : 'member'}:${id}`);
      return [{ id }];
    }) } as unknown as Prisma.TransactionClient;

    expect(await lockCircleMembershipRows(tx, ['member-z', 'member-a'], 'circle-one')).toBe(true);
    expect(calls).toEqual(['circle:circle-one', 'member:member-a', 'member:member-z']);
    calls.length = 0;
    expect(await lockCircleMembershipRows(tx, ['creator'])).toBe(true);
    expect(calls).toEqual(['member:creator']);
  });
});
