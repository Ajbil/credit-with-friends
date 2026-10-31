import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class SearchMemberThrottleGuard extends ThrottlerGuard {
  protected override getTracker(request: Record<string, unknown>): Promise<string> {
    if (request.path === '/api/v1/searches' || request.path === '/api/v1/contacts') {
      const caller = request.caller as { memberId?: string } | undefined;
      if (caller?.memberId) return Promise.resolve(caller.memberId);
    }
    return super.getTracker(request);
  }
}
