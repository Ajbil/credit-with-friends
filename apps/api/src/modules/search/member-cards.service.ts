import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { ServiceBus } from '../../service-bus/service-bus.service';

export function viewMemberCards(db: PrismaService, bus: ServiceBus, circleId: string, viewerId: string, memberId: string) {
  return db.$transaction(async (tx) => {
    const membership = await bus.request('circles.lockSharedMembership', { circleId, viewerId, memberId, tx });
    if (!membership.shared || !membership.memberName) throw new NotFoundException();
    const cards = await bus.request('cards.memberCards', { memberId, tx });
    return { memberId, displayName: membership.memberName, cards };
  });
}
