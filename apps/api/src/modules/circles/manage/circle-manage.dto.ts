import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class RenameCircleDto {
  @ApiProperty({ type: String, example: 'College batch', description: 'A circle name, 1 to 40 characters after trimming.' })
  @IsString()
  name!: string;
}

export class HandOverCircleDto {
  @ApiProperty({ type: String, example: '01960463-1700-7000-8000-000000000002', description: 'The ID of a current circle member who will become admin.' })
  @IsUUID()
  memberId!: string;
}

export class RenameCircleDataDto {
  @ApiProperty({ type: String, example: '01960463-1700-7000-8000-000000000001' }) id!: string;
  @ApiProperty({ type: String, example: 'College batch' }) name!: string;
}

export class RenameCircleResponseDto {
  @ApiProperty({ type: Boolean, example: true }) success!: true;
  @ApiProperty({ type: RenameCircleDataDto }) data!: RenameCircleDataDto;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) error!: null;
}

export class ManageCircleResponseDto {
  @ApiProperty({ type: Boolean, example: true }) success!: true;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) data!: null;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) error!: null;
}
