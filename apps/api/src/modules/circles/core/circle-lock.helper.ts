import { Prisma } from '@prisma/client';

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
