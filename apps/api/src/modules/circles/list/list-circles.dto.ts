import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';

export class ListCirclesQueryDto {
  page!: number;
  limit!: number;
}

export function parseListCirclesQuery(query: Record<string, unknown>): ListCirclesQueryDto {
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

export class CircleSummaryDto {
  @ApiProperty({ type: String, example: '01960463-1700-7000-8000-000000000001' }) id!: string;
  @ApiProperty({ type: String, example: 'College batch' }) name!: string;
  @ApiProperty({ type: Number, example: 8 }) memberCount!: number;
  @ApiProperty({ type: Boolean, example: true }) isAdmin!: boolean;
}

export class CirclePaginationDto {
  @ApiProperty({ type: Number, example: 1 }) page!: number;
  @ApiProperty({ type: Number, example: 20 }) limit!: number;
  @ApiProperty({ type: Number, example: 3 }) totalItems!: number;
  @ApiProperty({ type: Number, example: 1 }) totalPages!: number;
}

export class ListCirclesDataDto {
  @ApiProperty({ type: [CircleSummaryDto] }) items!: CircleSummaryDto[];
  @ApiProperty({ type: CirclePaginationDto }) pagination!: CirclePaginationDto;
}

export class ListCirclesResponseDto {
  @ApiProperty({ type: Boolean, example: true }) success!: true;
  @ApiProperty({ type: ListCirclesDataDto }) data!: ListCirclesDataDto;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) error!: null;
}
