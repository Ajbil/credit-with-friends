import { BadRequestException, Controller, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/api/api.dto';
import { AuthenticatedRequest } from '../../sessions/session.guard';
import { CIRCLE_ID } from '../core/circle-lock.helper';
import { CircleRemovalsResponseDto } from './circle-removals.dto';
import { CircleRemovalsService } from './circle-removals.service';

function validateId(field: string, value: string): void {
  if (!CIRCLE_ID.test(value)) throw new BadRequestException({ code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field, reason: 'invalid_value' }] } });
}

@ApiTags('Circles')
@ApiCookieAuth('cwf_session')
@Controller('circles')
export class CircleRemovalsController {
  constructor(@Inject(CircleRemovalsService) private readonly removals: CircleRemovalsService) {}

  @Post(':circleId/members/:memberId/remove')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove a circle member', description: 'The circle admin ends a membership and blocks that member from rejoining through any later invite link.' })
  @ApiParam({ name: 'circleId', type: String, example: '01960463-1700-7000-8000-000000000001' })
  @ApiParam({ name: 'memberId', type: String, example: '01960463-1700-7000-8000-000000000002' })
  @ApiOkResponse({ type: CircleRemovalsResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto, description: 'VALIDATION_ERROR: circleId and memberId must be UUIDs.' })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'UNAUTHORIZED: sign in before removing a member.' })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto, description: 'FORBIDDEN: only the admin can remove another member; the admin must leave instead.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'NOT_FOUND: the circle or member is unavailable.' })
  async remove(@Param('circleId') circleId: string, @Param('memberId') memberId: string, @Req() request: AuthenticatedRequest): Promise<null> {
    validateId('circleId', circleId);
    validateId('memberId', memberId);
    await this.removals.remove(circleId, request.caller.memberId!, memberId);
    return null;
  }

  @Post(':circleId/removals/clear')
  @HttpCode(200)
  @ApiOperation({ summary: 'Clear all circle removals', description: 'The circle admin lifts every removal block. Former members must still open an active invite and press Join.' })
  @ApiParam({ name: 'circleId', type: String, example: '01960463-1700-7000-8000-000000000001' })
  @ApiOkResponse({ type: CircleRemovalsResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto, description: 'VALIDATION_ERROR: circleId must be a UUID.' })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'UNAUTHORIZED: sign in before clearing removals.' })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto, description: 'FORBIDDEN: only the circle admin can clear removals.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'NOT_FOUND: the circle is unavailable.' })
  async clear(@Param('circleId') circleId: string, @Req() request: AuthenticatedRequest): Promise<null> {
    validateId('circleId', circleId);
    await this.removals.clear(circleId, request.caller.memberId!);
    return null;
  }
}
