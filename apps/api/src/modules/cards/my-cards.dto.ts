import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import { BanksPaginationDto } from './banks.dto';

export class AddCardDto {
  @Allow()
  @ApiProperty({ type: String, example: 'hdfc-bank', description: 'Stable id of a bank in the list.' }) bankId!: unknown;

  @Allow()
  @ApiProperty({ type: String, enum: ['credit', 'debit'], example: 'credit', description: 'Credit or debit card.' }) type!: unknown;

  @Allow()
  @ApiPropertyOptional({ type: String, maxLength: 40, example: 'Millennia', description: 'Optional card variant, never card details.' }) variant?: unknown;
}

export class MyCardDto {
  @ApiProperty({ type: String, example: '0199e379-4302-7c2a-a332-9a2e80dabefe' }) id!: string;
  @ApiProperty({ type: String, example: 'hdfc-bank' }) bankId!: string;
  @ApiProperty({ type: String, example: 'HDFC Bank' }) bankName!: string;
  @ApiProperty({ type: String, enum: ['credit', 'debit'], example: 'credit' }) type!: string;
  @ApiProperty({ type: String, nullable: true, example: 'Millennia' }) variant!: string | null;
}

export class MyCardsDataDto {
  @ApiProperty({ type: [MyCardDto] }) items!: MyCardDto[];
  @ApiProperty({ type: BanksPaginationDto }) pagination!: BanksPaginationDto;
}

export class MyCardsResponseDto {
  @ApiProperty({ type: Boolean, example: true }) success!: true;
  @ApiProperty({ type: MyCardsDataDto }) data!: MyCardsDataDto;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) error!: null;
}

export class AddCardResponseDto {
  @ApiProperty({ type: Boolean, example: true }) success!: true;
  @ApiProperty({ type: MyCardDto }) data!: MyCardDto;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) error!: null;
}
