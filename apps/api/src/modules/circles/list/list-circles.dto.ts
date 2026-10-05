import { ApiProperty } from '@nestjs/swagger';

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
