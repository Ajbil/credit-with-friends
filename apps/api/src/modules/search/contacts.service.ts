import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../common/database/prisma.service';
import { ServiceBus } from '../../service-bus/service-bus.service';
import { USAGE_EVENT_NAMES, type CardHolderContactedEvent } from '../usage/usage-events';

const INITIALISM_VOWEL_SOUNDS = new Set(['A', 'E', 'F', 'H', 'I', 'L', 'M', 'N', 'O', 'R', 'S', 'X']);

export function articleForBank(bankName: string): 'a' | 'an' {
  const firstWord = bankName.trim().split(/\s+/)[0] ?? '';
  if (/^[AEIOU]/i.test(firstWord)) return 'an';
  if (/^[A-Z]+$/.test(firstWord) && INITIALISM_VOWEL_SOUNDS.has(firstWord[0])) return 'an';
  return 'a';
}

export async function contactCard(db: PrismaService, bus: ServiceBus, logger: PinoLogger, memberId: string, cardId: string) {
  const result = await db.$transaction(async (tx) => {
    const holder = await bus.request('cards.cardHolder', { cardId, tx });
    if (!holder || holder.memberId === memberId) throw new NotFoundException({ code: 'CARD_UNAVAILABLE' });
    const { circleIds } = await bus.request('circles.lockSharedCircles', { memberId, otherMemberId: holder.memberId, tx });
    if (circleIds.length === 0) throw new NotFoundException({ code: 'CARD_UNAVAILABLE' });
    const card = await bus.request('cards.lockCard', { cardId, tx });
    if (!card || card.memberId !== holder.memberId) throw new NotFoundException({ code: 'CARD_UNAVAILABLE' });
    const details = await bus.request('accounts.contactDetails', holder.memberId);
    if (!details) throw new NotFoundException({ code: 'CARD_UNAVAILABLE' });
    const cardDescription = `${articleForBank(card.bankName)} ${card.bankName} ${card.type} card${card.variant ? `, ${card.variant}` : ''}`;
    const message = `Hi ${details.displayName}, I saw on CreditWithFriends (creditwithfriends.in) that you have ${cardDescription}. Do you have a moment? I need it for an offer.`;
    return { whatsappUrl: `https://wa.me/${details.whatsappE164.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, holderMemberId: holder.memberId, circleIds };
  });
  const eventId = randomUUID();
  const event: CardHolderContactedEvent = {
    id: eventId, version: 1, timestampUtc: new Date(), initiatedByAccountId: memberId,
    data: { holderMemberId: result.holderMemberId, circleIds: [...new Set(result.circleIds)] },
  };
  void bus.publish(USAGE_EVENT_NAMES.whatsappTap, event).catch(() => logger.warn({ context: { eventName: USAGE_EVENT_NAMES.whatsappTap, eventId, outcome: 'failed' } }, 'Usage event dispatch failed'));
  return { whatsappUrl: result.whatsappUrl };
}
