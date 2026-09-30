import { ApiProperty } from '@nestjs/swagger';

export class SignOutDataDto {
  @ApiProperty({ type: Boolean, example: true }) signedOut!: boolean;
}

export class SignOutResponseDto {
  @ApiProperty({ type: Boolean, example: true }) success!: true;
  @ApiProperty({ type: SignOutDataDto }) data!: SignOutDataDto;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) error!: null;
}
