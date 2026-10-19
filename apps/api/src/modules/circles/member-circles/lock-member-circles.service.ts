import { Prisma } from '@prisma/client';

export async function lockMemberCircles(memberId: string, tx: Prisma.TransactionClient): Promise<{ circleIds: string[] }> {
  await tx.$queryRaw`SELECT "id" FROM "Member" WHERE "id" = ${memberId}::uuid FOR UPDATE`;
  const memberships = await tx.$queryRaw<Array<{ circleId: string }>>`
    SELECT "circleId" FROM "CircleMembership" WHERE "memberId" = ${memberId}::uuid ORDER BY "circleId" FOR SHARE`;
  return { circleIds: memberships.map(({ circleId }) => circleId) };
}
