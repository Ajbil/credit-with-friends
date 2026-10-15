import { BadRequestException, Controller, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/api/api.dto';
import { AuthenticatedRequest } from '../../sessions/session.guard';
import { CIRCLE_ID } from '../core/circle-lock.helper';
import { CirclesCoreService } from '../core/circles-core.service';
import { LeaveCircleResponseDto } from './leave-circle.dto';

@ApiTags('Circles')
@ApiCookieAuth('cwf_session')
@Controller('circles')
export class LeaveCircleController {
  constructor(@Inject(CirclesCoreService) private readonly circles: CirclesCoreService) {}

  @Post(':circleId/leave')
  @HttpCode(200)
  @ApiOperation({ summary: 'Leave a circle', description: 'Ends your membership. A valid invite link can be used to join again. The admin role passes to another member, or the empty circle is deleted.' })
  @ApiParam({ name: 'circleId', type: String, example: '01960463-1700-7000-8000-000000000001' })
  @ApiOkResponse({ type: LeaveCircleResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto, description: 'VALIDATION_ERROR: circleId must be a UUID.' })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'UNAUTHORIZED: sign in to leave a circle.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'NOT_FOUND: the circle does not exist or you are not a member.' })
  async leave(@Param('circleId') circleId: string, @Req() request: AuthenticatedRequest): Promise<null> {
    if (!CIRCLE_ID.test(circleId)) throw new BadRequestException({ code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field: 'circleId', reason: 'invalid_value' }] } });
    await this.circles.endMembership(circleId, request.caller.memberId!);
    return null;
  }
}
