import { BadRequestException, Controller, Get, Inject, Param, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../common/api/api.dto';
import { PrismaService } from '../../common/database/prisma.service';
import { ServiceBus } from '../../service-bus/service-bus.service';
import { AuthenticatedRequest } from '../sessions/session.guard';
import { MemberCardsResponseDto } from './member-cards.dto';
import { viewMemberCards } from './member-cards.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@ApiTags('Search')
@ApiCookieAuth('cwf_session')
@Controller('circles/:circleId/members/:memberId/cards')
export class MemberCardsController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(ServiceBus) private readonly bus: ServiceBus) {}

  @Get()
  @ApiOperation({ summary: 'View a circle member’s cards', description: 'Shows a current member’s cards only while you both belong to this circle.' })
  @ApiParam({ name: 'circleId', type: String, example: '01960463-1700-7000-8000-000000000001' })
  @ApiParam({ name: 'memberId', type: String, example: '01960463-1700-7000-8000-000000000002' })
  @ApiOkResponse({ type: MemberCardsResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto, description: 'VALIDATION_ERROR: circleId and memberId must be UUIDs.' })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'UNAUTHORIZED: sign in to view cards.' })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto, description: 'Finish onboarding before viewing cards.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'NOT_FOUND: the circle or member is unavailable to you.' })
  view(@Param('circleId') circleId: string, @Param('memberId') memberId: string, @Req() request: AuthenticatedRequest) {
    for (const [field, value] of [['circleId', circleId], ['memberId', memberId]]) {
      if (!UUID.test(value)) throw new BadRequestException({ code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field, reason: 'invalid_value' }] } });
    }
    return viewMemberCards(this.db, this.bus, circleId, request.caller.memberId!, memberId);
  }
}
