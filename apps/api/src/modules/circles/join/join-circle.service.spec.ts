import type { PrismaService } from '../../../common/database/prisma.service';
import type { ServiceBus } from '../../../service-bus/service-bus.service';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, test, vi } from 'vitest';
import { joinCircle, previewInvite } from './join-circle.service';

const code = 'ZJUnCsFn69xUJxhBPxJg6A';
const circleId = '01960463-1700-7000-8000-000000000001';
const memberId = '01960463-1700-7000-8000-000000000002';
const circle = { id: circleId, name: 'College batch', inviteCode: code, deletedAtUtc: null };

function setup() {
  const findFirst = vi.fn(async () => circle);
  const findUnique = vi.fn(async () => null as { id: string } | null);
  const count = vi.fn(async () => 1);
  const create = vi.fn(async () => ({ id: 'membership' }));
  const queryRaw = vi.fn(async (_parts: TemplateStringsArray, id: string) => [{ id }]);
  const currentCircle = vi.fn(async () => circle);
  const findMember = vi.fn(async () => ({ id: memberId } as { id: string } | null));
  const tx = { $queryRaw: queryRaw, circle: { findUnique: currentCircle }, member: { findUnique: findMember }, circleMembership: { findUnique, count, create } };
  const db = {
    circle: { findFirst }, circleMembership: { findUnique, count },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  } as unknown as PrismaService;
  const request = vi.fn(async () => ({ id: memberId, googleAccountId: 'google' }) as { id: string; googleAccountId: string } | null);
  const publish = vi.fn(async () => {});
  const bus = { request, publish } as unknown as ServiceBus;
  const logger = { warn: vi.fn() } as unknown as PinoLogger;
  return { db, bus, logger, findFirst, findUnique, count, create, queryRaw, currentCircle, findMember, request, publish };
}

describe('circle invite preview', () => {
  test('rejects malformed and unknown links before checking a session', async () => {
    const { db, findFirst, findUnique } = setup();
    await expect(previewInvite(db, 'bad!', memberId)).rejects.toMatchObject({ status: 404, response: { code: 'INVITE_LINK_INVALID' } });
    expect(findFirst).not.toHaveBeenCalled();
    findFirst.mockResolvedValueOnce(null as never);
    await expect(previewInvite(db, code, memberId)).rejects.toMatchObject({ status: 404, response: { code: 'INVITE_LINK_INVALID' } });
    expect(findUnique).not.toHaveBeenCalled();
  });

  test('a valid link requires an account before revealing its name', async () => {
    const { db, findUnique } = setup();
    await expect(previewInvite(db, code)).resolves.toEqual({ status: 'account_required' });
    expect(findUnique).not.toHaveBeenCalled();
  });

  test('an existing member goes straight to the circle', async () => {
    const { db, findUnique, count } = setup();
    findUnique.mockResolvedValueOnce({ id: 'membership' });
    await expect(previewInvite(db, code, memberId)).resolves.toEqual({ status: 'already_member', circleId });
    expect(count).not.toHaveBeenCalled();
  });

  test('a newcomer sees only the circle name and member count', async () => {
    const { db, findFirst } = setup();
    findFirst.mockResolvedValueOnce({ ...circle, memberNames: ['Private name'], whatsappE164: '+919876543210' } as typeof circle);
    await expect(previewInvite(db, code, memberId)).resolves.toEqual({ status: 'preview', name: 'College batch', memberCount: 1 });
  });
});

describe('circle join refusals', () => {
  test('a pending account cannot join', async () => {
    const { db, bus, logger, create } = setup();
    await expect(joinCircle(db, bus, logger, code, null)).rejects.toMatchObject({ status: 403, response: { code: 'ACCOUNT_INCOMPLETE' } });
    expect(create).not.toHaveBeenCalled();
  });

  test('an account that disappears after the first check cannot join', async () => {
    const { db, bus, logger, findMember, queryRaw, create } = setup();
    findMember.mockResolvedValueOnce(null);
    await expect(joinCircle(db, bus, logger, code, memberId)).rejects.toMatchObject({ status: 403, response: { code: 'ACCOUNT_INCOMPLETE' } });
    expect(queryRaw).toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  test('a reset link is refused under the lock', async () => {
    const { db, bus, logger, currentCircle, create } = setup();
    currentCircle.mockResolvedValueOnce({ ...circle, inviteCode: 'A'.repeat(22) });
    await expect(joinCircle(db, bus, logger, code, memberId)).rejects.toMatchObject({ status: 404, response: { code: 'INVITE_LINK_INVALID' } });
    expect(create).not.toHaveBeenCalled();
  });

  test.each([
    { circleCount: 100, memberCount: 1, code: 'CIRCLE_FULL' },
    { circleCount: 1, memberCount: 20, code: 'TOO_MANY_CIRCLES' },
  ])('refuses $code before creating a membership', async ({ circleCount, memberCount, code: errorCode }) => {
    const { db, bus, logger, count, create } = setup();
    count.mockResolvedValueOnce(circleCount).mockResolvedValueOnce(memberCount);
    await expect(joinCircle(db, bus, logger, code, memberId)).rejects.toMatchObject({ status: 409, response: { code: errorCode } });
    expect(create).not.toHaveBeenCalled();
  });

  test('a failed event dispatch logs the same join recording warning without undoing membership', async () => {
    const { db, bus, logger, publish, create } = setup();
    publish.mockRejectedValueOnce(new Error('recorder unavailable'));
    await expect(joinCircle(db, bus, logger, code, memberId)).resolves.toEqual({ circleId });
    expect(create).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ eventName: 'CircleJoinedEvent', outcome: 'failed' }) }),
      'Usage event recording failed',
    ));
  });
});
