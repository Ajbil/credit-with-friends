import { ApiProperty } from '@nestjs/swagger';

export class MemberDataDto {
  @ApiProperty({ type: String, example: '01960463-1700-7000-8000-000000000001' }) id!: string;
  @ApiProperty({ type: String, example: 'Arihant' }) displayName!: string;
  @ApiProperty({ type: String, example: '+919876543210' }) whatsappE164!: string;
  @ApiProperty({ type: String, example: 'owner@example.in' }) googleEmail!: string;
  @ApiProperty({ type: String, example: '112233445566778899' }) googleAccountId!: string;
}

export class MemberResponseDto {
  @ApiProperty({ type: Boolean, example: true }) success!: true;
  @ApiProperty({ type: MemberDataDto }) data!: MemberDataDto;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) error!: null;
}

export class PendingDataDto {
  @ApiProperty({ type: String, example: 'Arihant' }) name!: string;
  @ApiProperty({ type: String, example: 'owner@example.in' }) email!: string;
  @ApiProperty({ type: String, example: '/circles/join/example' }) returnPath!: string;
}

export class PendingResponseDto {
  @ApiProperty({ type: Boolean, example: true }) success!: true;
  @ApiProperty({ type: PendingDataDto }) data!: PendingDataDto;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) error!: null;
}

export class NoticeDataDto {
  @ApiProperty({ type: Number, example: 1 }) version!: number;
  @ApiProperty({ type: String, example: 'Privacy notice text' }) text!: string;
}

export class NoticeResponseDto {
  @ApiProperty({ type: Boolean, example: true }) success!: true;
  @ApiProperty({ type: NoticeDataDto }) data!: NoticeDataDto;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) error!: null;
}

export class ActionDataDto {
  @ApiProperty({ type: Boolean, example: true }) removed!: boolean;
}

export class ActionResponseDto {
  @ApiProperty({ type: Boolean, example: true }) success!: true;
  @ApiProperty({ type: ActionDataDto }) data!: ActionDataDto;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) error!: null;
}
