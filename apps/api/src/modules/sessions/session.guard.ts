import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { SessionsService, Caller } from './sessions.service';
import { ConfigService } from '@nestjs/config';
import { ApiConfig } from '../../common/config/config.module';

export const PUBLIC_ROUTE = 'publicRoute';
export const PENDING_ROUTE = 'pendingRoute';
export const OPTIONAL_SESSION_ROUTE = 'optionalSessionRoute';
export type AuthenticatedRequest = Request & { caller: Caller };
export type OptionalSessionRequest = Request & { caller?: Caller };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(SessionsService) private readonly sessions: SessionsService, @Inject(Reflector) private readonly reflector: Reflector, @Inject(ConfigService) private readonly config: ConfigService<ApiConfig, true>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) return true;
    const optional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_SESSION_ROUTE, [context.getHandler(), context.getClass()]);
    // Foundation probes and API docs exist only in local/test application wiring.
    if (request.path === '/api/v1/health' || request.path.startsWith('/api/docs') ||
        (this.config.getOrThrow('environment') === 'Local' && request.path.startsWith('/api/v1/test-probe/'))) return true;
    if (optional && !request.headers.cookie?.includes('cwf_session=')) return true;
    let resolved: Awaited<ReturnType<SessionsService['resolve']>>;
    try {
      resolved = await this.sessions.resolve(request.headers.cookie);
    } catch (error) {
      if (optional && error instanceof UnauthorizedException) return true;
      throw error;
    }
    const { caller, token } = resolved;
    request.caller = caller;
    context.switchToHttp().getResponse<Response>().setHeader('Set-Cookie', this.sessions.cookie(token, this.config.getOrThrow('environment') === 'Production'));
    if (!request.caller.memberId && !optional && !this.reflector.getAllAndOverride<boolean>(PENDING_ROUTE, [context.getHandler(), context.getClass()])) {
      throw new ForbiddenException();
    }
    return true;
  }
}
