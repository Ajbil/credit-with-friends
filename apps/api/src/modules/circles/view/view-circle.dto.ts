import { ApiProperty } from '@nestjs/swagger';

export class CircleMemberDto {
  @ApiProperty({ type: String, example: '01960463-1700-7000-8000-000000000002' }) id!: string;
  @ApiProperty({ type: String, example: 'Arihant' }) displayName!: string;
  @ApiProperty({ type: Boolean, example: true }) isAdmin!: boolean;
}

export class ViewCircleDataDto {
  @ApiProperty({ type: String, example: '01960463-1700-7000-8000-000000000001' }) id!: string;
  @ApiProperty({ type: String, example: 'College batch' }) name!: string;
  @ApiProperty({ type: [CircleMemberDto] }) members!: CircleMemberDto[];
}

export class ViewCircleResponseDto {
  @ApiProperty({ type: Boolean, example: true }) success!: true;
  @ApiProperty({ type: ViewCircleDataDto }) data!: ViewCircleDataDto;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) error!: null;
}
