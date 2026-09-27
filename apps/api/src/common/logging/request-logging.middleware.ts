import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

type RequestContext = Request & {
  correlationId?: string;
  id?: string | number;
  requestId?: string;
  route?: { path?: string | string[] };
};

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(@Inject(PinoLogger) private readonly logger: PinoLogger) {}

  use(request: RequestContext, response: Response, next: NextFunction): void {
    const correlationId = request.id === undefined ? randomUUID() : String(request.id);
    request.correlationId = correlationId;
    request.requestId = correlationId;
    response.setHeader('X-Correlation-Id', correlationId);
    const startedAt = Date.now();

    response.once('finish', () => {
      const path = request.route?.path;
      const route = path
        ? `${request.baseUrl}/${Array.isArray(path) ? path.join('|') : path}`.replace(/\/+/g, '/')
        : 'unmatched';
      this.logger.info({
        context: { method: request.method, route, status: response.statusCode, durationMs: Date.now() - startedAt },
      }, 'API request completed');
    });

    next();
  }
}
