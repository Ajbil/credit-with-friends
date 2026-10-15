import { ApiProperty } from '@nestjs/swagger';

export class LeaveCircleResponseDto {
  @ApiProperty({ type: Boolean, example: true }) success!: true;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) data!: null;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) error!: null;
}
