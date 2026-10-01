import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest, PENDING_ROUTE, PUBLIC_ROUTE } from '../sessions/session.guard';
import { PrivacyNoticeService } from './privacy-notice.service';

@Injectable()
export class PrivacyNoticeGuard implements CanActivate {
  constructor(@Inject(PrivacyNoticeService) private readonly notices: PrivacyNoticeService, @Inject(Reflector) private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()]) ||
        this.reflector.getAllAndOverride<boolean>(PENDING_ROUTE, [context.getHandler(), context.getClass()]) ||
        request.path === '/api/v1/health' || request.path.startsWith('/api/docs') || request.path.startsWith('/api/v1/test-probe/') ||
        request.path === '/api/v1/sessions/sign-out' || request.path === '/api/v1/privacy-notice/accept') return true;
    if (request.caller?.memberId && await this.notices.requiresAcceptance(request.caller.memberId)) {
      throw new ForbiddenException({ code: 'PRIVACY_NOTICE_REQUIRED', message: 'Accept the current privacy notice to continue.' });
    }
    return true;
  }
}
