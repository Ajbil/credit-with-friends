import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateCircleDto {
  @ApiProperty({ type: String, example: 'College batch', description: 'A circle name, 1 to 40 characters after trimming.' })
  @IsString()
  name!: string;
}

export class CircleDataDto {
  @ApiProperty({ type: String, example: '01960463-1700-7000-8000-000000000001' }) id!: string;
  @ApiProperty({ type: String, example: 'College batch' }) name!: string;
}

export class CircleResponseDto {
  @ApiProperty({ type: Boolean, example: true }) success!: true;
  @ApiProperty({ type: CircleDataDto }) data!: CircleDataDto;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) error!: null;
}
