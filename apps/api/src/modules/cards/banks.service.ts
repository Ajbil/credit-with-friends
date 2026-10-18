import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { BanksDataDto, BanksQuery } from './banks.dto';

export async function listBanks(db: PrismaService, { page, limit }: BanksQuery, contactEmail: string): Promise<BanksDataDto> {
  const offset = (page - 1) * limit;
  if (offset > 2_147_483_647) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field: 'page', reason: 'Choose a smaller page number.' }] } });
  }
  const banks = await db.bank.findMany({ select: { id: true, displayName: true, sortName: true } });
  banks.sort((a, b) => a.sortName.localeCompare(b.sortName, 'en') || a.id.localeCompare(b.id, 'en'));
  return {
    items: banks.slice(offset, offset + limit),
    pagination: { page, limit, totalItems: banks.length, totalPages: Math.ceil(banks.length / limit) },
    contactEmail,
  };
}
