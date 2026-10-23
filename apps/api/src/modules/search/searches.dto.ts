import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';

export class SearchCriteriaDto {
  @Allow() @ApiProperty({ type: String, example: 'hdfc-bank', description: 'Bank id from the bank list.' }) bankId!: unknown;
  @Allow() @ApiProperty({ type: String, enum: ['credit', 'debit', 'any'], example: 'credit' }) type!: unknown;
  @Allow() @ApiPropertyOptional({ type: String, maxLength: 40, example: 'Flipkart' }) variant?: unknown;
}

export type SearchesQueryDto = { page: number; limit: number };

export function parseSearchesQuery(query: Record<string, unknown>): SearchesQueryDto {
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

export class SearchCircleDto {
  @ApiProperty({ type: String, example: '01960463-1700-7000-8000-000000000001' }) id!: string;
  @ApiProperty({ type: String, example: 'College batch' }) name!: string;
}
export class SearchCardDto {
  @ApiProperty({ type: String, example: '0199e379-4302-7c2a-a332-9a2e80dabefe' }) id!: string;
  @ApiProperty({ type: String, example: 'hdfc-bank' }) bankId!: string;
  @ApiProperty({ type: String, example: 'HDFC Bank' }) bankName!: string;
  @ApiProperty({ type: String, enum: ['credit', 'debit'], example: 'credit' }) type!: string;
  @ApiProperty({ type: String, nullable: true, example: 'Regalia Gold' }) variant!: string | null;
}
export class SearchPersonDto {
  @ApiProperty({ type: String, example: '01960463-1700-7000-8000-000000000002' }) memberId!: string;
  @ApiProperty({ type: String, example: 'Meera Shah' }) displayName!: string;
  @ApiProperty({ type: String, enum: ['matching', 'similar', 'unstated', 'all'], example: 'matching' }) group!: string;
  @ApiProperty({ type: [SearchCircleDto] }) circles!: SearchCircleDto[];
  @ApiProperty({ type: [SearchCardDto] }) cards!: SearchCardDto[];
}
export class SearchesPaginationDto {
  @ApiProperty({ type: Number, example: 1 }) page!: number;
  @ApiProperty({ type: Number, example: 20 }) limit!: number;
  @ApiProperty({ type: Number, example: 3 }) totalItems!: number;
  @ApiProperty({ type: Number, example: 1 }) totalPages!: number;
}
export class SearchesDataDto {
  @ApiProperty({ type: [SearchPersonDto] }) items!: SearchPersonDto[];
  @ApiProperty({ type: SearchesPaginationDto }) pagination!: SearchesPaginationDto;
}
export class SearchesResponseDto {
  @ApiProperty({ type: Boolean, example: true }) success!: true;
  @ApiProperty({ type: SearchesDataDto }) data!: SearchesDataDto;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) error!: null;
}
