import { Prisma } from '@prisma/client';

export async function lockSharedMembership(
  circleId: string,
  viewerId: string,
  memberId: string,
  tx: Prisma.TransactionClient,
): Promise<boolean> {
  // Circle writers lock this row FOR UPDATE before changing memberships or deletion state.
  const circles = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Circle" WHERE "id" = ${circleId}::uuid AND "deletedAtUtc" IS NULL FOR SHARE`;
  if (!circles.length) return false;
  const memberIds = [...new Set([viewerId, memberId])].sort();
  const memberships = await tx.$queryRaw<Array<{ memberId: string }>>`
    SELECT "memberId" FROM "CircleMembership"
    WHERE "circleId" = ${circleId}::uuid
      AND "memberId" IN (${Prisma.join(memberIds.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY "memberId" FOR SHARE`;
  return memberships.length === memberIds.length;
}
