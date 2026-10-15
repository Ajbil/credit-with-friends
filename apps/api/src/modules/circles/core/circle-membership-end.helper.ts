import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CIRCLE_ID, lockCircleMembershipRows } from './circle-lock.helper';

// Call inside a transaction after locking the circle; the caller decides who may delete it.
export async function deleteCircle(tx: Prisma.TransactionClient, circleId: string, actorId: string) {
  await tx.circleMembership.deleteMany({ where: { circleId } });
  await tx.circleRemovalBlock.deleteMany({ where: { circleId } });
  await tx.circle.update({ where: { id: circleId }, data: {
    deletedAtUtc: new Date(), inviteCode: null, adminMemberId: null, modifiedByAccountId: actorId,
  } });
}

export async function endCircleMembership(tx: Prisma.TransactionClient, circleId: string, memberId: string) {
  if (!CIRCLE_ID.test(circleId) || !await lockCircleMembershipRows(tx, [], circleId)) throw new NotFoundException();
  const circle = await tx.circle.findUniqueOrThrow({ where: { id: circleId }, select: { adminMemberId: true } });
  const membership = await tx.circleMembership.findUnique({ where: { circleId_memberId: { circleId, memberId } }, select: { id: true } });
  if (!membership) throw new NotFoundException();
  await tx.circleMembership.delete({ where: { id: membership.id } });
  if (circle.adminMemberId !== memberId) return;
  const successor = await tx.circleMembership.findFirst({ where: { circleId }, orderBy: [{ joinedAtUtc: 'asc' }, { id: 'asc' }], select: { memberId: true } });
  if (successor) {
    await tx.circle.update({ where: { id: circleId }, data: { adminMemberId: successor.memberId, modifiedByAccountId: memberId } });
  } else {
    await deleteCircle(tx, circleId, memberId);
  }
}
