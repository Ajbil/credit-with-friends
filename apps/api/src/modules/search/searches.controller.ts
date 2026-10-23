import { Body, Controller, HttpCode, Inject, Post, Query, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PinoLogger } from 'nestjs-pino';
import { ApiErrorResponseDto } from '../../common/api/api.dto';
import { PrismaService } from '../../common/database/prisma.service';
import { ServiceBus } from '../../service-bus/service-bus.service';
import { AuthenticatedRequest } from '../sessions/session.guard';
import { SearchCriteriaDto, SearchesResponseDto, parseSearchesQuery } from './searches.dto';
import { searchCards } from './searches.service';

@ApiTags('Search')
@ApiCookieAuth('cwf_session')
@Controller('searches')
export class SearchesController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(ServiceBus) private readonly bus: ServiceBus, @Inject(PinoLogger) private readonly logger: PinoLogger) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Find card holders in your circles', description: 'Searches current shared circles. The variant is accepted only in the request body and is never recorded.' })
  @ApiBody({ type: SearchCriteriaDto })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'Page number, starting at 1.' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, description: 'People per page, at most 100.' })
  @ApiOkResponse({ type: SearchesResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto, description: 'Invalid bank, type, variant, page or limit.' })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'Sign in to search.' })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto, description: 'Finish onboarding before searching.' })
  @ApiResponse({ status: 429, type: ApiErrorResponseDto, description: 'Search rate limit exceeded.' })
  search(@Req() request: AuthenticatedRequest, @Body() body: SearchCriteriaDto, @Query() query: Record<string, unknown>) {
    return searchCards(this.db, this.bus, this.logger, request.caller.memberId!, body, parseSearchesQuery(query));
  }
}
