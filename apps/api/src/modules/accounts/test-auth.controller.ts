import { Body, Controller, Inject, Post, Req, Res, SetMetadata } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiConfig } from '../../common/config/config.module';
import { PUBLIC_ROUTE } from '../sessions/session.guard';
import { SessionsService } from '../sessions/sessions.service';
import { AccountsService } from './accounts.service';
import { TestSignInDto } from './dto/test-sign-in.dto';

@ApiExcludeController()
@Controller('test-auth')
export class TestAuthController {
  constructor(@Inject(AccountsService) private readonly accounts: AccountsService, @Inject(SessionsService) private readonly sessions: SessionsService, @Inject(ConfigService) private readonly config: ConfigService<ApiConfig, true>) {}

  @Post('sign-in')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @SetMetadata(PUBLIC_ROUTE, true)
  async signIn(@Body() input: TestSignInDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.accounts.signIn({ googleAccountId: input.googleAccountId, email: input.email, name: input.name, emailVerified: true }, request.headers['user-agent'], input.returnPath);
    response.setHeader('Set-Cookie', this.sessions.cookie(result.token, this.config.getOrThrow('environment') === 'Production'));
    return { status: result.status, returnPath: result.returnPath };
  }
}
