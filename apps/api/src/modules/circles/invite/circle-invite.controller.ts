import { Controller, Get, NotImplementedException, Post } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/api/api.dto';
import { CircleInviteResponseDto, RecordInviteDto, RecordedInviteResponseDto } from './circle-invite.dto';

@ApiTags('Circle invites')
@ApiCookieAuth('cwf_session')
@Controller('circles/:circleId/invite')
export class CircleInviteController {
  @Get()
  @ApiOperation({ summary: 'Get the active invite link as circle admin' })
  @ApiParam({ name: 'circleId', type: String, example: '01960463-1700-7000-8000-000000000001' })
  @ApiOkResponse({ type: CircleInviteResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'UNAUTHORIZED: sign in to get the invite link.' })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto, description: 'FORBIDDEN: only the circle admin can get the invite link.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'NOT_FOUND: the circle does not exist.' })
  @ApiResponse({ status: 501, type: ApiErrorResponseDto, description: 'Available in the invite task.' })
  get(): never { throw new NotImplementedException(); }

  @Post('reset')
  @ApiOperation({ summary: 'Reset the invite link as circle admin' })
  @ApiParam({ name: 'circleId', type: String, example: '01960463-1700-7000-8000-000000000001' })
  @ApiOkResponse({ type: CircleInviteResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'UNAUTHORIZED: sign in to reset the invite link.' })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto, description: 'FORBIDDEN: only the circle admin can reset the invite link.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'NOT_FOUND: the circle does not exist.' })
  @ApiResponse({ status: 501, type: ApiErrorResponseDto, description: 'Available in the invite task.' })
  reset(): never { throw new NotImplementedException(); }

  @Post('record')
  @ApiOperation({ summary: 'Record a copy or WhatsApp share tap' })
  @ApiParam({ name: 'circleId', type: String, example: '01960463-1700-7000-8000-000000000001' })
  @ApiBody({ type: RecordInviteDto })
  @ApiOkResponse({ type: RecordedInviteResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto, description: 'VALIDATION_ERROR: action must be copy or whatsapp.' })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'UNAUTHORIZED: sign in to record an invite tap.' })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto, description: 'FORBIDDEN: only the circle admin can copy or share the invite.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'NOT_FOUND: the circle does not exist.' })
  @ApiResponse({ status: 501, type: ApiErrorResponseDto, description: 'Available in the invite task.' })
  record(): never { throw new NotImplementedException(); }
}
