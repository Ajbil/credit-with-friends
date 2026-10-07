import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/api/api.dto';
import { PrismaService } from '../../../common/database/prisma.service';
import { AuthenticatedRequest } from '../../sessions/session.guard';
import { ListCirclesResponseDto, parseListCirclesQuery } from './list-circles.dto';
import { listCircles } from './list-circles.service';

@ApiTags('Circles')
@ApiCookieAuth('cwf_session')
@Controller('circles')
export class ListCirclesController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List your circles' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'Page number, starting at 1.' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, description: 'Items per page, at most 100.' })
  @ApiOkResponse({ type: ListCirclesResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto, description: 'VALIDATION_ERROR: page or limit is invalid.' })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'UNAUTHORIZED: sign in to list your circles.' })
  list(@Req() request: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    return listCircles(this.db, request.caller.memberId!, parseListCirclesQuery(query));
  }
}
