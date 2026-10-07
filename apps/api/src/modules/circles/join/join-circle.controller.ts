import { Controller, Get, HttpCode, Inject, Param, Post, Req, SetMetadata } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PinoLogger } from 'nestjs-pino';
import { ApiErrorResponseDto } from '../../../common/api/api.dto';
import { PrismaService } from '../../../common/database/prisma.service';
import { ServiceBus } from '../../../service-bus/service-bus.service';
import { AuthenticatedRequest, INCOMPLETE_ACCOUNT_ROUTE, OPTIONAL_SESSION_ROUTE, OptionalSessionRequest } from '../../sessions/session.guard';
import { InvitePreviewResponseDto, JoinCircleResponseDto } from './join-circle.dto';
import { joinCircle, previewInvite } from './join-circle.service';

@ApiTags('Circle invites')
@Controller('circle-invites')
export class JoinCircleController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(ServiceBus) private readonly bus: ServiceBus, @Inject(PinoLogger) private readonly logger: PinoLogger) {}

  @Get(':code')
  @SetMetadata(OPTIONAL_SESSION_ROUTE, true)
  @ApiOperation({ summary: 'Preview an invite' })
  @ApiParam({ name: 'code', type: String, example: 'ZJUnCsFn69xUJxhBPxJg6A' })
  @ApiOkResponse({ type: InvitePreviewResponseDto, description: 'Valid link: require an account, preview name and member count, or return the circle ID for an existing member.' })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto, description: 'FORBIDDEN: a removed member cannot rejoin.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'INVITE_LINK_INVALID: This invite link is no longer valid. Ask the person who shared it for a new one.' })
  preview(@Param('code') code: string, @Req() request: OptionalSessionRequest) { return previewInvite(this.db, code, request.caller?.memberId ?? undefined); }

  @Post(':code/join')
  @HttpCode(200)
  @SetMetadata(INCOMPLETE_ACCOUNT_ROUTE, true)
  @ApiCookieAuth('cwf_session')
  @ApiOperation({ summary: 'Join through an active invite' })
  @ApiParam({ name: 'code', type: String, example: 'ZJUnCsFn69xUJxhBPxJg6A' })
  @ApiOkResponse({ type: JoinCircleResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'UNAUTHORIZED: sign in before joining.' })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto, description: 'ACCOUNT_INCOMPLETE: sign in and finish onboarding before joining.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'INVITE_LINK_INVALID: the link is unknown, malformed, reset or deleted.' })
  @ApiResponse({ status: 409, type: ApiErrorResponseDto, description: 'CIRCLE_FULL or TOO_MANY_CIRCLES: joining would exceed the 100-member or 20-circle limit.' })
  join(@Param('code') code: string, @Req() request: AuthenticatedRequest) { return joinCircle(this.db, this.bus, this.logger, code, request.caller.memberId); }
}
