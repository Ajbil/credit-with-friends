import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBody, ApiCookieAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../common/api/api.dto';
import { AuthenticatedRequest } from '../sessions/session.guard';
import { AcceptNoticeDto } from './dto/accept-notice.dto';
import { AcceptedNoticeResponseDto } from './dto/accepted-notice-response.dto';
import { PrivacyNoticeService } from './privacy-notice.service';

@ApiTags('Privacy notice')
@ApiCookieAuth('cwf_session')
@Controller('privacy-notice')
export class PrivacyNoticeController {
  constructor(@Inject(PrivacyNoticeService) private readonly notices: PrivacyNoticeService) {}

  @Post('accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accept the current privacy notice' })
  @ApiBody({ type: AcceptNoticeDto })
  @ApiOkResponse({ type: AcceptedNoticeResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  accept(@Req() request: AuthenticatedRequest, @Body() body: AcceptNoticeDto) {
    return this.notices.accept(request.caller.memberId!, body);
  }
}
