import { Controller, Get, NotImplementedException, Post, SetMetadata } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/api/api.dto';
import { PUBLIC_ROUTE } from '../../sessions/session.guard';

@ApiTags('Circle invites')
@Controller('circle-invites')
export class JoinCircleController {
  @Get(':code')
  @SetMetadata(PUBLIC_ROUTE, true)
  @ApiOperation({ summary: 'Preview an invite' })
  @ApiParam({ name: 'code', type: String, example: 'ZJUnCsFn69xUJxhBPxJg6A' })
  @ApiResponse({ status: 501, type: ApiErrorResponseDto, description: 'Available in the join task.' })
  preview(): never { throw new NotImplementedException(); }

  @Post(':code/join')
  @ApiCookieAuth('cwf_session')
  @ApiOperation({ summary: 'Join through an active invite' })
  @ApiParam({ name: 'code', type: String, example: 'ZJUnCsFn69xUJxhBPxJg6A' })
  @ApiResponse({ status: 501, type: ApiErrorResponseDto, description: 'Available in the join task.' })
  join(): never { throw new NotImplementedException(); }
}
