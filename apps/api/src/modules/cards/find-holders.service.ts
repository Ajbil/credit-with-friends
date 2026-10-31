import { Prisma } from '@prisma/client';
import { validateSearchCardRules } from './card-rules.helper';
import { matchCardVariant } from './variant-match.helper';

export async function findHolders(
  memberIds: string[],
  bankId: unknown,
  type: unknown,
  variant: unknown,
  tx: Prisma.TransactionClient,
) {
  const bank = typeof bankId === 'string' ? await tx.bank.findUnique({ where: { id: bankId }, select: { id: true } }) : null;
  const criteria = validateSearchCardRules({ bankId, type, variant }, new Set(bank ? [bank.id] : []));
  if (memberIds.length === 0) return [];
  const cards = await tx.card.findMany({
    where: { memberId: { in: memberIds }, bankId: criteria.bankId, ...(criteria.type === 'any' ? {} : { type: criteria.type }) },
    select: { id: true, memberId: true, bankId: true, type: true, variant: true, bank: { select: { displayName: true } } },
    orderBy: [{ createdAtUtc: 'asc' }, { id: 'asc' }],
  });
  return cards.flatMap(({ id, memberId, bankId: cardBankId, type: cardType, variant: cardVariant, bank: cardBank }) => {
    const matchKind = matchCardVariant(criteria.variant ?? undefined, cardVariant);
    return matchKind ? [{ memberId, id, bankId: cardBankId, bankName: cardBank.displayName, type: cardType, variant: cardVariant, matchKind }] : [];
  });
}
