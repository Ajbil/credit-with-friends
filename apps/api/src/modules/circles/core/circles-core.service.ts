import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../common/database/prisma.service';
import { ServiceBus } from '../../../service-bus/service-bus.service';
import { lockCircleMembershipRows } from './circle-lock.helper';

const MAX_CIRCLES_PER_MEMBER = 20;

@Injectable()
export class CirclesCoreService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(ServiceBus) private readonly bus: ServiceBus) {}

  async create(memberId: string, input: { name: string }) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 40) throw new BadRequestException({ code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field: 'name', reason: 'Use 1 to 40 characters.' }] } });
    const creator = await this.bus.circleCreator(memberId);
    if (!creator) throw new UnauthorizedException();
    return this.db.$transaction(async (tx) => {
      if (!await lockCircleMembershipRows(tx, creator.id)) throw new UnauthorizedException();
      if (await tx.circleMembership.count({ where: { memberId: creator.id } }) >= MAX_CIRCLES_PER_MEMBER) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field: 'name', reason: 'You can belong to at most 20 circles.' }] } });
      }
      const circle = await tx.circle.create({ data: {
        name, inviteCode: randomBytes(16).toString('base64url'), adminMemberId: creator.id,
        isOwnerCreated: creator.isOwner, createdByAccountId: creator.id, modifiedByAccountId: creator.id,
        memberships: { create: { memberId: creator.id } },
      }, select: { id: true, name: true } });
      return circle;
    });
  }
}
