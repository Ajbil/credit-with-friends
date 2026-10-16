import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { normalizeCircleName } from '../core/circle-create.rules';
import { lockCircleMembershipRows } from '../core/circle-lock.helper';
import { deleteCircle } from '../core/circle-membership-end.helper';

export function parseRenameName(value: unknown): string {
  const name = typeof value === 'string' ? normalizeCircleName(value) : null;
  if (!name) throw new BadRequestException({ code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field: 'name', reason: 'Use 1 to 40 characters.' }] } });
  return name;
}

async function requireAdmin(tx: Prisma.TransactionClient, circleId: string, actorId: string): Promise<void> {
  if (!await lockCircleMembershipRows(tx, [], circleId)) throw new NotFoundException();
  const membership = await tx.circleMembership.findUnique({ where: { circleId_memberId: { circleId, memberId: actorId } }, select: { id: true } });
  if (!membership) throw new NotFoundException();
  const circle = await tx.circle.findUniqueOrThrow({ where: { id: circleId }, select: { adminMemberId: true } });
  if (circle.adminMemberId !== actorId) throw new ForbiddenException({ code: 'CIRCLE_ADMIN_ONLY' });
}

export function renameCircle(db: PrismaService, circleId: string, actorId: string, name: string): Promise<{ id: string; name: string }> {
  return db.$transaction(async (tx) => {
    await requireAdmin(tx, circleId, actorId);
    return tx.circle.update({ where: { id: circleId }, data: { name, modifiedByAccountId: actorId }, select: { id: true, name: true } });
  });
}

export function handOverCircle(db: PrismaService, circleId: string, actorId: string, nextAdminId: string): Promise<void> {
  return db.$transaction(async (tx) => {
    await requireAdmin(tx, circleId, actorId);
    if (nextAdminId === actorId) throw new ForbiddenException({ code: 'CANNOT_HAND_OVER_TO_SELF' });
    const target = await tx.circleMembership.findUnique({ where: { circleId_memberId: { circleId, memberId: nextAdminId } }, select: { id: true } });
    if (!target) throw new NotFoundException({ code: 'HANDOVER_MEMBER_NOT_FOUND' });
    await tx.circle.update({ where: { id: circleId }, data: { adminMemberId: nextAdminId, modifiedByAccountId: actorId } });
  });
}

export function deleteManagedCircle(db: PrismaService, circleId: string, actorId: string): Promise<void> {
  return db.$transaction(async (tx) => {
    await requireAdmin(tx, circleId, actorId);
    await deleteCircle(tx, circleId, actorId);
  });
}
