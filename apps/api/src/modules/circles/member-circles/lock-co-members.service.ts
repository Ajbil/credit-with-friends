import { Prisma } from '@prisma/client';

type SharedCircle = { id: string; name: string };
type CoMember = { memberId: string; circles: SharedCircle[] };

export async function lockCoMembers(memberId: string, tx: Prisma.TransactionClient): Promise<{ circleIds: string[]; coMembers: CoMember[] }> {
  // Circle writers lock each circle FOR UPDATE before changing its memberships or deletion state.
  const circles = await tx.$queryRaw<SharedCircle[]>`
    SELECT circle."id", circle."name"
    FROM "Circle" circle
    JOIN "CircleMembership" mine ON mine."circleId" = circle."id"
    WHERE mine."memberId" = ${memberId}::uuid AND circle."deletedAtUtc" IS NULL
    ORDER BY circle."id" FOR SHARE OF circle`;
  const circleIds = circles.map(({ id }) => id);
  if (circleIds.length === 0) return { circleIds, coMembers: [] };

  const memberships = await tx.$queryRaw<Array<{ circleId: string; memberId: string }>>`
    SELECT "circleId", "memberId" FROM "CircleMembership"
    WHERE "circleId" IN (${Prisma.join(circleIds.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY "id" FOR SHARE`;
  const circlesById = new Map(circles.map((circle) => [circle.id, circle]));
  const membersById = new Map<string, CoMember>();
  for (const membership of memberships) {
    if (membership.memberId === memberId) continue;
    let coMember = membersById.get(membership.memberId);
    if (!coMember) {
      coMember = { memberId: membership.memberId, circles: [] };
      membersById.set(membership.memberId, coMember);
    }
    const circle = circlesById.get(membership.circleId);
    if (circle) coMember.circles.push(circle);
  }
  for (const coMember of membersById.values()) {
    coMember.circles.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
  }
  return { circleIds, coMembers: [...membersById.values()] };
}
