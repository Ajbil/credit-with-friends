import { randomUUID } from 'node:crypto';
import type { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../common/database/prisma.service';
import { ServiceBus } from '../../service-bus/service-bus.service';
import { USAGE_EVENT_NAMES, type CardSearchedEvent } from '../usage/usage-events';
import type { SearchesQueryDto } from './searches.dto';

type Criteria = { bankId: unknown; type: unknown; variant?: unknown };
type Card = { id: string; bankId: string; bankName: string; type: string; variant: string | null };
type Group = 'matching' | 'similar' | 'unstated' | 'all';
const priority: Record<Group, number> = { matching: 0, similar: 1, unstated: 2, all: 0 };

export async function searchCards(db: PrismaService, bus: ServiceBus, logger: PinoLogger, memberId: string, criteria: Criteria, query: SearchesQueryDto) {
  const result = await db.$transaction(async (tx) => {
    const { circleIds, coMembers } = await bus.request('circles.lockCoMembers', { memberId, tx });
    const holders = await bus.request('cards.findHolders', { memberIds: coMembers.map(({ memberId: id }) => id), ...criteria, tx });
    const names = await bus.request('accounts.displayNames', coMembers.map(({ memberId: id }) => id));
    const byMember = new Map<string, { memberId: string; displayName: string; group: Group; circles: Array<{ id: string; name: string }>; cards: Card[] }>();
    const circlesByMember = new Map(coMembers.map(({ memberId: id, circles }) => [id, circles]));
    const namesByMember = new Map(names.map(({ id, displayName }) => [id, displayName]));
    for (const { memberId: holderId, matchKind, ...card } of holders) {
      const displayName = namesByMember.get(holderId);
      if (!displayName) continue;
      let item = byMember.get(holderId);
      if (!item) {
        item = { memberId: holderId, displayName, group: matchKind, circles: circlesByMember.get(holderId) ?? [], cards: [] };
        byMember.set(holderId, item);
      }
      if (priority[matchKind] < priority[item.group]) item.group = matchKind;
      item.cards.push(card);
    }
    const all = [...byMember.values()].sort((a, b) =>
      priority[a.group] - priority[b.group] || a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()) || a.memberId.localeCompare(b.memberId));
    const { page, limit } = query;
    return {
      circleIds: [...new Set(circleIds)],
      totalItems: all.length,
      data: { items: all.slice((page - 1) * limit, page * limit), pagination: { page, limit, totalItems: all.length, totalPages: Math.ceil(all.length / limit) } },
    };
  });
  if (query.page === 1) {
    const eventId = randomUUID();
    const event: CardSearchedEvent = {
      id: eventId, version: 1, timestampUtc: new Date(), initiatedByAccountId: memberId,
      data: { circleIds: result.circleIds, bankId: criteria.bankId as string, cardType: criteria.type === 'any' ? 'either' : criteria.type as 'credit' | 'debit', peopleFound: result.totalItems },
    };
    void bus.publish(USAGE_EVENT_NAMES.search, event).catch(() => logger.warn({ context: { eventName: USAGE_EVENT_NAMES.search, eventId, outcome: 'failed' } }, 'Usage event dispatch failed'));
  }
  return result.data;
}
