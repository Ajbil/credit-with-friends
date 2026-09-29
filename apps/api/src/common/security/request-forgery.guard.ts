import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiConfig } from '../config/config.module';

type RequestHeaders = { method: string; get(name: string): string | undefined };

@Injectable()
export class RequestForgeryGuard implements CanActivate {
  constructor(@Inject(ConfigService) private readonly config: ConfigService<ApiConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestHeaders>();
    if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) return true;
    if (request.get('x-requested-with') !== 'cwf' || request.get('origin') !== this.config.getOrThrow('webOrigin')) {
      throw new ForbiddenException();
    }
    return true;
  }
}
