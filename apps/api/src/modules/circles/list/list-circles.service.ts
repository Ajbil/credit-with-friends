import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { ListCirclesDataDto, ListCirclesQueryDto } from './list-circles.dto';

const MAX_PRISMA_OFFSET = 2_147_483_647;

export async function listCircles(db: PrismaService, memberId: string, { page, limit }: ListCirclesQueryDto): Promise<ListCirclesDataDto> {
  const offset = (page - 1) * limit;
  if (offset > MAX_PRISMA_OFFSET) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field: 'page', reason: 'Choose a smaller page number.' }] } });
  }
  const where = { deletedAtUtc: null, memberships: { some: { memberId } } };
  const [circles, totalItems] = await Promise.all([
    db.circle.findMany({
      where,
      select: { id: true, name: true, adminMemberId: true, _count: { select: { memberships: true } } },
      orderBy: [{ createdAtUtc: 'desc' }, { id: 'desc' }],
      skip: offset,
      take: limit,
    }),
    db.circle.count({ where }),
  ]);
  return {
    items: circles.map(({ id, name, adminMemberId, _count }) => ({ id, name, memberCount: _count.memberships, isAdmin: adminMemberId === memberId })),
    pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
  };
}
