import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Inject, NotFoundException, Param, Post, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/api/api.dto';
import { ApiConfig } from '../../../common/config/config.module';
import { PrismaService } from '../../../common/database/prisma.service';
import { ServiceBus } from '../../../service-bus/service-bus.service';
import { AuthenticatedRequest } from '../../sessions/session.guard';
import { CircleInviteResponseDto, RecordInviteDto, RecordedInviteResponseDto } from './circle-invite.dto';

@ApiTags('Circle invites')
@ApiCookieAuth('cwf_session')
@Controller('circles/:circleId/invite')
export class CircleInviteController {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ServiceBus) private readonly bus: ServiceBus,
    @Inject(ConfigService) private readonly config: ConfigService<ApiConfig, true>,
  ) {}

  private async adminCircle(circleId: string, memberId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(circleId)) throw new NotFoundException();
    const circle = await this.db.circle.findUnique({ where: { id: circleId }, select: { id: true, name: true, inviteCode: true, adminMemberId: true, deletedAtUtc: true } });
    if (!circle || circle.deletedAtUtc) throw new NotFoundException();
    if (circle.adminMemberId !== memberId) throw new ForbiddenException();
    return circle;
  }

  private url(code: string): string {
    return `${this.config.getOrThrow('webOrigin')}/circles/join/${code}`;
  }

  @Get()
  @ApiOperation({ summary: 'Get the active invite link as circle admin' })
  @ApiParam({ name: 'circleId', type: String, example: '01960463-1700-7000-8000-000000000001' })
  @ApiOkResponse({ type: CircleInviteResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'UNAUTHORIZED: sign in to get the invite link.' })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto, description: 'FORBIDDEN: only the circle admin can get the invite link.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'NOT_FOUND: the circle does not exist.' })
  async get(@Param('circleId') circleId: string, @Req() request: AuthenticatedRequest) {
    const circle = await this.adminCircle(circleId, request.caller.memberId!);
    return { url: this.url(circle.inviteCode!) };
  }

  @Post('reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reset the invite link as circle admin' })
  @ApiParam({ name: 'circleId', type: String, example: '01960463-1700-7000-8000-000000000001' })
  @ApiOkResponse({ type: CircleInviteResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'UNAUTHORIZED: sign in to reset the invite link.' })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto, description: 'FORBIDDEN: only the circle admin can reset the invite link.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'NOT_FOUND: the circle does not exist.' })
  async reset(@Param('circleId') circleId: string, @Req() request: AuthenticatedRequest) {
    const memberId = request.caller.memberId!;
    await this.adminCircle(circleId, memberId);
    const inviteCode = randomBytes(16).toString('base64url');
    const changed = await this.db.circle.updateMany({ where: { id: circleId, adminMemberId: memberId, deletedAtUtc: null }, data: { inviteCode, modifiedByAccountId: memberId } });
    if (!changed.count) throw new ForbiddenException();
    return { url: this.url(inviteCode) };
  }

  @Post('record')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record a copy or WhatsApp share tap' })
  @ApiParam({ name: 'circleId', type: String, example: '01960463-1700-7000-8000-000000000001' })
  @ApiBody({ type: RecordInviteDto })
  @ApiOkResponse({ type: RecordedInviteResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto, description: 'VALIDATION_ERROR: action must be copy or whatsapp.' })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'UNAUTHORIZED: sign in to record an invite tap.' })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto, description: 'FORBIDDEN: only the circle admin can copy or share the invite.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'NOT_FOUND: the circle does not exist.' })
  async record(@Param('circleId') circleId: string, @Req() request: AuthenticatedRequest, @Body() body: RecordInviteDto) {
    if ((body?.action !== 'copy' && body?.action !== 'whatsapp') || Object.keys(body).some((key) => key !== 'action')) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field: 'action', reason: 'Choose copy or WhatsApp.' }] } });
    }
    const memberId = request.caller.memberId!;
    const circle = await this.adminCircle(circleId, memberId);
    let recorded = true;
    try {
      await this.bus.publish('CircleInviteEvent', {
        id: randomUUID(), version: 1, timestampUtc: new Date(), initiatedByAccountId: memberId, data: { circleId },
      });
    } catch {
      // Usage is best effort: a failed count must not block the copy or share.
      recorded = false;
    }
    return {
      recorded,
      ...(body.action === 'whatsapp' ? { whatsappUrl: `https://wa.me/?text=${encodeURIComponent(`Join my ${circle.name} circle on CreditWithFriends: ${this.url(circle.inviteCode!)}`)}` } : {}),
    };
  }
}
