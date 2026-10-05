import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/api/api.dto';
import { PrismaService } from '../../../common/database/prisma.service';
import { ServiceBus } from '../../../service-bus/service-bus.service';
import { AuthenticatedRequest } from '../../sessions/session.guard';
import { ViewCircleResponseDto } from './view-circle.dto';
import { viewCircle } from './view-circle.service';

@ApiTags('Circles')
@ApiCookieAuth('cwf_session')
@Controller('circles')
export class ViewCircleController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(ServiceBus) private readonly bus: ServiceBus) {}

  @Get(':circleId')
  @ApiOperation({ summary: 'View a circle and its members' })
  @ApiParam({ name: 'circleId', type: String, example: '01960463-1700-7000-8000-000000000001' })
  @ApiOkResponse({ type: ViewCircleResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'UNAUTHORIZED: sign in to view a circle.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'NOT_FOUND: the circle does not exist or you are not a member.' })
  view(@Param('circleId') circleId: string, @Req() request: AuthenticatedRequest) {
    return viewCircle(this.db, this.bus, circleId, request.caller.memberId!);
  }
}
