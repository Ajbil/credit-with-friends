import { Prisma } from '@prisma/client';

export async function cardHolder(cardId: string, tx: Prisma.TransactionClient): Promise<{ memberId: string } | null> {
  return tx.card.findUnique({ where: { id: cardId }, select: { memberId: true } });
}

export async function lockCard(cardId: string, tx: Prisma.TransactionClient): Promise<{ memberId: string; bankName: string; type: string; variant: string | null } | null> {
  const cards = await tx.$queryRaw<Array<{ memberId: string; bankName: string; type: string; variant: string | null }>>`
    SELECT card."memberId", bank."displayName" AS "bankName", card."type", card."variant"
    FROM "Card" card JOIN "Bank" bank ON bank."id" = card."bankId"
    WHERE card."id" = ${cardId}::uuid FOR SHARE OF card`;
  return cards[0] ?? null;
}
