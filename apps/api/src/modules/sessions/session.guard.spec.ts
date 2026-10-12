import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import type { ApiConfig } from '../../common/config/config.module';
import { Reflector } from '@nestjs/core';
import { describe, expect, test, vi } from 'vitest';
import { OPTIONAL_SESSION_ROUTE, SessionGuard } from './session.guard';
import type { SessionsService } from './sessions.service';

function setup(cookie?: string) {
  const request = { path: '/api/v1/circle-invites/code', headers: { cookie }, caller: undefined as unknown };
  const setHeader = vi.fn();
  const context = {
    getHandler: () => function preview() {}, getClass: () => class Preview {},
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ setHeader }) }),
  } as unknown as ExecutionContext;
  const reflector = { getAllAndOverride: vi.fn((key: string) => key === OPTIONAL_SESSION_ROUTE) } as unknown as Reflector;
  const resolve = vi.fn();
  const cookieHeader = vi.fn(() => 'renewed-cookie');
  const sessions = { resolve, cookie: cookieHeader } as unknown as SessionsService;
  const config = { getOrThrow: () => 'Local' } as unknown as ConfigService<ApiConfig, true>;
  return { guard: new SessionGuard(sessions, reflector, config), context, request, resolve, setHeader };
}

describe('optional session guard', () => {
  test('a missing cookie continues as signed out', async () => {
    const { guard, context, request, resolve, setHeader } = setup();
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.caller).toBeUndefined();
    expect(resolve).not.toHaveBeenCalled();
    expect(setHeader).not.toHaveBeenCalled();
  });

  test.each(['invalid', 'expired'])('%s session cookies continue as signed out', async (reason) => {
    const { guard, context, request, resolve, setHeader } = setup('cwf_session=stale');
    resolve.mockRejectedValue(new UnauthorizedException(reason));
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.caller).toBeUndefined();
    expect(setHeader).not.toHaveBeenCalled();
  });

  test('a valid cookie supplies the caller and renews the session', async () => {
    const { guard, context, request, resolve, setHeader } = setup('cwf_session=valid');
    const caller = { sessionId: 'session', memberId: 'member', pendingSignInId: null };
    resolve.mockResolvedValue({ caller, token: 'new-token' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.caller).toBe(caller);
    expect(setHeader).toHaveBeenCalledWith('Set-Cookie', 'renewed-cookie');
  });
});
