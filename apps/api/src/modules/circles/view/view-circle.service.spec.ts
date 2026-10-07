import { describe, expect, test, vi } from 'vitest';
import { PrismaService } from '../../../common/database/prisma.service';
import { ServiceBus } from '../../../service-bus/service-bus.service';
import { viewCircle } from './view-circle.service';

const circleId = '01960463-1700-7000-8000-000000000001';
const adminId = '01960463-1700-7000-8000-000000000002';
const memberId = '01960463-1700-7000-8000-000000000003';
const outsiderId = '01960463-1700-7000-8000-000000000004';

describe('circle view service', () => {
  test('shows member display names and the admin marker without private contact details', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: circleId, name: 'College batch', adminMemberId: adminId,
      memberships: [{ memberId: adminId }, { memberId }],
      inviteCode: 'private-code',
    });
    const request = vi.fn().mockResolvedValue([
      { id: memberId, displayName: 'Circle member', whatsappE164: '+919876543210' },
      { id: adminId, displayName: 'Circle admin', whatsappE164: '+919876543211' },
    ]);

    const result = await viewCircle(
      { circle: { findFirst } } as unknown as PrismaService,
      { request } as unknown as ServiceBus,
      circleId, memberId,
    );

    expect(result).toEqual({ id: circleId, name: 'College batch', members: [
      { id: adminId, displayName: 'Circle admin', isAdmin: true },
      { id: memberId, displayName: 'Circle member', isAdmin: false },
    ] });
    expect(JSON.stringify(result)).not.toContain('whatsapp');
    expect(JSON.stringify(result)).not.toContain('+9198765432');
  });

  test('denies a non-member without requesting any display names or returning circle details', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const request = vi.fn();
    const db = { circle: { findFirst } } as unknown as PrismaService;
    const bus = { request } as unknown as ServiceBus;

    await expect(viewCircle(db, bus, circleId, outsiderId)).rejects.toMatchObject({
      status: 404, response: { code: 'NOT_FOUND', message: 'This circle is unavailable.' },
    });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: circleId, deletedAtUtc: null, memberships: { some: { memberId: outsiderId } } },
    }));
    expect(request).not.toHaveBeenCalled();
  });
});
