import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ type: String, example: 'Arihant' })
  @ValidateIf((_, value) => value !== undefined) @IsString() @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ type: String, example: '+919876543210' })
  @ValidateIf((_, value) => value !== undefined) @IsString() @MaxLength(40)
  whatsappNumber?: string;
}
