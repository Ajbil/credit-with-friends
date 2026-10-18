import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';

export type BanksQuery = { page: number; limit: number };

export function parseBanksQuery(query: Record<string, unknown>): BanksQuery {
  const fieldErrors = Object.keys(query).filter((field) => field !== 'page' && field !== 'limit').map((field) => ({ field, reason: 'Unknown field.' }));
  const parse = (field: 'page' | 'limit', fallback: number, maximum?: number) => {
    const value = query[field];
    if (value === undefined) return fallback;
    const number = typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(number) || (maximum !== undefined && number > maximum)) {
      fieldErrors.push({ field, reason: maximum === undefined ? 'Use a positive whole number.' : 'Use a whole number from 1 to 100.' });
    }
    return number;
  };
  const page = parse('page', 1);
  const limit = parse('limit', 20, 100);
  if (fieldErrors.length) throw new BadRequestException({ code: 'VALIDATION_ERROR', details: { fieldErrors } });
  return { page, limit };
}

export class BankDto {
  @ApiProperty({ type: String, example: 'hdfc-bank', description: 'Stable bank identifier.' }) id!: string;
  @ApiProperty({ type: String, example: 'HDFC Bank', description: 'Current name shown to members.' }) displayName!: string;
  @ApiProperty({ type: String, example: 'HDFC Bank', description: 'Name used to sort the list, ignoring a leading The.' }) sortName!: string;
}

export class BanksPaginationDto {
  @ApiProperty({ type: Number, example: 1 }) page!: number;
  @ApiProperty({ type: Number, example: 20 }) limit!: number;
  @ApiProperty({ type: Number, example: 57 }) totalItems!: number;
  @ApiProperty({ type: Number, example: 3 }) totalPages!: number;
}

export class BanksDataDto {
  @ApiProperty({ type: [BankDto] }) items!: BankDto[];
  @ApiProperty({ type: BanksPaginationDto }) pagination!: BanksPaginationDto;
  @ApiProperty({ type: String, example: 'help@creditwithfriends.in', description: 'Email address for requesting a missing bank.' }) contactEmail!: string;
}

export class BanksResponseDto {
  @ApiProperty({ type: Boolean, example: true }) success!: true;
  @ApiProperty({ type: BanksDataDto }) data!: BanksDataDto;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) error!: null;
}
