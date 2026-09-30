import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt } from 'class-validator';

export class AcceptNoticeDto {
  @ApiProperty({ type: Number, example: 1 })
  @IsInt()
  version!: number;

  @ApiProperty({ type: Boolean, example: true })
  @IsBoolean()
  isConsentGiven!: boolean;
}
