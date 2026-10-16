import { BadRequestException, Body, Controller, Delete, HttpCode, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/api/api.dto';
import { PrismaService } from '../../../common/database/prisma.service';
import { AuthenticatedRequest } from '../../sessions/session.guard';
import { CIRCLE_ID } from '../core/circle-lock.helper';
import { HandOverCircleDto, ManageCircleResponseDto, RenameCircleDto, RenameCircleResponseDto } from './circle-manage.dto';
import { deleteManagedCircle, handOverCircle, parseRenameName, renameCircle } from './circle-manage.service';

function validateCircleId(circleId: string): void {
  if (!CIRCLE_ID.test(circleId)) throw new BadRequestException({ code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field: 'circleId', reason: 'invalid_value' }] } });
}

@ApiTags('Circles')
@ApiCookieAuth('cwf_session')
@Controller('circles')
export class CircleManageController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  @Patch(':circleId')
  @ApiOperation({ summary: 'Rename a circle as admin' })
  @ApiParam({ name: 'circleId', type: String, example: '01960463-1700-7000-8000-000000000001' })
  @ApiBody({ type: RenameCircleDto })
  @ApiOkResponse({ type: RenameCircleResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto, description: 'VALIDATION_ERROR: circleId must be a UUID and name must be 1 to 40 characters.' })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'UNAUTHORIZED: sign in to rename a circle.' })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto, description: 'CIRCLE_ADMIN_ONLY: only the circle admin can rename it.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'NOT_FOUND: the circle is unavailable or you are not a member.' })
  rename(@Param('circleId') circleId: string, @Body() body: RenameCircleDto, @Req() request: AuthenticatedRequest) {
    validateCircleId(circleId);
    const name = parseRenameName(body?.name);
    return renameCircle(this.db, circleId, request.caller.memberId!, name);
  }

  @Post(':circleId/handover')
  @HttpCode(200)
  @ApiOperation({ summary: 'Hand circle admin role to another member' })
  @ApiParam({ name: 'circleId', type: String, example: '01960463-1700-7000-8000-000000000001' })
  @ApiBody({ type: HandOverCircleDto })
  @ApiOkResponse({ type: ManageCircleResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto, description: 'VALIDATION_ERROR: circleId and memberId must be UUIDs.' })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'UNAUTHORIZED: sign in to hand over a circle.' })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto, description: 'CIRCLE_ADMIN_ONLY or CANNOT_HAND_OVER_TO_SELF: only the admin may hand the role to someone else.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'NOT_FOUND or HANDOVER_MEMBER_NOT_FOUND: the circle or new admin is unavailable.' })
  async handover(@Param('circleId') circleId: string, @Body() body: HandOverCircleDto, @Req() request: AuthenticatedRequest): Promise<null> {
    validateCircleId(circleId);
    if (!body || !CIRCLE_ID.test(body.memberId)) throw new BadRequestException({ code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field: 'memberId', reason: 'invalid_value' }] } });
    await handOverCircle(this.db, circleId, request.caller.memberId!, body.memberId);
    return null;
  }

  @Delete(':circleId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Permanently delete a circle as admin', description: 'Ends every membership and invite link while keeping past usage events.' })
  @ApiParam({ name: 'circleId', type: String, example: '01960463-1700-7000-8000-000000000001' })
  @ApiOkResponse({ type: ManageCircleResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto, description: 'VALIDATION_ERROR: circleId must be a UUID.' })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'UNAUTHORIZED: sign in to delete a circle.' })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto, description: 'CIRCLE_ADMIN_ONLY: only the circle admin can delete it.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'NOT_FOUND: the circle is unavailable or you are not a member.' })
  async delete(@Param('circleId') circleId: string, @Req() request: AuthenticatedRequest): Promise<null> {
    validateCircleId(circleId);
    await deleteManagedCircle(this.db, circleId, request.caller.memberId!);
    return null;
  }
}
