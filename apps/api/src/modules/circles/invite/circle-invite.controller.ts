import { Controller, Get, NotImplementedException, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/api/api.dto';

@ApiTags('Circle invites')
@ApiCookieAuth('cwf_session')
@Controller('circles/:circleId/invite')
export class CircleInviteController {
  @Get()
  @ApiOperation({ summary: 'Get the active invite link as circle admin' })
  @ApiParam({ name: 'circleId', type: String, example: '01960463-1700-7000-8000-000000000001' })
  @ApiResponse({ status: 501, type: ApiErrorResponseDto, description: 'Available in the invite task.' })
  get(): never { throw new NotImplementedException(); }

  @Post('reset')
  @ApiOperation({ summary: 'Reset the invite link as circle admin' })
  @ApiParam({ name: 'circleId', type: String, example: '01960463-1700-7000-8000-000000000001' })
  @ApiResponse({ status: 501, type: ApiErrorResponseDto, description: 'Available in the invite task.' })
  reset(): never { throw new NotImplementedException(); }

  @Post('record')
  @ApiOperation({ summary: 'Record a copy or WhatsApp share tap' })
  @ApiParam({ name: 'circleId', type: String, example: '01960463-1700-7000-8000-000000000001' })
  @ApiResponse({ status: 501, type: ApiErrorResponseDto, description: 'Available in the invite task.' })
  record(): never { throw new NotImplementedException(); }
}
