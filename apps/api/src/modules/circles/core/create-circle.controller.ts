import { Body, Controller, Inject, Post, Req } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/api/api.dto';
import { AuthenticatedRequest } from '../../sessions/session.guard';
import { CirclesCoreService } from './circles-core.service';
import { CircleResponseDto, CreateCircleDto } from './create-circle.dto';

@ApiTags('Circles')
@ApiCookieAuth('cwf_session')
@Controller('circles')
export class CreateCircleController {
  constructor(@Inject(CirclesCoreService) private readonly circles: CirclesCoreService) {}

  @Post()
  @ApiOperation({ summary: 'Create a circle' })
  @ApiBody({ type: CreateCircleDto })
  @ApiCreatedResponse({ type: CircleResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateCircleDto) {
    return this.circles.create(request.caller.memberId!, body);
  }
}
