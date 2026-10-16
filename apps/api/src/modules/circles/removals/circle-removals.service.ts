import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { lockCircleMembershipRows } from '../core/circle-lock.helper';

async function requireAdmin(tx: Prisma.TransactionClient, circleId: string, adminId: string): Promise<void> {
  if (!await lockCircleMembershipRows(tx, [], circleId)) throw new NotFoundException();
  const admin = await tx.circleMembership.findUnique({ where: { circleId_memberId: { circleId, memberId: adminId } }, select: { id: true } });
  if (!admin) throw new NotFoundException();
  const circle = await tx.circle.findUniqueOrThrow({ where: { id: circleId }, select: { adminMemberId: true } });
  if (circle.adminMemberId !== adminId) throw new ForbiddenException();
}

export function removeCircleMember(db: PrismaService, circleId: string, adminId: string, targetId: string): Promise<void> {
  return db.$transaction(async (tx) => {
    await requireAdmin(tx, circleId, adminId);
    if (targetId === adminId) throw new ForbiddenException({ code: 'ADMIN_CANNOT_REMOVE_SELF' });
    const membership = await tx.circleMembership.findUnique({ where: { circleId_memberId: { circleId, memberId: targetId } }, select: { id: true } });
    if (!membership) throw new NotFoundException();
    await tx.circleMembership.delete({ where: { id: membership.id } });
    await tx.circleRemovalBlock.create({ data: { circleId, memberId: targetId } });
  });
}

export function clearCircleRemovals(db: PrismaService, circleId: string, adminId: string): Promise<void> {
  return db.$transaction(async (tx) => {
    await requireAdmin(tx, circleId, adminId);
    await tx.circleRemovalBlock.deleteMany({ where: { circleId } });
  });
}
