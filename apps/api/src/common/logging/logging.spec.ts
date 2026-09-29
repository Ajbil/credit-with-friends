import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import pino from 'pino';
import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { apiPinoOptions } from './logging.config';
import { RequestLoggingMiddleware } from './request-logging.middleware';

describe('RequestLoggingMiddleware', () => {
  it('logs-redact-personal-data', () => {
    const lines: string[] = [];
    const destination = new Writable({ write(chunk, _encoding, callback) { lines.push(String(chunk)); callback(); } });
    const logger = pino(apiPinoOptions('Local'), destination).child({
      correlationId: 'request-correlation-id',
      requestId: 'request-correlation-id',
      req: {
        id: 'request-correlation-id',
        method: 'POST',
        url: '/probe?token=query-secret',
        query: { token: 'query-secret' },
        headers: { authorization: 'Bearer header-secret', cookie: 'cookie-secret' },
        remoteAddress: '203.0.113.42',
        body: { email: 'person@example.in', whatsAppNumber: '+919876543210' },
      },
    }) as unknown as PinoLogger;
    const middleware = new RequestLoggingMiddleware(logger);
    const headers: Array<[string, string]> = [];
    const response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      setHeader: (name: string, value: string) => headers.push([name, value]),
    });
    const request = {
      id: 'request-correlation-id',
      method: 'POST',
      baseUrl: '/api/v1',
      route: { path: '/probe' },
      body: { email: 'person@example.in', whatsAppNumber: '+919876543210' },
      query: { token: 'query-secret' },
      headers: { authorization: 'Bearer header-secret', cookie: 'cookie-secret' },
      cookies: { session: 'cookie-secret' },
    };

    middleware.use(request as never, response as never, vi.fn());
    response.emit('finish');

    const line = lines[0];
    const record = JSON.parse(line) as { correlationId: string; requestId: string; context: Record<string, unknown> };
    expect(record).toMatchObject({
      context: { method: 'POST', route: '/api/v1/probe', status: 200, durationMs: expect.any(Number) },
      correlationId: 'request-correlation-id',
      requestId: 'request-correlation-id',
    });
    expect(line).not.toMatch(/person@example\.in|\+919876543210|query-secret|header-secret|cookie-secret|203\.0\.113\.42/);
    expect(headers).toContainEqual(['X-Correlation-Id', record.correlationId]);
  });
});
