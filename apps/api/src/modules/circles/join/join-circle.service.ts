import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../common/database/prisma.service';
import { ServiceBus } from '../../../service-bus/service-bus.service';
import { lockCircleMembershipRows } from '../core/circle-lock.helper';

const INVITE_CODE = /^[A-Za-z0-9_-]{22}$/;
const MAX_MEMBERS = 100;
const MAX_CIRCLES = 20;

function invalidInvite(): never {
  throw new NotFoundException({ code: 'INVITE_LINK_INVALID' });
}

async function activeCircle(db: PrismaService, code: string) {
  if (!INVITE_CODE.test(code)) invalidInvite();
  const circle = await db.circle.findFirst({ where: { inviteCode: code, deletedAtUtc: null }, select: { id: true, name: true } });
  if (!circle) invalidInvite();
  return circle;
}

export async function previewInvite(db: PrismaService, code: string, memberId?: string) {
  const circle = await activeCircle(db, code);
  if (!memberId) return { status: 'account_required' as const };
  const membership = await db.circleMembership.findUnique({ where: { circleId_memberId: { circleId: circle.id, memberId } }, select: { id: true } });
  if (membership) return { status: 'already_member' as const, circleId: circle.id };
  return { status: 'preview' as const, name: circle.name, memberCount: await db.circleMembership.count({ where: { circleId: circle.id } }) };
}

export async function joinCircle(db: PrismaService, bus: ServiceBus, logger: PinoLogger, code: string, memberId: string | null) {
  const circle = await activeCircle(db, code);
  if (!memberId) throw new ForbiddenException({ code: 'ACCOUNT_INCOMPLETE' });
  const member = await bus.request('accounts.circleCreator', memberId);
  if (!member) throw new ForbiddenException({ code: 'ACCOUNT_INCOMPLETE' });
  const joined = await db.$transaction(async (tx) => {
    const locked = await lockCircleMembershipRows(tx, [memberId], circle.id);
    const current = await tx.circle.findUnique({ where: { id: circle.id }, select: { inviteCode: true, deletedAtUtc: true } });
    if (!current || current.deletedAtUtc || current.inviteCode !== code) invalidInvite();
    // A Member row exists only after onboarding; recheck it on this locked transaction.
    if (!locked || !await tx.member.findUnique({ where: { id: memberId }, select: { id: true } })) throw new ForbiddenException({ code: 'ACCOUNT_INCOMPLETE' });
    const existing = await tx.circleMembership.findUnique({ where: { circleId_memberId: { circleId: circle.id, memberId } }, select: { id: true } });
    if (existing) return false;
    if (await tx.circleMembership.count({ where: { circleId: circle.id } }) >= MAX_MEMBERS) {
      throw new ConflictException({ code: 'CIRCLE_FULL' });
    }
    if (await tx.circleMembership.count({ where: { memberId } }) >= MAX_CIRCLES) {
      throw new ConflictException({ code: 'TOO_MANY_CIRCLES' });
    }
    await tx.circleMembership.create({ data: { circleId: circle.id, memberId } });
    return true;
  });
  if (joined) {
    const eventId = randomUUID();
    void bus.publish('CircleJoinedEvent', {
      id: eventId, version: 1, timestampUtc: new Date(), initiatedByAccountId: memberId, data: { circleId: circle.id },
    }).catch(() => logger.warn({ context: { eventName: 'CircleJoinedEvent', eventId, outcome: 'failed' } }, 'Usage event recording failed'));
  }
  return { circleId: circle.id };
}
