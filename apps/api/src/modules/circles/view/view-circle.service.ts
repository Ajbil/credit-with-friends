import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { ServiceBus } from '../../../service-bus/service-bus.service';
import { ViewCircleDataDto } from './view-circle.dto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function viewCircle(db: PrismaService, bus: ServiceBus, circleId: string, memberId: string): Promise<ViewCircleDataDto> {
  if (!UUID.test(circleId)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'This circle is unavailable.' });

  const circle = await db.circle.findFirst({
    where: { id: circleId, deletedAtUtc: null, memberships: { some: { memberId } } },
    select: {
      id: true, name: true, adminMemberId: true,
      memberships: { select: { memberId: true }, orderBy: [{ joinedAtUtc: 'asc' }, { id: 'asc' }] },
    },
  });
  if (!circle) throw new NotFoundException({ code: 'NOT_FOUND', message: 'This circle is unavailable.' });

  const names = await bus.request('accounts.displayNames', circle.memberships.map(({ memberId: id }) => id));
  const nameById = new Map(names.map(({ id, displayName }) => [id, displayName]));
  return {
    id: circle.id,
    name: circle.name,
    members: circle.memberships.map(({ memberId: id }) => {
      const displayName = nameById.get(id);
      if (displayName === undefined) throw new Error('Circle member has no completed account.');
      return { id, displayName, isAdmin: id === circle.adminMemberId };
    }),
  };
}
