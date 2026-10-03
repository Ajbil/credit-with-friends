import { Prisma } from '@prisma/client';

export async function lockCircleMembershipRows(tx: Prisma.TransactionClient, memberId: string, circleId?: string): Promise<boolean> {
  const memberRows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Member" WHERE "id" = ${memberId}::uuid FOR UPDATE`;
  if (!memberRows.length) return false;
  if (circleId) {
    const circleRows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Circle" WHERE "id" = ${circleId}::uuid AND "deletedAtUtc" IS NULL FOR UPDATE`;
    return circleRows.length > 0;
  }
  return true;
}
