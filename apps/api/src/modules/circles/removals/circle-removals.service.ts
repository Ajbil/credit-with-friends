import { ForbiddenException, Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { lockCircleMembershipRows } from '../core/circle-lock.helper';

@Injectable()
export class CircleRemovalsService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  remove(circleId: string, adminId: string, targetId: string): Promise<void> {
    return this.db.$transaction(async (tx) => {
      if (!await lockCircleMembershipRows(tx, [], circleId)) throw new NotFoundException();
      const admin = await tx.circleMembership.findUnique({ where: { circleId_memberId: { circleId, memberId: adminId } }, select: { id: true } });
      if (!admin) throw new NotFoundException();
      const circle = await tx.circle.findUniqueOrThrow({ where: { id: circleId }, select: { adminMemberId: true } });
      if (circle.adminMemberId !== adminId) throw new ForbiddenException();
      if (targetId === adminId) throw new ForbiddenException();
      const membership = await tx.circleMembership.findUnique({ where: { circleId_memberId: { circleId, memberId: targetId } }, select: { id: true } });
      if (!membership) throw new NotFoundException();
      await tx.circleMembership.delete({ where: { id: membership.id } });
      await tx.circleRemovalBlock.create({ data: { circleId, memberId: targetId } });
    });
  }

  clear(circleId: string, adminId: string): Promise<void> {
    return this.db.$transaction(async (tx) => {
      if (!await lockCircleMembershipRows(tx, [], circleId)) throw new NotFoundException();
      const admin = await tx.circleMembership.findUnique({ where: { circleId_memberId: { circleId, memberId: adminId } }, select: { id: true } });
      if (!admin) throw new NotFoundException();
      const circle = await tx.circle.findUniqueOrThrow({ where: { id: circleId }, select: { adminMemberId: true } });
      if (circle.adminMemberId !== adminId) throw new ForbiddenException();
      await tx.circleRemovalBlock.deleteMany({ where: { circleId } });
    });
  }
}
