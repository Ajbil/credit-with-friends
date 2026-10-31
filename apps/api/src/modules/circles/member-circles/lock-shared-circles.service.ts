import { Prisma } from '@prisma/client';

export async function lockSharedCircles(memberId: string, otherMemberId: string, tx: Prisma.TransactionClient): Promise<{ circleIds: string[] }> {
  if (memberId === otherMemberId) return { circleIds: [] };
  // Circle writers lock each circle before changing its membership or deletion state.
  const circles = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT circle."id" FROM "Circle" circle
    JOIN "CircleMembership" mine ON mine."circleId" = circle."id" AND mine."memberId" = ${memberId}::uuid
    JOIN "CircleMembership" theirs ON theirs."circleId" = circle."id" AND theirs."memberId" = ${otherMemberId}::uuid
    WHERE circle."deletedAtUtc" IS NULL
    ORDER BY circle."id" FOR SHARE OF circle`;
  const candidateIds = circles.map(({ id }) => id);
  if (!candidateIds.length) return { circleIds: [] };

  const memberIds = [memberId, otherMemberId].sort();
  await tx.$queryRaw`
    SELECT "id" FROM "CircleMembership"
    WHERE "circleId" IN (${Prisma.join(candidateIds.map((id) => Prisma.sql`${id}::uuid`))})
      AND "memberId" IN (${Prisma.join(memberIds.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY "id" FOR SHARE`;
  // The first join may have seen rows from before a circle lock waited on a writer.
  const current = await tx.$queryRaw<Array<{ circleId: string; memberId: string }>>`
    SELECT membership."circleId", membership."memberId" FROM "CircleMembership" membership
    JOIN "Circle" circle ON circle."id" = membership."circleId"
    WHERE membership."circleId" IN (${Prisma.join(candidateIds.map((id) => Prisma.sql`${id}::uuid`))})
      AND membership."memberId" IN (${Prisma.join(memberIds.map((id) => Prisma.sql`${id}::uuid`))})
      AND circle."deletedAtUtc" IS NULL`;
  const membersByCircle = new Map<string, Set<string>>();
  for (const { circleId, memberId: currentMemberId } of current) {
    const members = membersByCircle.get(circleId) ?? new Set<string>();
    members.add(currentMemberId);
    membersByCircle.set(circleId, members);
  }
  return { circleIds: candidateIds.filter((id) => memberIds.every((member) => membersByCircle.get(id)?.has(member))) };
}
