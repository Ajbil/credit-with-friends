import { ApiProperty } from '@nestjs/swagger';

export class MemberCardDto {
  @ApiProperty({ type: String, example: '0199e379-4302-7c2a-a332-9a2e80dabefe' }) id!: string;
  @ApiProperty({ type: String, example: 'hdfc-bank' }) bankId!: string;
  @ApiProperty({ type: String, example: 'HDFC Bank' }) bankName!: string;
  @ApiProperty({ type: String, enum: ['credit', 'debit'], example: 'credit' }) type!: string;
  @ApiProperty({ type: String, nullable: true, example: 'Millennia' }) variant!: string | null;
}

export class MemberCardsDataDto {
  @ApiProperty({ type: String, example: '01960463-1700-7000-8000-000000000002' }) memberId!: string;
  @ApiProperty({ type: String, example: 'A friend' }) displayName!: string;
  @ApiProperty({ type: [MemberCardDto] }) cards!: MemberCardDto[];
}

export class MemberCardsResponseDto {
  @ApiProperty({ type: Boolean, example: true }) success!: true;
  @ApiProperty({ type: MemberCardsDataDto }) data!: MemberCardsDataDto;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) error!: null;
}
