import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsString, MaxLength, MinLength } from 'class-validator';

export class OnboardingDto {
  @ApiProperty({ type: String, example: 'Arihant' })
  @IsString() @MinLength(1) @MaxLength(100)
  displayName!: string;

  @ApiProperty({ type: String, example: '+919876543210' })
  @IsString() @MinLength(1) @MaxLength(40)
  whatsappNumber!: string;

  @ApiProperty({ type: Boolean, example: true })
  @IsBoolean()
  isAdultConfirmed!: boolean;

  @ApiProperty({ type: Boolean, example: true })
  @IsBoolean()
  isConsentGiven!: boolean;

  @ApiProperty({ type: Number, example: 1 })
  @IsInt()
  privacyNoticeVersion!: number;
}
