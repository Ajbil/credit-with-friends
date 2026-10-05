import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class RecordInviteDto {
  @ApiProperty({ type: String, enum: ['copy', 'whatsapp'], example: 'copy', description: 'The invite action the admin tapped.' })
  @IsIn(['copy', 'whatsapp']) action!: 'copy' | 'whatsapp';
}

export class CircleInviteDataDto {
  @ApiProperty({ type: String, example: 'https://creditwithfriends.in/circles/join/ZJUnCsFn69xUJxhBPxJg6A' }) url!: string;
}

export class CircleInviteResponseDto {
  @ApiProperty({ type: Boolean, example: true }) success!: true;
  @ApiProperty({ type: CircleInviteDataDto }) data!: CircleInviteDataDto;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) error!: null;
}

export class RecordedInviteDataDto {
  @ApiProperty({ type: Boolean, example: true, description: 'False when recording failed; the copy or share still proceeds.' }) recorded!: boolean;
  @ApiPropertyOptional({ type: String, example: 'https://wa.me/?text=Join%20my%20College%20batch%20circle', description: 'Open this on a WhatsApp share tap.' }) whatsappUrl?: string;
}

export class RecordedInviteResponseDto {
  @ApiProperty({ type: Boolean, example: true }) success!: true;
  @ApiProperty({ type: RecordedInviteDataDto }) data!: RecordedInviteDataDto;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) error!: null;
}
