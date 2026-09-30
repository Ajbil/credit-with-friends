import { ApiProperty } from '@nestjs/swagger';

export class AcceptedNoticeDataDto {
  @ApiProperty({ type: Number, example: 1 }) version!: number;
  @ApiProperty({ type: String, format: 'date-time', example: '2026-09-30T12:00:00.000Z' }) acceptedAtUtc!: Date;
}

export class AcceptedNoticeResponseDto {
  @ApiProperty({ type: Boolean, example: true }) success!: true;
  @ApiProperty({ type: AcceptedNoticeDataDto }) data!: AcceptedNoticeDataDto;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) error!: null;
}
