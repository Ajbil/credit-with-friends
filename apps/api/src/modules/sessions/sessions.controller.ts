import { Controller, Inject, Post, Req, Res, SetMetadata } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiConfig } from '../../common/config/config.module';
import { AuthenticatedRequest, PENDING_ROUTE } from './session.guard';
import { SessionsService } from './sessions.service';
import { ApiErrorResponseDto } from '../../common/api/api.dto';
import { SignOutResponseDto } from './dto/sign-out-response.dto';

@ApiTags('Sessions')
@ApiCookieAuth('cwf_session')
@Controller('sessions')
export class SessionsController {
  constructor(@Inject(SessionsService) private readonly sessions: SessionsService, @Inject(ConfigService) private readonly config: ConfigService<ApiConfig, true>) {}

  @Post('sign-out')
  @SetMetadata(PENDING_ROUTE, true)
  @ApiOperation({ summary: 'Sign out of this device' })
  @ApiCreatedResponse({ type: SignOutResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async signOut(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response): Promise<{ signedOut: true }> {
    await this.sessions.signOut(request.caller.sessionId);
    response.setHeader('Set-Cookie', this.sessions.clearCookie(this.config.getOrThrow('environment') === 'Production'));
    return { signedOut: true };
  }
}
