import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InvitePreviewDataDto {
  @ApiProperty({ type: String, enum: ['account_required', 'preview', 'already_member'], example: 'preview' }) status!: 'account_required' | 'preview' | 'already_member';
  @ApiPropertyOptional({ type: String, example: '01960463-1700-7000-8000-000000000001', description: 'Returned for an existing member.' }) circleId?: string;
  @ApiPropertyOptional({ type: String, example: 'College batch', description: 'Shown to eligible non-members with a valid link.' }) name?: string;
  @ApiPropertyOptional({ type: Number, example: 8, description: 'Shown to eligible non-members with a valid link.' }) memberCount?: number;
}

export class InvitePreviewResponseDto {
  @ApiProperty({ type: Boolean, example: true }) success!: true;
  @ApiProperty({ type: InvitePreviewDataDto }) data!: InvitePreviewDataDto;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) error!: null;
}

export class JoinCircleDataDto {
  @ApiProperty({ type: String, example: '01960463-1700-7000-8000-000000000001' }) circleId!: string;
}

export class JoinCircleResponseDto {
  @ApiProperty({ type: Boolean, example: true }) success!: true;
  @ApiProperty({ type: JoinCircleDataDto }) data!: JoinCircleDataDto;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) error!: null;
}
