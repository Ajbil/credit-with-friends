import { Prisma } from '@prisma/client';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

export const CIRCLE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function lockCircleMembershipRows(tx: Prisma.TransactionClient, memberIds: readonly string[], circleId?: string): Promise<boolean> {
  if (circleId) {
    const circleRows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Circle" WHERE "id" = ${circleId}::uuid AND "deletedAtUtc" IS NULL FOR UPDATE`;
    if (!circleRows.length) return false;
  }
  for (const memberId of [...new Set(memberIds)].sort()) {
    const memberRows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Member" WHERE "id" = ${memberId}::uuid FOR UPDATE`;
    if (!memberRows.length) return false;
  }
  return true;
}

export async function lockAdminCircle(tx: Prisma.TransactionClient, circleId: string, memberId: string) {
  if (!CIRCLE_ID.test(circleId) || !await lockCircleMembershipRows(tx, [], circleId)) throw new NotFoundException();
  const circle = await tx.circle.findUnique({ where: { id: circleId }, select: { id: true, name: true, inviteCode: true, adminMemberId: true } });
  if (!circle) throw new NotFoundException();
  if (circle.adminMemberId !== memberId) throw new ForbiddenException();
  return circle;
}
