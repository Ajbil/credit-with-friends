import { Prisma } from '@prisma/client';

export async function memberCards(memberId: string, tx: Prisma.TransactionClient) {
  const cards = await tx.card.findMany({
    where: { memberId },
    select: { id: true, bankId: true, type: true, variant: true, bank: { select: { displayName: true } } },
    orderBy: [{ createdAtUtc: 'asc' }, { id: 'asc' }],
  });
  return cards.map(({ id, bankId, type, variant, bank }) => ({ id, bankId, bankName: bank.displayName, type, variant }));
}
