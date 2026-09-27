import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HealthDataDto {
  @ApiProperty({ type: String, example: 'ok', description: 'Indicates that the API process is ready.' })
  status!: 'ok';
}

export class HealthResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  success!: true;

  @ApiProperty({ type: HealthDataDto })
  data!: HealthDataDto;

  @ApiProperty({ type: String, nullable: true, enum: [null], example: null })
  error!: null;
}

export class ApiFieldErrorDto {
  @ApiProperty({ type: String, example: 'email', description: 'Name of the invalid field.' })
  field!: string;

  @ApiProperty({ type: String, example: 'invalid_email', description: 'Stable validation reason.' })
  reason!: string;
}

export class ApiErrorDetailsDto {
  @ApiPropertyOptional({ type: [ApiFieldErrorDto], example: [{ field: 'email', reason: 'invalid_email' }] })
  fieldErrors?: ApiFieldErrorDto[];
}

export class ApiErrorDto {
  @ApiProperty({ type: String, example: '550e8400-e29b-41d4-a716-446655440000' })
  errorId!: string;

  @ApiProperty({ type: String, example: 'NOT_FOUND' })
  code!: string;

  @ApiProperty({ type: String, example: 'HttpError' })
  type!: string;

  @ApiProperty({ type: String, example: 'The requested resource was not found.' })
  message!: string;

  @ApiProperty({ type: String, example: 'We could not find what you requested.' })
  userMessage!: string;

  @ApiProperty({ type: ApiErrorDetailsDto })
  details!: ApiErrorDetailsDto;

  @ApiProperty({ type: Number, example: 404 })
  statusCode!: number;

  @ApiProperty({ type: String, example: '550e8400-e29b-41d4-a716-446655440000' })
  correlationId!: string;

  @ApiProperty({ type: String, nullable: true, example: null })
  requestId!: string | null;

  @ApiProperty({ type: String, example: 'Local' })
  environment!: string;

  @ApiProperty({ type: String, example: '2026-09-27T12:00:00.000Z' })
  timestampUtc!: string;
}

export class ApiErrorResponseDto {
  @ApiProperty({ type: Boolean, example: false })
  success!: false;

  @ApiProperty({ type: String, nullable: true, enum: [null], example: null })
  data!: null;

  @ApiProperty({ type: ApiErrorDto })
  error!: ApiErrorDto;
}
