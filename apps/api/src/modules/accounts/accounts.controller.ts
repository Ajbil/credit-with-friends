import { Body, Controller, ForbiddenException, Get, HttpCode, Inject, Post, Query, Req, Res, SetMetadata } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBody, ApiCookieAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiConfig } from '../../common/config/config.module';
import { AuthenticatedRequest, PENDING_ROUTE, PUBLIC_ROUTE } from '../sessions/session.guard';
import { SessionsService } from '../sessions/sessions.service';
import { AccountsService } from './accounts.service';
import { GoogleProvider } from './google.provider';
import { OnboardingDto } from './dto/onboarding.dto';
import { ApiErrorResponseDto } from '../../common/api/api.dto';
import { ActionResponseDto, MemberResponseDto, NoticeResponseDto, PendingResponseDto } from './dto/account-response.dto';

@ApiTags('Authentication')
@Controller('auth/google')
export class GoogleController {
  constructor(@Inject(GoogleProvider) private readonly google: GoogleProvider, @Inject(AccountsService) private readonly accounts: AccountsService, @Inject(SessionsService) private readonly sessions: SessionsService, @Inject(ConfigService) private readonly config: ConfigService<ApiConfig, true>) {}

  @Get('start')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @SetMetadata(PUBLIC_ROUTE, true)
  @ApiOperation({ summary: 'Start Google sign-in' })
  @ApiQuery({ name: 'returnTo', required: false, type: String, example: '/circles/join/example' })
  @ApiResponse({ status: 302, description: 'Redirects to Google.' })
  async start(@Query('returnTo') returnPath: string | undefined, @Res() response: Response): Promise<void> {
    const flow = await this.google.start(returnPath);
    response.cookie('cwf_oauth', flow.cookie, { httpOnly: true, secure: this.config.getOrThrow('environment') === 'Production', sameSite: 'lax', path: '/api/v1/auth/google', maxAge: 600_000 });
    response.redirect(flow.url);
  }

  @Get('callback')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @SetMetadata(PUBLIC_ROUTE, true)
  @ApiOperation({ summary: 'Complete Google sign-in' })
  @ApiResponse({ status: 302, description: 'Redirects to the saved path, onboarding, or Not open yet.' })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async callback(@Req() request: Request, @Res() response: Response): Promise<void> {
    const oauthCookie = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('cwf_oauth='))?.slice('cwf_oauth='.length);
    const query = Object.fromEntries(Object.entries(request.query).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    const { identity, returnPath } = await this.google.callback(query, oauthCookie);
    let result;
    try {
      result = await this.accounts.signIn(identity, request.headers['user-agent'], returnPath);
    } catch (error) {
      if (error instanceof ForbiddenException && typeof error.getResponse() === 'object' && (error.getResponse() as { code?: string }).code === 'NOT_OPEN_YET') {
        response.clearCookie('cwf_oauth', { path: '/api/v1/auth/google' });
        response.redirect(`${this.config.getOrThrow('webOrigin')}/not-open-yet`);
        return;
      }
      throw error;
    }
    const secure = this.config.getOrThrow('environment') === 'Production';
    response.setHeader('Set-Cookie', [this.sessions.cookie(result.token, secure), 'cwf_oauth=; HttpOnly; SameSite=Lax; Path=/api/v1/auth/google; Max-Age=0']);
    const destination = result.status === 'pending' ? `/onboarding?returnTo=${encodeURIComponent(result.returnPath)}` : result.returnPath;
    response.redirect(new URL(destination, this.config.getOrThrow('webOrigin')).toString());
  }
}

@ApiTags('Accounts')
@Controller()
export class AccountsController {
  constructor(@Inject(AccountsService) private readonly accounts: AccountsService, @Inject(SessionsService) private readonly sessions: SessionsService, @Inject(ConfigService) private readonly config: ConfigService<ApiConfig, true>) {}

  @Get('sign-ins')
  @ApiCookieAuth('cwf_session')
  @SetMetadata(PENDING_ROUTE, true)
  @ApiOperation({ summary: 'Get pending sign-in information' })
  @ApiOkResponse({ type: PendingResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  pending(@Req() request: AuthenticatedRequest) { return this.accounts.pending(request.caller); }

  @Get('privacy-notice')
  @SetMetadata(PUBLIC_ROUTE, true)
  @ApiOperation({ summary: 'Read the current privacy notice' })
  @ApiOkResponse({ type: NoticeResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  notice() { return this.accounts.notice(); }

  @Post('onboarding')
  @ApiCookieAuth('cwf_session')
  @HttpCode(200)
  @SetMetadata(PENDING_ROUTE, true)
  @ApiOperation({ summary: 'Complete onboarding and join' })
  @ApiBody({ type: OnboardingDto })
  @ApiOkResponse({ type: MemberResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  onboard(@Req() request: AuthenticatedRequest, @Body() body: OnboardingDto) { return this.accounts.onboard(request.caller, body); }

  @Post('sign-ins/cancel')
  @ApiCookieAuth('cwf_session')
  @HttpCode(200)
  @SetMetadata(PENDING_ROUTE, true)
  @ApiOperation({ summary: 'Cancel and remove pending sign-in' })
  @ApiOkResponse({ type: ActionResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async cancel(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    const result = await this.accounts.cancel(request.caller);
    response.setHeader('Set-Cookie', this.sessions.clearCookie(this.config.getOrThrow('environment') === 'Production'));
    return result;
  }

  @Get('members/me')
  @ApiCookieAuth('cwf_session')
  @ApiOperation({ summary: 'Read your own member account' })
  @ApiOkResponse({ type: MemberResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  me(@Req() request: AuthenticatedRequest) { return this.accounts.profile(request.caller.memberId!); }
}
