import { Controller, Get, NotImplementedException } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/api/api.dto';
import { ViewCircleResponseDto } from './view-circle.dto';

@ApiTags('Circles')
@ApiCookieAuth('cwf_session')
@Controller('circles')
export class ViewCircleController {
  @Get(':circleId')
  @ApiOperation({ summary: 'View a circle and its members' })
  @ApiParam({ name: 'circleId', type: String, example: '01960463-1700-7000-8000-000000000001' })
  @ApiOkResponse({ type: ViewCircleResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'UNAUTHORIZED: sign in to view a circle.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'NOT_FOUND: the circle does not exist or you are not a member.' })
  @ApiResponse({ status: 501, type: ApiErrorResponseDto, description: 'Available in the circles view task.' })
  view(): never { throw new NotImplementedException(); }
}
