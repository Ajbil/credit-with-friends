import { Controller, Get } from '@nestjs/common';
import { ApiInternalServerErrorResponse, ApiOkResponse, ApiOperation, ApiTags, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { ApiErrorResponseDto, HealthDataDto, HealthResponseDto } from '../../common/api/api.dto';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Check API health', description: 'Returns the readiness of the API process.' })
  @ApiOkResponse({ type: HealthResponseDto, description: 'The API process is ready.' })
  @ApiTooManyRequestsResponse({ type: ApiErrorResponseDto, description: 'The API rate limit was exceeded.' })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto, description: 'The API could not complete the request.' })
  getHealth(): HealthDataDto {
    return { status: 'ok' };
  }
}
