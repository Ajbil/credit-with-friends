import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../common/database/prisma.service';
import { ServiceBus } from '../../service-bus/service-bus.service';
import { applyCardRules } from './card-rules.helper';
import { AddCardDto, MyCardDto, MyCardsDataDto } from './my-cards.dto';

const cardSelect = { id: true, bankId: true, type: true, variant: true, bank: { select: { displayName: true } } } as const;

function cardDto(card: { id: string; bankId: string; type: string; variant: string | null; bank: { displayName: string } }): MyCardDto {
  return { id: card.id, bankId: card.bankId, bankName: card.bank.displayName, type: card.type, variant: card.variant };
}

export async function listMyCards(db: PrismaService, memberId: string): Promise<MyCardsDataDto> {
  const cards = await db.card.findMany({ where: { memberId }, select: cardSelect, orderBy: [{ createdAtUtc: 'asc' }, { id: 'asc' }] });
  return { items: cards.map(cardDto), pagination: { page: 1, limit: 20, totalItems: cards.length, totalPages: Math.ceil(cards.length / 20) } };
}

export async function addMyCard(db: PrismaService, bus: ServiceBus, logger: PinoLogger, memberId: string, input: AddCardDto): Promise<MyCardDto> {
  let result: { card: MyCardDto; circleIds: string[] };
  try {
    result = await db.$transaction(async (tx) => {
      const { circleIds } = await bus.request('circles.lockMemberCircles', { memberId, tx });
      const [banks, cards] = await Promise.all([
        tx.bank.findMany({ select: { id: true } }),
        tx.card.findMany({ where: { memberId }, select: { id: true, bankId: true, type: true, variantKey: true } }),
      ]);
      const data = applyCardRules(input, new Set(banks.map(({ id }) => id)), cards);
      const card = await tx.card.create({ data: { ...data, memberId }, select: cardSelect });
      return { card: cardDto(card), circleIds };
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      throw new ConflictException({ code: 'CARD_DUPLICATE' });
    }
    throw error;
  }
  const eventId = randomUUID();
  void bus.publish('CardListedEvent', {
    id: eventId, version: 1, timestampUtc: new Date(), initiatedByAccountId: memberId, data: { circleIds: result.circleIds },
  }).catch(() => logger.warn({ context: { eventName: 'CardListedEvent', eventId, outcome: 'failed' } }, 'Usage event dispatch failed'));
  return result.card;
}
