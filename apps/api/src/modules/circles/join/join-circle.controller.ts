import { Controller, Get, NotImplementedException, Post, SetMetadata } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/api/api.dto';
import { PUBLIC_ROUTE } from '../../sessions/session.guard';
import { InvitePreviewResponseDto, JoinCircleResponseDto } from './join-circle.dto';

@ApiTags('Circle invites')
@Controller('circle-invites')
export class JoinCircleController {
  @Get(':code')
  @SetMetadata(PUBLIC_ROUTE, true)
  @ApiOperation({ summary: 'Preview an invite' })
  @ApiParam({ name: 'code', type: String, example: 'ZJUnCsFn69xUJxhBPxJg6A' })
  @ApiOkResponse({ type: InvitePreviewResponseDto, description: 'Valid link: preview name and member count, or return the circle ID for an existing member.' })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'UNAUTHORIZED: sign in and complete onboarding, then return to the invite.' })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto, description: 'FORBIDDEN: a removed member cannot rejoin.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'INVITE_LINK_INVALID: This invite link is no longer valid. Ask the person who shared it for a new one.' })
  @ApiResponse({ status: 501, type: ApiErrorResponseDto, description: 'Available in the join task.' })
  preview(): never { throw new NotImplementedException(); }

  @Post(':code/join')
  @ApiCookieAuth('cwf_session')
  @ApiOperation({ summary: 'Join through an active invite' })
  @ApiParam({ name: 'code', type: String, example: 'ZJUnCsFn69xUJxhBPxJg6A' })
  @ApiOkResponse({ type: JoinCircleResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'UNAUTHORIZED: sign in before joining.' })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto, description: 'ACCOUNT_INCOMPLETE: sign in and finish onboarding before joining.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'INVITE_LINK_INVALID: the link is unknown, malformed, reset or deleted.' })
  @ApiResponse({ status: 409, type: ApiErrorResponseDto, description: 'CIRCLE_FULL or TOO_MANY_CIRCLES: joining would exceed the 100-member or 20-circle limit.' })
  @ApiResponse({ status: 501, type: ApiErrorResponseDto, description: 'Available in the join task.' })
  join(): never { throw new NotImplementedException(); }
}
